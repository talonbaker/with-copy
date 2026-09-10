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
//
// W7 (docs/tasks/w7-clipboard-preview.md) adds the clipboard slot's opt-in
// preview: the eye control that flips the single global
// `settings.showClipboard` preference (an ordinary store commit, so it
// re-renders and persists like any other setting), and the preview body
// itself, filled in from `ctx.getClipboardPreview()` — main.js's in-memory,
// session-only snapshot of the last clipboard text actually obtained. This
// module never holds that text itself and never touches `localStorage` for
// it: rule 2 of the task ("clipboard content lives in memory only") is
// main.js's to keep, not this one's — piece-card.js only ever reads it
// through `ctx` and writes it into the DOM with `textContent`.

import { renderVariants } from './variants.js';
import { truncatePreview, formatCharCount, formatCheckedAgo } from '../clipboard-preview.js';

const expandedIds = new Set();

// W7: which clipboard pieces currently have their preview expanded past the
// collapsed truncation — *view* state, same reasoning as `expandedIds`
// above (variants). Keyed by piece id rather than a single flag so more
// than one stack's clipboard slot (only ever one visible at a time, but
// each has its own piece id) can remember its own expanded state.
const previewExpandedIds = new Set();

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

// ---------------------------------------------------------------------------
// W7: the clipboard slot's opt-in preview (docs/tasks/w7-clipboard-preview.md,
// spec §3/§7.2). Two independent pieces of DOM: the eye toggle in the bar
// (always present, flips `settings.showClipboard`) and the preview subtree
// (only ever filled in when that setting is on). Both are driven off `ctx`
// rather than any state kept in this module, so `renderPiece` (a full
// rebuild) and the targeted refreshes below (`updateClipboardPreview`,
// called by main.js after a read/paste/demotion that never touches the
// store) produce identical output from the same inputs.
// ---------------------------------------------------------------------------

/** Syncs the eye toggle's pressed state, label, and icon to `settings.showClipboard`. */
function renderClipboardEye(node, ctx) {
  const btn = node.querySelector('[data-action="toggle-clipboard-preview"]');
  if (!btn) return;
  const state = ctx.store.get();
  const showClipboard = Boolean(state.settings && state.settings.showClipboard);
  const label = showClipboard ? 'Hide clipboard preview' : 'Show clipboard preview';
  btn.setAttribute('aria-pressed', String(showClipboard));
  btn.setAttribute('aria-label', label);
  const use = btn.querySelector('use');
  if (use) use.setAttribute('href', showClipboard ? '#icon-eye' : '#icon-eye-off');
}

/**
 * Fills in the clipboard slot's dynamic content for one piece card, per the
 * states table in docs/tasks/w7-clipboard-preview.md: the placeholder
 * (nothing read yet, or a paste is needed), the "clipboard is empty"
 * message, or the truncated/expanded preview text with its character-count
 * and freshness line — plus the shared control's label ("Show clipboard" /
 * "Refresh", each with a "Paste to ..." variant on a device that needs a
 * paste gesture, per the platform strategy in `ctx.getClipboardPreview()`).
 * Reads `state.settings.showClipboard` to decide whether to show the whole
 * preview subtree at all (off: the plain "Your clipboard goes here" slot
 * from before this task, unchanged, no residual controls) or the classic
 * placeholder slot. Every piece of text here is set with `textContent`,
 * never `innerHTML`. Safe to call on a freshly cloned template node (full
 * rebuild) or on an already-mounted one (targeted refresh); idempotent.
 */
function fillClipboardPreview(node, pieceId, ctx) {
  const state = ctx.store.get();
  const showClipboard = Boolean(state.settings && state.settings.showClipboard);

  const oldSlot = node.querySelector('[data-role="clipboard-placeholder"]');
  const preview = node.querySelector('[data-role="clipboard-preview"]');
  if (oldSlot) oldSlot.hidden = showClipboard;
  if (preview) preview.hidden = !showClipboard;
  if (!showClipboard || !preview) return;

  const { text, checkedAt, attemptRead } = ctx.getClipboardPreview();
  const hasText = typeof text === 'string';
  const isEmpty = hasText && text.trim() === '';

  const placeholderEl = preview.querySelector('[data-role="clipboard-preview-placeholder"]');
  const emptyEl = preview.querySelector('[data-role="clipboard-preview-empty"]');
  const bodyEl = preview.querySelector('[data-role="clipboard-preview-body"]');
  const textEl = preview.querySelector('[data-role="clipboard-preview-text"]');
  const moreBtn = preview.querySelector('[data-action="clipboard-preview-expand"]');
  const metaEl = preview.querySelector('[data-role="clipboard-preview-meta"]');
  const controlEl = preview.querySelector('[data-action="clipboard-preview-action"]');

  if (placeholderEl) placeholderEl.hidden = hasText;
  if (emptyEl) emptyEl.hidden = !isEmpty;
  if (bodyEl) bodyEl.hidden = !(hasText && !isEmpty);

  if (hasText && !isEmpty) {
    const collapsed = truncatePreview(text);
    // A stale "expanded" flag from a previous, longer clipboard read is
    // ignored once the current text no longer needs truncating — expanding
    // a text that already fits in full would be meaningless, and this way
    // a shrunk-then-regrown clipboard never gets stuck showing a half state.
    const expanded = collapsed.truncated && previewExpandedIds.has(pieceId);
    const shown = expanded ? text : collapsed.text;

    if (textEl) {
      textEl.textContent = shown;
      textEl.dataset.truncated = String(collapsed.truncated && !expanded);
      textEl.dataset.expanded = String(expanded);
    }
    if (moreBtn) {
      moreBtn.hidden = !collapsed.truncated;
      moreBtn.textContent = expanded ? 'Show less' : 'Show more';
      moreBtn.setAttribute('aria-expanded', String(expanded));
    }
    if (metaEl) {
      const ageMs = typeof checkedAt === 'number' ? Date.now() - checkedAt : 0;
      metaEl.textContent = `${formatCharCount(text.length)} · ${formatCheckedAgo(ageMs)}`;
    }
  } else {
    if (moreBtn) moreBtn.hidden = true;
    if (metaEl) metaEl.textContent = '';
  }

  if (controlEl) {
    const base = hasText ? 'Refresh' : 'Show clipboard';
    const label = attemptRead ? base : `Paste to ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
    if (controlEl.textContent !== label) controlEl.textContent = label;
    controlEl.setAttribute('aria-label', label);
  }
}

/**
 * The eye toggle's click handler: flips `settings.showClipboard`, the
 * single global preference (spec §3), via an ordinary `store.commit` — so
 * it re-renders (this module's own `renderPiece` picks it up on the very
 * next structural render, same as any other setting) and persists exactly
 * like theme/density. Never touches the preview text itself.
 */
export function toggleClipboardPreviewPref(ctx) {
  ctx.store.commit((state) => {
    state.settings.showClipboard = !state.settings.showClipboard;
  });
}

/**
 * The "Show more"/"Show less" control's click handler: toggles this piece's
 * expanded state and refreshes the preview in place — pure view state
 * (see `previewExpandedIds` above), so this never touches the store and
 * never triggers a structural re-render of anything else.
 */
export function toggleClipboardPreviewExpanded(pieceEl, ctx) {
  const pieceId = pieceEl.dataset.id;
  if (previewExpandedIds.has(pieceId)) previewExpandedIds.delete(pieceId);
  else previewExpandedIds.add(pieceId);
  fillClipboardPreview(pieceEl, pieceId, ctx);
}

/**
 * Targeted refresh of one already-mounted clipboard piece card's preview
 * content, for the cases that change what it should show without any store
 * commit of their own: a successful read or paste, a silent strategy
 * demotion, and the periodic freshness-label tick (see main.js). Re-syncs
 * the eye toggle too, harmlessly (`settings.showClipboard` cannot have
 * changed via any of those paths, but it costs nothing to stay honest about
 * what drives this element). No-op if `pieceEl` isn't a clipboard piece
 * card currently in the document.
 */
export function updateClipboardPreview(pieceEl, ctx) {
  if (!pieceEl) return;
  renderClipboardEye(pieceEl, ctx);
  fillClipboardPreview(pieceEl, pieceEl.dataset.id, ctx);
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
    renderClipboardEye(node, ctx);
    fillClipboardPreview(node, piece.id, ctx);
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
