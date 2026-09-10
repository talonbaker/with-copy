// main.js — bootstrap: load state, render, wire every [data-action], and run
// the w/copy action path. See docs/spec/2026-09-09-w-copy-technical-spec.md
// §4.3, §5, §6, §10.
//
// A single delegated listener per event type lives on `document` for the
// whole app's lifetime; nothing here attaches per-card listeners, so
// rebuilding the piece list (stack-view.js) never has to re-wire anything.
// `ctx` is the one thing every ui/*.js module is handed instead of importing
// globals: the store, the toast/undo functions, and `getActiveStack` (kept
// here, not in stack-view.js, so ui modules never need to import each other
// just to look up the active stack).

import { loadState, createStore, saveState, saveLastOutput, loadLastOutput } from './store.js';
import { createPiece } from './schema.js';
import { assemble, shouldSkip } from './merge.js';
import { readText, writeText, writeDeferred, readFromPasteEvent } from './clipboard.js';
import { loadPile, savePile, clearPile, appendChunk, renderPile } from './pile.js';
import { showToast } from './ui/toast.js';
import { undoable } from './ui/undo.js';
import { renderStack } from './ui/stack-view.js';
import {
  toggleVariantsRegion,
  setPieceEnabled,
  patchPieceText,
  deletePiece,
  addPiece,
  autoGrow,
} from './ui/piece-card.js';
import {
  selectVariant,
  addVariant,
  beginRenameVariant,
  commitRenameVariant,
  cancelRenameVariant,
  deleteVariant,
} from './ui/variants.js';
import { openExpand, patchExpandText, closeExpand, onExpandClosed } from './ui/expand.js';
import {
  renderStackList,
  switchStack,
  createNewStack,
  deleteStack,
  beginRenameStackName,
  commitRenameStackName,
  cancelRenameStackName,
} from './ui/side-panel.js';
import {
  renderSettings,
  initVersion,
  setTheme,
  setDensity,
  copyShareLink,
  showQr,
  copyQrLink,
  copyExportJson,
  downloadExportJson,
  applyImportText,
} from './ui/settings.js';
import { decodeStack, parseShareFragment } from './link.js';
import { newId } from './schema.js';

// ---------------------------------------------------------------------------
// Store + root render
// ---------------------------------------------------------------------------

function getActiveStack(state) {
  return state.stacks.find((s) => s.id === state.activeStackId) || null;
}

const { state: initialState, corrupted } = loadState();
const store = createStore({ initial: initialState, save: saveState });

const ctx = {
  store,
  toast: showToast,
  undoable,
  getActiveStack,
};

// ---------------------------------------------------------------------------
// W6: the pile (i/copy) — in-memory mirror of `wcopy.pile`, loaded once at
// startup and kept in sync with every append/clear. Not part of `store`:
// the pile is a transient clipboard-workflow buffer, not application state
// (see js/pile.js's header comment and docs/tasks/w6-icopy-stack.md), so it
// never runs through `createStore` and never triggers a structural render.
// ---------------------------------------------------------------------------

let pileState = loadPile();

function applyRootAttributes(state) {
  const root = document.documentElement;
  const theme = state.settings.theme;
  // "system" leaves data-theme absent, so tokens.css's
  // `@media (prefers-color-scheme: dark)` block alone decides the palette —
  // and keeps tracking the OS setting live, with no JS involved.
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.setAttribute('data-density', state.settings.density);
  const stack = getActiveStack(state);
  if (stack) root.setAttribute('data-accent', stack.accent);
}

function render(state) {
  applyRootAttributes(state);
  const stack = getActiveStack(state);
  const nameEl = document.querySelector('[data-role="stack-name"]');
  if (nameEl) nameEl.textContent = stack ? stack.name : '';
  renderStack(state, ctx);
  renderStackList(state, ctx);
  renderSettings(state, ctx);
}

store.subscribe(render);
render(store.get());
renderPileStrip();

if (corrupted) {
  showToast({ message: "Saved data couldn't be read. Started fresh.", tone: 'error' });
}

// ---------------------------------------------------------------------------
// Share-link import on load (spec §4.5 last paragraph)
// ---------------------------------------------------------------------------

/**
 * Assigns fresh ids to an imported stack and everything inside it — its own
 * id, every piece's id, and every non-clipboard piece's variant ids and
 * `activeVariantId` — so an imported stack can never collide with (or
 * overwrite) anything already in this device's state. `decodeStack` already
 * validated the shape; this only ever touches ids.
 */
function reidStack(original) {
  const stack = structuredClone(original);
  stack.id = newId('stk');
  for (const piece of stack.pieces) {
    const oldActiveVariantId = piece.activeVariantId;
    piece.id = newId('pc');
    if (Array.isArray(piece.variants)) {
      for (const variant of piece.variants) {
        const oldVariantId = variant.id;
        variant.id = newId('var');
        if (oldVariantId === oldActiveVariantId) piece.activeVariantId = variant.id;
      }
    }
  }
  return stack;
}

/**
 * If the URL carries a `#s=...` share fragment, decodes it, re-ids it,
 * appends it to the stack list, makes it active, and toasts "Imported
 * "Name"." with Undo (spec §7.5: success tone, unlike the info-toned
 * `undoable` helper — called via `showToast` directly for that reason).
 * The fragment is cleared with `history.replaceState` either way, so a
 * refresh never re-imports and a failed decode doesn't linger in the URL.
 * Runs once, at load.
 */
async function importFromShareFragment() {
  const encoded = parseShareFragment(location.hash);
  if (!encoded) return;

  const clearFragment = () => {
    history.replaceState(null, '', location.pathname + location.search);
  };

  let decoded;
  try {
    decoded = await decodeStack(encoded);
  } catch {
    clearFragment();
    ctx.toast({ message: "That link didn't contain a valid stack.", tone: 'error' });
    return;
  }

  const imported = reidStack(decoded);
  const previousActiveId = store.get().activeStackId;
  ctx.store.commit((state) => {
    state.stacks.push(imported);
    state.activeStackId = imported.id;
  });
  clearFragment();

  ctx.toast({
    message: `Imported "${imported.name}".`,
    tone: 'success',
    duration: 6000,
    action: {
      label: 'Undo',
      onClick: () => {
        ctx.store.commit((state) => {
          const idx = state.stacks.findIndex((s) => s.id === imported.id);
          if (idx !== -1) state.stacks.splice(idx, 1);
          state.activeStackId = previousActiveId;
        });
      },
    },
  });
}

importFromShareFragment();

// ---------------------------------------------------------------------------
// Panel / add-piece menu (structural chrome, not app state)
// ---------------------------------------------------------------------------

function openPanel() {
  const panel = document.querySelector('[data-role="panel"]');
  if (panel) panel.hidden = false;
}

function closePanel() {
  const panel = document.querySelector('[data-role="panel"]');
  if (panel) panel.hidden = true;
}

function isPanelOpen() {
  const panel = document.querySelector('[data-role="panel"]');
  return Boolean(panel && !panel.hidden);
}

function toggleAddMenu() {
  const menu = document.querySelector('[data-role="add-menu"]');
  const btn = document.querySelector('[data-action="add-piece"]');
  if (!menu) return;
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  if (btn) btn.setAttribute('aria-expanded', String(willOpen));
}

function closeAddMenu() {
  const menu = document.querySelector('[data-role="add-menu"]');
  const btn = document.querySelector('[data-action="add-piece"]');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function isAddMenuOpen() {
  const menu = document.querySelector('[data-role="add-menu"]');
  return Boolean(menu && !menu.hidden);
}

function focusPieceText(pieceId) {
  const pieceEl = document.querySelector(
    `[data-role="stack"] [data-id="${CSS.escape(pieceId)}"]`,
  );
  const textarea = pieceEl && pieceEl.querySelector('[data-role="text"]');
  if (textarea) textarea.focus();
}

function openPasteFallback() {
  const dialog = document.querySelector('[data-role="paste-fallback"]');
  if (!dialog) return;
  dialog.showModal();
  const textarea = dialog.querySelector('[data-role="paste-text"]');
  if (textarea) textarea.focus();
}

// ---------------------------------------------------------------------------
// Action path (spec §6)
// ---------------------------------------------------------------------------

/**
 * THE SEAM (docs/tasks/w6-icopy-stack.md): the one place both w/copy and
 * i/copy obtain the clipboard text they act on. Today this is a direct
 * pass-through to `clipboard.js`'s `readText()` — spec §4.4's desktop-Chrome
 * strategy, the only one this codebase implements so far. W5
 * (`feat/clipboard-streamline`) adds a platform strategy that on iPhone
 * makes the action button itself the paste target instead of calling
 * `readText()`; landing that work only ever needs to change this one
 * function's body, for both buttons at once, because `runWCopy` and
 * `runICopy` below call nothing else to get the clipboard's text.
 * @returns {Promise<string>}
 */
function getClipboardText() {
  return readText();
}

// W6: the kind of action that produced `wcopy.lastOutput`, alongside the
// text `store.js` already tracks under that name. Kept as its own key
// (`wcopy.lastOutputKind`) rather than folded into `wcopy.lastOutput`'s
// value: `store.js` is not a file this task owns (see docs/tasks/
// w6-icopy-stack.md's "Files you own"), and its `saveLastOutput`/
// `loadLastOutput` contract (spec §4.3) is unchanged by this task. The two
// keys are always written together (see `runWCopy` and `runICopy` below),
// so they never disagree about which action produced the current
// `lastOutput` text. Guarded exactly like every localStorage access in
// store.js and pile.js, for the same reasons (Node, private browsing).
const LAST_OUTPUT_KIND_KEY = 'wcopy.lastOutputKind';

/** @returns {'wrap'|'stack'|null} */
function loadLastOutputKind() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(LAST_OUTPUT_KIND_KEY);
  } catch {
    return null;
  }
}

/** @param {'wrap'|'stack'} kind */
function saveLastOutputKind(kind) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LAST_OUTPUT_KIND_KEY, kind);
  } catch {
    // Ignore, same reasoning as store.js's saveLastOutput.
  }
}

/**
 * Maps a genuine clipboard *read* failure (a real ClipboardError from
 * `readText()`, captured independently of `writeDeferred`'s own error
 * handling — see the comment in `runWCopy`) to its toast per spec §7.5.
 */
function reportReadFailure(err) {
  const code = err && err.code;
  if (code === 'DENIED') {
    ctx.toast({ message: 'Clipboard access was blocked. Paste it here instead.', tone: 'error' });
    openPasteFallback();
  } else if (code === 'UNSUPPORTED') {
    ctx.toast({
      message: "This browser can't read the clipboard. Paste it here instead.",
      tone: 'error',
    });
    openPasteFallback();
  } else if (code === 'NOT_FOCUSED') {
    ctx.toast({ message: 'Tap w/copy again.', tone: 'error' });
  } else if (code === 'EMPTY') {
    ctx.toast({ message: 'Your clipboard is empty.', tone: 'error' });
  } else {
    ctx.toast({ message: "Couldn't write to the clipboard. Try again.", tone: 'error' });
  }
}

async function runWCopy() {
  const stack = getActiveStack(store.get());
  if (!stack) return;

  if (!stack.pieces.some((p) => p.enabled)) {
    ctx.toast({ message: 'Nothing to copy. Enable a piece first.', tone: 'error' });
    return;
  }

  const clipboardPiece = stack.pieces.find((p) => p.kind === 'clipboard');
  const clipboardEnabled = Boolean(clipboardPiece && clipboardPiece.enabled);

  if (!clipboardEnabled) {
    const result = assemble(stack, '');
    if (!result.ok) {
      ctx.toast({ message: 'Nothing to copy. Enable a piece first.', tone: 'error' });
      return;
    }
    try {
      // writeDeferred is called synchronously here, in the click handler's
      // call stack, per spec §4.4 — even though there's no read to await,
      // every w/copy write goes through the same WebKit-safe path.
      await writeDeferred(Promise.resolve(result.text));
      saveLastOutput(result.text);
      saveLastOutputKind('wrap');
      ctx.toast({ message: 'Wrapped with copy', tone: 'success' });
    } catch {
      ctx.toast({ message: "Couldn't write to the clipboard. Try again.", tone: 'error' });
    }
    return;
  }

  const lastOutput = loadLastOutput();
  // W6: the growth guard must distinguish wrapping from stacking (docs/
  // tasks/w6-icopy-stack.md, "The interaction between i/copy and w/copy") —
  // refuse to wrap what w/copy itself already wrapped, but allow wrapping a
  // pile i/copy just finished writing, even though the clipboard text is
  // identical to `lastOutput` in both cases. `shouldSkip` alone only checks
  // the text; the `lastKind === 'wrap'` half of this is what makes the
  // distinction.
  const lastKind = loadLastOutputKind();
  // Set synchronously, inside our own `.then` below, the instant we decide to
  // abort — so the catch block can trust it regardless of what error object
  // `writeDeferred`/`navigator.clipboard.write` ultimately surfaces once the
  // ClipboardItem's data promise rejects (that plumbing is not ours to
  // change, and browsers are not guaranteed to preserve a custom rejection
  // reason through it).
  let abortReason = null; // 'SKIP' | 'EMPTY_CLIPBOARD' | 'EMPTY_STACK'
  let resolvedText = null;
  // The exact ClipboardError `readText()` itself threw, captured by an
  // independent `.catch` on `textPromise` (promises fan out to any number of
  // listeners) rather than by inspecting whatever `writeDeferred` rejects
  // with, for the same reason.
  let readError = null;

  const textPromise = getClipboardText().then((clipboardText) => {
    if (shouldSkip(clipboardText, lastOutput) && lastKind === 'wrap') {
      abortReason = 'SKIP';
      throw new Error('wcopy: nothing new copied since the last wrap');
    }
    const result = assemble(stack, clipboardText);
    if (!result.ok) {
      abortReason = result.reason;
      throw new Error(`wcopy: ${result.reason}`);
    }
    resolvedText = result.text;
    return result.text;
  });
  textPromise.catch((err) => {
    if (!abortReason) readError = err;
  });

  try {
    await writeDeferred(textPromise);
    saveLastOutput(resolvedText);
    saveLastOutputKind('wrap');
    ctx.toast({ message: 'Wrapped with copy', tone: 'success' });
  } catch {
    if (abortReason === 'SKIP') {
      ctx.toast({ message: 'Already wrapped. Copy something new first.', tone: 'info' });
    } else if (abortReason === 'EMPTY_CLIPBOARD' || abortReason === 'EMPTY_STACK') {
      ctx.toast({ message: 'Your clipboard is empty.', tone: 'error' });
    } else if (readError) {
      reportReadFailure(readError);
    } else {
      ctx.toast({ message: "Couldn't write to the clipboard. Try again.", tone: 'error' });
    }
  }
}

// ---------------------------------------------------------------------------
// W6: i/copy action path — accumulates clipboard chunks into the pile
// instead of wrapping them (docs/tasks/w6-icopy-stack.md "Behaviour").
// Mirrors `runWCopy`'s shape (the same `getClipboardText`/`writeDeferred`
// seam, the same abort-reason/readError bookkeeping around one
// `writeDeferred` call) but assembles nothing: the pile itself, joined with
// the active stack's separator, is the whole output. No header, no footer.
// ---------------------------------------------------------------------------

async function runICopy() {
  const stack = getActiveStack(store.get());
  if (!stack) return; // no active stack to borrow a separator from

  const lastOutput = loadLastOutput();
  // Refuse to stack what i/copy itself already stacked, but allow stacking a
  // fresh chunk even if its text happens to equal a *wrap*'s last output —
  // the mirror image of `runWCopy`'s guard, same reasoning.
  const lastKind = loadLastOutputKind();

  let abortReason = null; // 'SKIP' | 'EMPTY'
  let nextPile = null;
  let renderedText = null;
  let readError = null;

  const textPromise = getClipboardText().then((clipboardText) => {
    if (shouldSkip(clipboardText, lastOutput) && lastKind === 'stack') {
      abortReason = 'SKIP';
      throw new Error('icopy: nothing new copied since the last stack');
    }
    if (clipboardText.trim() === '') {
      abortReason = 'EMPTY';
      throw new Error('icopy: clipboard is empty');
    }
    nextPile = appendChunk(pileState, clipboardText);
    renderedText = renderPile(nextPile, stack.separator);
    return renderedText;
  });
  textPromise.catch((err) => {
    if (!abortReason) readError = err;
  });

  try {
    await writeDeferred(textPromise);
    pileState = nextPile;
    savePile(pileState);
    saveLastOutput(renderedText);
    saveLastOutputKind('stack');
    renderPileStrip();
    const count = pileState.chunks.length;
    ctx.toast({ message: `Stacked. ${count} ${count === 1 ? 'piece' : 'pieces'}.`, tone: 'success' });
  } catch {
    if (abortReason === 'SKIP') {
      ctx.toast({ message: 'Already stacked. Copy something new first.', tone: 'info' });
    } else if (abortReason === 'EMPTY') {
      ctx.toast({ message: 'Your clipboard is empty.', tone: 'error' });
    } else if (readError) {
      reportReadFailure(readError);
    } else {
      ctx.toast({ message: "Couldn't write to the clipboard. Try again.", tone: 'error' });
    }
  }
}

/**
 * Empties the pile immediately (project rule: no confirmation dialogs,
 * destructive actions apply immediately with Undo). The previous pile is
 * held only in this closure for the Undo window; `clearPile()` drops the
 * persisted copy right away, matching how `deletePiece`/`deleteStack`
 * elsewhere apply the mutation before offering Undo.
 */
function clearPileWithUndo() {
  const previousPile = pileState;
  if (previousPile.chunks.length === 0) return;

  pileState = { chunks: [] };
  clearPile();
  renderPileStrip();

  ctx.undoable({
    message: 'Pile cleared.',
    undo: () => {
      pileState = previousPile;
      savePile(pileState);
      renderPileStrip();
    },
  });
}

function isPilePreviewOpen() {
  const preview = document.querySelector('[data-role="pile-preview"]');
  return Boolean(preview && !preview.hidden);
}

function closePilePreview() {
  const preview = document.querySelector('[data-role="pile-preview"]');
  const toggle = document.querySelector('[data-role="pile-toggle"]');
  if (preview) preview.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function togglePilePreview() {
  if (isPilePreviewOpen()) {
    closePilePreview();
    return;
  }
  const preview = document.querySelector('[data-role="pile-preview"]');
  const toggle = document.querySelector('[data-role="pile-toggle"]');
  if (!preview || !toggle) return;
  preview.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
}

/**
 * Renders the pile strip (count + Clear) and the preview list from
 * `pileState`. Hides both when the pile is empty, per docs/tasks/
 * w6-icopy-stack.md ("visible only when the pile is non-empty"). Rebuilds
 * the preview list's content every time, even while hidden, so it is never
 * stale the next time it's opened.
 */
function renderPileStrip() {
  const strip = document.querySelector('[data-role="pile-strip"]');
  const countEl = document.querySelector('[data-role="pile-count"]');
  const previewList = document.querySelector('[data-role="pile-preview-list"]');
  if (!strip || !countEl) return;

  const count = pileState.chunks.length;
  if (count === 0) {
    strip.hidden = true;
    closePilePreview();
    if (previewList) previewList.textContent = '';
    return;
  }

  strip.hidden = false;
  countEl.textContent = `${count} ${count === 1 ? 'piece' : 'pieces'} stacked`;

  if (previewList) {
    previewList.textContent = '';
    pileState.chunks.forEach((chunk, i) => {
      const firstLine = chunk.split('\n')[0].trim();
      const li = document.createElement('li');
      li.className = 'wc-pilepreview__item';
      const index = document.createElement('span');
      index.className = 'wc-pilepreview__index';
      index.textContent = String(i + 1);
      const text = document.createElement('span');
      text.className = 'wc-pilepreview__text';
      text.textContent = firstLine === '' ? '(blank)' : firstLine;
      li.append(index, text);
      previewList.appendChild(li);
    });
  }
}

function handlePasteFallback(event) {
  let text;
  try {
    text = readFromPasteEvent(event);
  } catch {
    ctx.toast({ message: 'The pasted content had no text.', tone: 'error' });
    return;
  }

  const stack = getActiveStack(store.get());
  if (!stack) return;
  const result = assemble(stack, text);
  if (!result.ok) {
    ctx.toast({ message: 'Your clipboard is empty.', tone: 'error' });
    return;
  }

  // Called synchronously inside the paste event itself, which is a user
  // gesture on every platform including WebKit — no readText() involved, so
  // a plain writeText is safe here (spec §4.4's "paste fallback").
  writeText(result.text)
    .then(() => {
      saveLastOutput(result.text);
      saveLastOutputKind('wrap');
      const dialog = document.querySelector('[data-role="paste-fallback"]');
      if (dialog) dialog.close();
      ctx.toast({ message: 'Wrapped with copy', tone: 'success' });
    })
    .catch(() => {
      ctx.toast({ message: "Couldn't write to the clipboard. Try again.", tone: 'error' });
    });
}

// ---------------------------------------------------------------------------
// Delegated event wiring — the only listeners this app ever attaches.
// ---------------------------------------------------------------------------

document.addEventListener('click', (event) => {
  const target = event.target;

  if (isAddMenuOpen() && !target.closest('.wc-addwrap')) {
    closeAddMenu();
  }

  const actionEl = target.closest('[data-action]');
  if (!actionEl) return;

  switch (actionEl.dataset.action) {
    case 'open-panel':
      openPanel();
      break;
    case 'close-panel':
      closePanel();
      break;
    case 'open-settings': {
      const dialog = document.querySelector('[data-role="settings"]');
      if (dialog) dialog.showModal();
      initVersion();
      break;
    }
    case 'close-settings': {
      const dialog = document.querySelector('[data-role="settings"]');
      if (dialog) dialog.close();
      break;
    }
    case 'wcopy':
      runWCopy();
      break;
    case 'icopy':
      runICopy();
      break;
    case 'toggle-pile-preview':
      togglePilePreview();
      break;
    case 'clear-pile':
      clearPileWithUndo();
      break;
    case 'add-piece':
      toggleAddMenu();
      break;
    case 'add-piece-kind': {
      const kind = actionEl.dataset.kind;
      closeAddMenu();
      const newId = addPiece(kind, createPiece, ctx);
      if (newId) focusPieceText(newId);
      break;
    }
    case 'toggle-variants': {
      const pieceEl = actionEl.closest('[data-id]');
      if (pieceEl) toggleVariantsRegion(pieceEl, ctx);
      break;
    }
    case 'expand': {
      const pieceEl = actionEl.closest('[data-id]');
      if (pieceEl) openExpand(pieceEl.dataset.id, ctx);
      break;
    }
    case 'collapse':
      closeExpand();
      break;
    case 'delete-piece': {
      const pieceEl = actionEl.closest('[data-id]');
      if (pieceEl) deletePiece(pieceEl.dataset.id, ctx);
      break;
    }
    case 'add-variant': {
      const pieceEl = actionEl.closest('[data-id]');
      if (pieceEl) addVariant(pieceEl.dataset.id, ctx);
      break;
    }
    case 'rename-variant': {
      const row = actionEl.closest('[data-id]');
      if (row) beginRenameVariant(row);
      break;
    }
    case 'delete-variant': {
      const row = actionEl.closest('[data-id]');
      const pieceEl = actionEl.closest('.wc-piece');
      if (row && pieceEl) deleteVariant(pieceEl.dataset.id, row.dataset.id, ctx);
      break;
    }
    case 'close-paste': {
      const dialog = document.querySelector('[data-role="paste-fallback"]');
      if (dialog) dialog.close();
      break;
    }
    case 'switch-stack':
      switchStack(actionEl.dataset.id, ctx);
      closePanel();
      break;
    case 'new-stack': {
      const newId = createNewStack(ctx);
      closePanel();
      if (newId) beginRenameStackName();
      break;
    }
    case 'delete-stack': {
      const row = actionEl.closest('.wc-stackrow');
      if (row) deleteStack(row.dataset.id, ctx);
      break;
    }
    case 'begin-rename-stack':
      beginRenameStackName();
      break;
    case 'export-copy':
      copyExportJson(ctx);
      break;
    case 'export-download':
      downloadExportJson(ctx);
      break;
    case 'import-file': {
      const fileInput = document.querySelector('[data-role="import-file-input"]');
      if (fileInput) fileInput.click();
      break;
    }
    case 'import-apply': {
      const dialog = document.querySelector('[data-role="settings"]');
      const textarea = dialog && dialog.querySelector('[data-role="import-text"]');
      if (textarea) applyImportText(textarea.value, ctx);
      break;
    }
    case 'copy-share-link':
      copyShareLink(ctx);
      break;
    case 'show-qr':
      showQr(ctx);
      break;
    case 'copy-qr-link':
      copyQrLink(ctx);
      break;
    case 'close-qr': {
      const dialog = document.querySelector('[data-role="qr"]');
      if (dialog) dialog.close();
      break;
    }
    default:
      break;
  }
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('.wc-piece .wc-switch input[type="checkbox"]')) {
    const pieceEl = target.closest('[data-id]');
    if (pieceEl) setPieceEnabled(pieceEl.dataset.id, target.checked, ctx);
    return;
  }
  if (target.matches('.wc-variant__radio input[type="radio"]')) {
    const row = target.closest('[data-id]');
    const pieceEl = target.closest('.wc-piece');
    if (row && pieceEl) selectVariant(pieceEl.dataset.id, row.dataset.id, ctx);
    return;
  }
  if (target.matches('[data-role="theme"] input[type="radio"]')) {
    setTheme(target.value, ctx);
    return;
  }
  if (target.matches('[data-role="density"] input[type="radio"]')) {
    setDensity(target.value, ctx);
    return;
  }
  if (target.matches('[data-role="import-file-input"]')) {
    const file = target.files && target.files[0];
    if (file) {
      file.text().then((text) => applyImportText(text, ctx));
    }
    target.value = ''; // allow re-selecting the same file later
  }
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (target.matches('.wc-piece [data-role="text"]')) {
    const pieceEl = target.closest('[data-id]');
    if (pieceEl) {
      patchPieceText(pieceEl.dataset.id, target.value, ctx);
      autoGrow(target);
    }
    return;
  }
  if (target.matches('[data-role="expand-text"]')) {
    patchExpandText(target, ctx);
  }
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target.matches && target.matches('.wc-variant__rename-input')) {
    if (event.key === 'Enter') {
      event.preventDefault();
      target.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      target.dataset.cancelled = 'true';
      cancelRenameVariant(target);
    }
    return;
  }
  if (target.matches && target.matches('.wc-stackname__input')) {
    if (event.key === 'Enter') {
      event.preventDefault();
      target.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      target.dataset.cancelled = 'true';
      cancelRenameStackName(target);
    }
    return;
  }
  // A stack row and the top bar title are not native buttons (a row also
  // hosts its own nested delete button), so give them keyboard activation by
  // reusing the click handler above via a synthetic click.
  if (
    (event.key === 'Enter' || event.key === ' ') &&
    target.matches &&
    target.matches('[data-action="switch-stack"], [data-action="begin-rename-stack"]')
  ) {
    event.preventDefault();
    target.click();
    return;
  }
  if (event.key === 'Escape' && isPanelOpen()) {
    closePanel();
  }
});

document.addEventListener('focusout', (event) => {
  const target = event.target;
  if (target.matches && target.matches('.wc-variant__rename-input')) {
    if (target.dataset.cancelled === 'true') return;
    commitRenameVariant(target, ctx);
    return;
  }
  if (target.matches && target.matches('.wc-stackname__input')) {
    if (target.dataset.cancelled === 'true') return;
    commitRenameStackName(target, ctx);
  }
});

document.addEventListener('paste', (event) => {
  const target = event.target;
  if (!target.matches || !target.matches('[data-role="paste-text"]')) return;
  handlePasteFallback(event);
});

const expandDialog = document.querySelector('[data-role="expand"]');
if (expandDialog) {
  expandDialog.addEventListener('close', () => onExpandClosed(ctx));
}

const pasteDialog = document.querySelector('[data-role="paste-fallback"]');
if (pasteDialog) {
  pasteDialog.addEventListener('close', () => {
    const textarea = pasteDialog.querySelector('[data-role="paste-text"]');
    if (textarea) textarea.value = '';
  });
}

// ---------------------------------------------------------------------------
// PWA: service worker + install prompt (spec §10)
// ---------------------------------------------------------------------------

// Stored for a future task's install UI; this task shows none.
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // sw.js posts WCOPY_UPDATE_ACTIVATED on every activate, including the very
  // first install (nothing to update yet, just first-run precaching) — so a
  // message is only a genuine "an update is ready" event if some worker was
  // already controlling this page before this registration.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // Offline support is a nicety, not a hard requirement for this session.
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'WCOPY_UPDATE_ACTIVATED' && hadController) {
      showToast({
        message: 'Update ready',
        tone: 'info',
        action: { label: 'Reload', onClick: () => window.location.reload() },
      });
    }
  });
}

registerServiceWorker();
