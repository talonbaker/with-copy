// ui/stack-view.js — the structural render path (spec §5).
//
// `renderStack` rebuilds the `<ol data-role="stack">` from scratch for the
// active stack on every store `commit`. That's cheap for a list of a few
// dozen cards, but it does destroy and recreate every card's DOM node, so
// whatever had focus (a card's textarea, most often) is preserved by id and
// restored after the rebuild — otherwise a structural change anywhere (e.g.
// toggling one piece's switch) would silently steal focus/cursor from
// whatever the user was typing in.

import { renderPiece } from './piece-card.js';

function captureFocus(listEl) {
  const active = document.activeElement;
  if (!active || !listEl.contains(active)) return null;
  const pieceEl = active.closest('[data-id]');
  if (!pieceEl) return null;
  return {
    pieceId: pieceEl.dataset.id,
    role: active.dataset ? active.dataset.role : undefined,
    selectionStart: 'selectionStart' in active ? active.selectionStart : null,
    selectionEnd: 'selectionEnd' in active ? active.selectionEnd : null,
  };
}

function restoreFocus(listEl, focusInfo) {
  if (!focusInfo || !focusInfo.pieceId) return;
  const pieceEl = listEl.querySelector(`[data-id="${CSS.escape(focusInfo.pieceId)}"]`);
  if (!pieceEl) return;
  const target = focusInfo.role
    ? pieceEl.querySelector(`[data-role="${CSS.escape(focusInfo.role)}"]`)
    : null;
  if (!target) return;
  target.focus();
  if (focusInfo.selectionStart !== null && typeof target.setSelectionRange === 'function') {
    try {
      target.setSelectionRange(focusInfo.selectionStart, focusInfo.selectionEnd);
    } catch {
      // Some input types reject setSelectionRange; losing the caret position
      // is harmless compared to losing focus entirely.
    }
  }
}

/** Rebuilds the piece list for the active stack. */
export function renderStack(state, ctx) {
  const listEl = document.querySelector('[data-role="stack"]');
  if (!listEl) return;
  const stack = ctx.getActiveStack(state);
  if (!stack) return;

  const focusInfo = captureFocus(listEl);
  const scrollY = window.scrollY;

  listEl.textContent = '';
  for (const piece of stack.pieces) {
    listEl.appendChild(renderPiece(piece, ctx));
  }

  restoreFocus(listEl, focusInfo);
  window.scrollTo(0, scrollY);
}
