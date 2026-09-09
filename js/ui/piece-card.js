// ui/piece-card.js — renders and updates one piece card (spec §7.2, §5).
//
// A piece card is built by cloning `tpl-piece` (header/footer/text kinds) or
// `tpl-clipboard-piece` (the single clipboard slot). All text content comes
// from state and is set with `textContent`/`.value`, never `innerHTML`, so
// nothing here can be tricked into parsing user text as markup.
//
// Whether a piece's variants region is open is *view* state, not app state:
// it must survive a structural re-render (e.g. toggling a sibling's switch)
// without being written to the store, so it lives in the module-level
// `expandedIds` set below rather than on the piece object.

import { renderVariants } from './variants.js';

const expandedIds = new Set();

const KIND_LABELS = {
  header: 'Header',
  footer: 'Footer',
  text: 'Text',
  clipboard: 'Clipboard',
};

/** Human-readable label for a piece kind, per spec §7.2. */
export function kindLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

/** Whether a piece's variants region is currently expanded. */
export function isExpanded(pieceId) {
  return expandedIds.has(pieceId);
}

const FIELD_SIZING_SUPPORTED =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('field-sizing', 'content');

/**
 * Grows a piece textarea to fit its content. `field-sizing: content` (app.css)
 * already does this in browsers that support it; this is the JS fallback for
 * ones that don't (older WebKit). Never touches `element.style` — the CSP
 * forbids inline styles — instead it grows the `rows` attribute until the
 * content fits without an internal scrollbar.
 */
export function autoGrow(textarea) {
  if (FIELD_SIZING_SUPPORTED || !textarea) return;
  const minRows = Math.max(1, Number(textarea.getAttribute('rows')) || 2);
  textarea.rows = minRows;
  let rows = minRows;
  const maxRows = 200;
  while (textarea.scrollHeight > textarea.clientHeight + 1 && rows < maxRows) {
    rows += 1;
    textarea.rows = rows;
  }
}

function findVariant(piece) {
  return piece.variants.find((v) => v.id === piece.activeVariantId) || piece.variants[0] || null;
}

/**
 * Builds the DOM for one piece card. Does not attach any listeners: all
 * interaction is wired through main.js's single delegated handler.
 */
export function renderPiece(piece, ctx) {
  const isClipboard = piece.kind === 'clipboard';
  const tpl = document.getElementById(isClipboard ? 'tpl-clipboard-piece' : 'tpl-piece');
  const node = tpl.content.firstElementChild.cloneNode(true);

  node.dataset.id = piece.id;
  node.dataset.kind = piece.kind;
  node.dataset.enabled = String(piece.enabled);

  const checkbox = node.querySelector('.wc-switch input[type="checkbox"]');
  if (checkbox) checkbox.checked = piece.enabled;

  if (isClipboard) {
    return node;
  }

  const kindEl = node.querySelector('.wc-kind');
  if (kindEl) kindEl.textContent = kindLabel(piece.kind);

  const variant = findVariant(piece);

  const variantNameEl = node.querySelector('.wc-piece__variantname');
  if (variantNameEl) variantNameEl.textContent = variant ? variant.label || 'Untitled' : '';

  const textarea = node.querySelector('[data-role="text"]');
  if (textarea) {
    textarea.value = variant ? variant.text : '';
  }

  const toggleBtn = node.querySelector('[data-action="toggle-variants"]');
  const variantsRegion = node.querySelector('.wc-variants');
  const expanded = isExpanded(piece.id);
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(expanded));
  if (variantsRegion) {
    variantsRegion.hidden = !expanded;
    if (expanded) renderVariants(variantsRegion, piece, ctx);
  }

  if (textarea) autoGrow(textarea);

  return node;
}

/**
 * Toggles a piece's variants region open/closed in place, without a full
 * stack re-render. Returns the new expanded state.
 */
export function toggleVariantsRegion(pieceEl, ctx) {
  const pieceId = pieceEl.dataset.id;
  const willExpand = !expandedIds.has(pieceId);
  if (willExpand) expandedIds.add(pieceId);
  else expandedIds.delete(pieceId);

  const toggleBtn = pieceEl.querySelector('[data-action="toggle-variants"]');
  const region = pieceEl.querySelector('.wc-variants');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(willExpand));
  if (region) {
    region.hidden = !willExpand;
    if (willExpand) {
      const stack = ctx.getActiveStack(ctx.store.get());
      const piece = stack && stack.pieces.find((p) => p.id === pieceId);
      if (piece) renderVariants(region, piece, ctx);
    }
  }
  return willExpand;
}

/** Enabled switch → commit (structural: affects the assembled output). */
export function setPieceEnabled(pieceId, enabled, ctx) {
  ctx.store.commit((state) => {
    const stack = ctx.getActiveStack(state);
    const piece = stack && stack.pieces.find((p) => p.id === pieceId);
    if (piece) piece.enabled = enabled;
  });
}

/** Keystroke → patch the active variant's text; no re-render. */
export function patchPieceText(pieceId, text, ctx) {
  ctx.store.patch((state) => {
    const stack = ctx.getActiveStack(state);
    const piece = stack && stack.pieces.find((p) => p.id === pieceId);
    const variant = piece && findVariant(piece);
    if (variant) variant.text = text;
  });
}

/** Delete → commit removal, then an undoable that reinserts at the same index. */
export function deletePiece(pieceId, ctx) {
  let removed = null;
  let removedIndex = -1;
  ctx.store.commit((state) => {
    const stack = ctx.getActiveStack(state);
    if (!stack) return;
    const idx = stack.pieces.findIndex((p) => p.id === pieceId);
    if (idx === -1) return;
    removedIndex = idx;
    [removed] = stack.pieces.splice(idx, 1);
  });
  if (!removed) return;

  ctx.undoable({
    message: 'Piece deleted.',
    undo: () => {
      ctx.store.commit((state) => {
        const stack = ctx.getActiveStack(state);
        if (!stack) return;
        const idx = Math.min(removedIndex, stack.pieces.length);
        stack.pieces.splice(idx, 0, removed);
      });
    },
  });
}

/** Appends a new piece of `kind` and returns its id, so the caller can focus it. */
export function addPiece(kind, createPiece, ctx) {
  let newId = null;
  ctx.store.commit((state) => {
    const stack = ctx.getActiveStack(state);
    if (!stack) return;
    const piece = createPiece(kind, '');
    stack.pieces.push(piece);
    newId = piece.id;
  });
  return newId;
}
