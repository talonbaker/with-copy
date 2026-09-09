// ui/variants.js — the variant list inside an expanded piece card (spec §3, §7.2).
//
// Rendering clones `tpl-variant-row` per variant; renaming happens inline by
// swapping the row's label `<span>` for a text `<input>` (never `innerHTML`).

import { createVariant } from '../schema.js';

/** Renders the variant rows for `piece` into its (already-visible) `.wc-variants` container. */
export function renderVariants(container, piece, ctx) {
  const list = container.querySelector('.wc-variantlist');
  if (!list) return;
  list.textContent = '';

  const tpl = document.getElementById('tpl-variant-row');
  const radioName = `variant-${piece.id}`;

  for (const variant of piece.variants) {
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.dataset.id = variant.id;

    const radio = row.querySelector('input[type="radio"]');
    if (radio) {
      radio.name = radioName;
      radio.checked = variant.id === piece.activeVariantId;
    }

    const labelEl = row.querySelector('[data-role="variant-label"]');
    if (labelEl) labelEl.textContent = variant.label || 'Untitled';

    if (piece.variants.length <= 1) {
      // The last variant cannot be deleted: hide the control entirely.
      const deleteBtn = row.querySelector('[data-action="delete-variant"]');
      if (deleteBtn) deleteBtn.remove();
    }

    list.appendChild(row);
  }
}

/** Radio select → commit the new active variant. */
export function selectVariant(pieceId, variantId, ctx) {
  ctx.store.commit((state) => {
    const stack = ctx.getActiveStack(state);
    const piece = stack && stack.pieces.find((p) => p.id === pieceId);
    if (piece && piece.variants.some((v) => v.id === variantId)) {
      piece.activeVariantId = variantId;
    }
  });
}

/** Add → commit a new empty variant, make it active, and focus its textarea. */
export function addVariant(pieceId, ctx) {
  let ok = false;
  ctx.store.commit((state) => {
    const stack = ctx.getActiveStack(state);
    const piece = stack && stack.pieces.find((p) => p.id === pieceId);
    if (!piece) return;
    const variant = createVariant('', `Variant ${piece.variants.length + 1}`);
    piece.variants.push(variant);
    piece.activeVariantId = variant.id;
    ok = true;
  });
  if (!ok) return;

  const pieceEl = document.querySelector(
    `[data-role="stack"] [data-id="${CSS.escape(pieceId)}"]`,
  );
  const textarea = pieceEl && pieceEl.querySelector('[data-role="text"]');
  if (textarea) textarea.focus();
}

/** Rename button → swap the label span for an editable input. */
export function beginRenameVariant(row) {
  if (row.querySelector('[data-role="variant-rename-input"]')) return;
  // The label span lives inside the <label class="wc-variant__radio"> that
  // also wraps the radio input; the rename <input> goes *after* that whole
  // <label>, as a sibling in the row, so it is never itself a descendant of
  // a <label> associated with the radio (which would risk the radio
  // absorbing clicks meant for the text field).
  const radioWrap = row.querySelector('.wc-variant__radio');
  const labelEl = row.querySelector('[data-role="variant-label"]');
  if (!radioWrap || !labelEl) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'wc-variant__rename-input';
  input.dataset.role = 'variant-rename-input';
  input.value = labelEl.textContent;
  input.setAttribute('aria-label', 'Variant name');

  labelEl.hidden = true;
  radioWrap.classList.add('wc-variant__radio--renaming');
  radioWrap.after(input);
  input.focus();
  input.select();
}

/** Commits the rename input's value as the variant's new label. */
export function commitRenameVariant(input, ctx) {
  const row = input.closest('[data-id]');
  const pieceEl = input.closest('.wc-piece');
  if (!row || !pieceEl) return;
  const pieceId = pieceEl.dataset.id;
  const variantId = row.dataset.id;
  const label = input.value.trim() || 'Untitled';

  ctx.store.commit((state) => {
    const stack = ctx.getActiveStack(state);
    const piece = stack && stack.pieces.find((p) => p.id === pieceId);
    const variant = piece && piece.variants.find((v) => v.id === variantId);
    if (variant) variant.label = label;
  });
  // The commit above triggers a full stack re-render, which already rebuilds
  // this row from state — nothing left to clean up here.
}

/** Escape while renaming → discard the edit and restore the label span. */
export function cancelRenameVariant(input) {
  const row = input.closest('[data-id]');
  const labelEl = row && row.querySelector('[data-role="variant-label"]');
  const radioWrap = row && row.querySelector('.wc-variant__radio');
  input.remove();
  if (labelEl) labelEl.hidden = false;
  if (radioWrap) radioWrap.classList.remove('wc-variant__radio--renaming');
}

/** Delete → commit removal, then an undoable that reinserts at the same index. */
export function deleteVariant(pieceId, variantId, ctx) {
  let removed = null;
  let removedIndex = -1;
  let priorActiveVariantId = null;

  ctx.store.commit((state) => {
    const stack = ctx.getActiveStack(state);
    const piece = stack && stack.pieces.find((p) => p.id === pieceId);
    if (!piece || piece.variants.length <= 1) return;
    const idx = piece.variants.findIndex((v) => v.id === variantId);
    if (idx === -1) return;
    priorActiveVariantId = piece.activeVariantId;
    removedIndex = idx;
    [removed] = piece.variants.splice(idx, 1);
    if (piece.activeVariantId === variantId) {
      const fallback = piece.variants[Math.min(idx, piece.variants.length - 1)];
      piece.activeVariantId = fallback.id;
    }
  });
  if (!removed) return;

  ctx.undoable({
    message: 'Variant deleted.',
    undo: () => {
      ctx.store.commit((state) => {
        const stack = ctx.getActiveStack(state);
        const piece = stack && stack.pieces.find((p) => p.id === pieceId);
        if (!piece) return;
        const idx = Math.min(removedIndex, piece.variants.length);
        piece.variants.splice(idx, 0, removed);
        piece.activeVariantId = priorActiveVariantId;
      });
    },
  });
}
