// ui/expand.js — the fill-screen editor dialog (spec §7.1, §5).
//
// The dialog is a real <dialog data-role="expand">; it's opened with
// `.showModal()` and can close either via our button (data-action="collapse")
// or the browser's native Escape handling, so `onExpandClosed` — wired to the
// dialog's `close` event in main.js — is the single place that reflects the
// edited text back onto the card, regardless of how the dialog closed.

import { kindLabel, autoGrow } from './piece-card.js';

function dialogEl() {
  return document.querySelector('[data-role="expand"]');
}

function findPiece(ctx, pieceId) {
  const stack = ctx.getActiveStack(ctx.store.get());
  return stack ? stack.pieces.find((p) => p.id === pieceId) : null;
}

function findVariant(piece) {
  return piece.variants.find((v) => v.id === piece.activeVariantId) || piece.variants[0] || null;
}

/** Opens the expand dialog for `pieceId`, bound to its active variant's text. */
export function openExpand(pieceId, ctx) {
  const dialog = dialogEl();
  const piece = findPiece(ctx, pieceId);
  if (!dialog || !piece) return;
  const variant = findVariant(piece);
  if (!variant) return;

  dialog.dataset.pieceId = pieceId;

  const kindEl = dialog.querySelector('[data-role="expand-kind"]');
  if (kindEl) kindEl.textContent = kindLabel(piece.kind);

  const textarea = dialog.querySelector('[data-role="expand-text"]');
  textarea.value = variant.text;

  dialog.showModal();
  textarea.focus();
}

/** Textarea input inside the dialog → patch the store; no re-render. */
export function patchExpandText(textarea, ctx) {
  const dialog = textarea.closest('dialog');
  const pieceId = dialog && dialog.dataset.pieceId;
  if (!pieceId) return;
  ctx.store.patch((state) => {
    const stack = ctx.getActiveStack(state);
    const piece = stack && stack.pieces.find((p) => p.id === pieceId);
    const variant = piece && findVariant(piece);
    if (variant) variant.text = textarea.value;
  });
}

/** Explicit close via the dialog's own button. */
export function closeExpand() {
  const dialog = dialogEl();
  if (dialog && dialog.open) dialog.close();
}

/**
 * Runs whenever the expand dialog closes, however it closed: reflects the
 * (already-patched) text onto the matching card's textarea without a full
 * stack re-render, per spec §5.
 */
export function onExpandClosed(ctx) {
  const dialog = dialogEl();
  const pieceId = dialog && dialog.dataset.pieceId;
  if (!pieceId) return;

  const piece = findPiece(ctx, pieceId);
  if (!piece) return;
  const variant = findVariant(piece);
  if (!variant) return;

  const cardTextarea = document.querySelector(
    `[data-role="stack"] [data-id="${CSS.escape(pieceId)}"] [data-role="text"]`,
  );
  if (cardTextarea) {
    cardTextarea.value = variant.text;
    autoGrow(cardTextarea);
  }
}
