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
import {
  readText,
  writeText,
  writeDeferred,
  readFromPasteEvent,
  nextClipboardStrategy,
  getOrSeedClipboardStrategy,
  saveClipboardStrategy,
} from './clipboard.js';
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
  toggleClipboardPreviewPref,
  toggleClipboardPreviewExpanded,
  updateClipboardPreview,
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
  setShowClipboard,
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
  // W7: the opt-in clipboard preview's read side (docs/tasks/
  // w7-clipboard-preview.md). A function, not a plain field, so
  // piece-card.js always sees the current `clipboardPreview`/
  // `clipboardStrategy` — both declared further down this file and updated
  // in place — rather than a value snapshotted once when `ctx` was built.
  getClipboardPreview: () => ({
    text: clipboardPreview.text,
    checkedAt: clipboardPreview.checkedAt,
    attemptRead: nextClipboardStrategy({ storedStrategy: clipboardStrategy, readOutcome: null }).attemptRead,
  }),
};

// ---------------------------------------------------------------------------
// W6: the pile (i/copy) — in-memory mirror of `wcopy.pile`, loaded once at
// startup and kept in sync with every append/clear. Not part of `store`:
// the pile is a transient clipboard-workflow buffer, not application state
// (see js/pile.js's header comment and docs/tasks/w6-icopy-stack.md), so it
// never runs through `createStore` and never triggers a structural render.
// ---------------------------------------------------------------------------

let pileState = loadPile();

// ---------------------------------------------------------------------------
// W7: the opt-in clipboard preview (docs/tasks/w7-clipboard-preview.md) —
// the exact same shape of state as `pileState` above, for the exact same
// reason: this is a transient, session-only snapshot of the last clipboard
// text actually obtained, not application state, so it never runs through
// `store` (no schema validation, no persistence, no export, no share link
// — the task's hard rule 2: clipboard content lives in memory only). `text`
// is `null` until something has been read or pasted this session; after
// that it is the exact string obtained, including `''` for a genuinely
// empty clipboard (its own honestly-labelled state — see piece-card.js's
// `fillClipboardPreview`). `checkedAt` is that read's `Date.now()`, used
// only to render the honest "checked N ago" wording
// (clipboard-preview.js's `formatCheckedAgo`) — never written anywhere.
let clipboardPreview = { text: null, checkedAt: null };

/**
 * Records a clipboard text this session actually obtained — via the
 * preview's own control, or "for free" whenever w/copy/i/copy succeed (see
 * `runWCopy`/`runICopy`/`handleActionPaste` below) — and refreshes whatever
 * clipboard piece card is currently on screen to show it. In-memory only:
 * this never calls into `store` or `localStorage`, per the task's rule 2.
 */
function setClipboardPreviewText(text) {
  clipboardPreview = { text, checkedAt: Date.now() };
  refreshClipboardPreviewUI();
}

/**
 * Re-fills the currently-mounted clipboard piece card's preview content and
 * control label from the current `clipboardPreview`/`clipboardStrategy`,
 * without a store commit and without rebuilding any other card — the same
 * "targeted refresh" shape `renderPileStrip` uses for the pile. Called
 * after a successful read/paste, after a silent strategy demotion, and on
 * the freshness-label tick below. A no-op if no clipboard piece card is
 * currently rendered (e.g. its stack's clipboard piece was somehow removed
 * mid-flight, or the preview is off and nothing needs updating).
 */
function refreshClipboardPreviewUI() {
  const pieceEl = document.querySelector('.wc-piece[data-kind="clipboard"]');
  updateClipboardPreview(pieceEl, ctx);
}

// Purely a display tick for the honest "checked N ago" wording aging from
// "just now" to "2 minutes ago" and onward while a card is left open — D8 is
// about clipboard READS, not about redrawing a label already computed from
// data already held in memory. This never touches the clipboard and never
// reads anything; it only recomputes text from `clipboardPreview.checkedAt`,
// exactly like `refreshClipboardPreviewUI`'s other callers. A no-op tick
// whenever nothing has been checked yet, or no clipboard card is mounted.
setInterval(() => {
  if (clipboardPreview.checkedAt !== null) refreshClipboardPreviewUI();
}, 30_000);

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
  updateActionUI(state);
}

// ---------------------------------------------------------------------------
// Clipboard strategy (spec §4.4, §6) — read vs paste, chosen per device (W5)
// ---------------------------------------------------------------------------

// Seeded once at load — iPhone/WebKit-shaped devices start in `paste`
// strategy, everything else starts in `read` (see clipboard.js's
// `seedClipboardStrategy`). Kept as a module-level variable rather than
// re-read from `localStorage` on every click: a demotion updates it in
// place via `demoteClipboardStrategy`, and nothing else in a running session
// ever changes it.
let clipboardStrategy = getOrSeedClipboardStrategy();

/**
 * Permanently and silently switches this device to `paste` strategy: no
 * toast, ever (design point 1) — the button's own label is the only signal.
 * A no-op if already demoted, so callers don't need to check first. Also
 * refreshes the clipboard preview control (W7), which shares this exact
 * silent-relabel rule (docs/tasks/w7-clipboard-preview.md: "Read refused,
 * or the platform needs a paste ... Never an error toast").
 */
function demoteClipboardStrategy() {
  if (clipboardStrategy === 'paste') return;
  clipboardStrategy = 'paste';
  saveClipboardStrategy('paste');
  updateActionUI(store.get());
  refreshClipboardPreviewUI();
}

/**
 * Maps a `DENIED`/`UNSUPPORTED` `ClipboardError` to the silent, permanent
 * strategy demotion both `handleReadFailure` (w/copy, i/copy) and the
 * clipboard preview's own read share: "this device cannot read the
 * clipboard" is an expected, handled outcome (design point 1), never a
 * toast. Returns `true` when `err` was one of those two codes (whether or
 * not this call is the one that actually flipped the strategy — a device
 * already in `paste` strategy still returns `true` here, so callers know
 * not to fall through to their own generic error handling), `false` for
 * every other error so the caller still needs to handle it.
 */
function demoteOnUnreadable(err) {
  const code = err && err.code;
  if (code !== 'DENIED' && code !== 'UNSUPPORTED') return false;
  const outcome = code === 'DENIED' ? 'denied' : 'unsupported';
  const { strategy } = nextClipboardStrategy({ storedStrategy: clipboardStrategy, readOutcome: outcome });
  if (strategy === 'paste') demoteClipboardStrategy();
  return true;
}

/**
 * Sets one action control's visible label and keeps its accessible name in
 * sync with it — both controls are `contenteditable` (W5), so `aria-label`
 * is what a screen reader actually announces, not the element's own text
 * content's accessible-name computation, and the two must never drift.
 * No-ops when the control isn't in the document (defensive; every current
 * page has both).
 */
function setActionLabel(el, label) {
  if (!el) return;
  if (el.textContent !== label) el.textContent = label;
  el.setAttribute('aria-label', label);
}

/**
 * Reflects both action controls' labels and the shared long-press hint for
 * the current clipboard-piece state and platform strategy. Called from
 * every `render` (spec §5) so both a clipboard-piece toggle and a silent
 * demotion take effect immediately.
 *
 * The two controls' paste-invitation conditions differ, because what they
 * each need the clipboard for differs:
 * - w/copy only needs to read the clipboard when its stack's clipboard
 *   piece is enabled — a disabled clipboard piece writes immediately
 *   regardless of strategy (design point 4), so "Paste to w/copy" only
 *   makes sense when the piece is enabled *and* this device is in `paste`
 *   strategy.
 * - i/copy always needs the clipboard's current content (that's the whole
 *   feature — see `docs/tasks/w6-icopy-stack.md`); its own stack's
 *   clipboard-piece toggle is irrelevant to it, so its paste-invitation
 *   condition is `paste` strategy alone.
 *
 * The hint line is shared chrome (`[data-role="action-hint"]` sits below
 * both controls, not under either one specifically), so it shows whenever
 * *either* control is currently inviting a paste.
 */
function updateActionUI(state) {
  const wcopyEl = document.querySelector('[data-action="wcopy"]');
  const icopyEl = document.querySelector('[data-action="icopy"]');

  const stack = getActiveStack(state);
  const clipboardPiece = stack && stack.pieces.find((p) => p.kind === 'clipboard');
  const clipboardEnabled = Boolean(clipboardPiece && clipboardPiece.enabled);
  const wcopyPasteMode = clipboardEnabled && clipboardStrategy === 'paste';
  const icopyPasteMode = clipboardStrategy === 'paste';

  setActionLabel(wcopyEl, wcopyPasteMode ? 'Paste to w/copy' : 'w/copy');
  setActionLabel(icopyEl, icopyPasteMode ? 'Paste to pile' : 'i/copy');

  const hintEl = document.querySelector('[data-role="action-hint"]');
  if (hintEl) hintEl.hidden = !(wcopyPasteMode || icopyPasteMode);
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

// `openPasteFallback`/`handlePasteFallback` and the `wc-paste` dialog they
// drive are no longer reachable from the action path (W5): a denied or
// unsupported read now demotes to `paste` strategy silently instead of
// opening a sheet (design point 3 — "the failure sheet" is retired from the
// normal path precisely because a denied read is an expected, handled
// outcome, not an error). They stay in the code, unused, per the brief, as
// the one thing left for a genuinely broken device — no Clipboard API at
// all, so neither the `read` nor the `paste` strategy's write can ever
// succeed either. Nothing in this file currently opens it automatically;
// that is a deliberate gap, not an oversight, flagged in the W5 report.
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
 * handling — see the comment in `runWCopy`) to its outcome per spec §6/§4.4.
 * `DENIED` and `UNSUPPORTED` both mean "this device cannot read the
 * clipboard" — the case W5 exists for — and per the product owner's iPhone
 * evidence that is an expected, silent, permanently-handled outcome:
 * `nextClipboardStrategy` demotes to `paste` and the button relabels itself
 * on the very next render; no toast, no dialog (design point 1). Every other
 * code still gets a toast — nothing here is silent (spec §4.4) — but
 * `NOT_FOCUSED` no longer has a toast of its own (removed from spec §7.5):
 * it was only ever produced by WebKit's transient-activation rules, and
 * WebKit now never takes the `read` path at all, so it falls back to the
 * same generic write-failure message as any other unexpected code.
 */
function handleReadFailure(err) {
  if (demoteOnUnreadable(err)) return;
  if (err && err.code === 'EMPTY') {
    ctx.toast({ message: 'Your clipboard is empty.', tone: 'error' });
    return;
  }
  ctx.toast({ message: "Couldn't write to the clipboard. Try again.", tone: 'error' });
}

/**
 * The clipboard preview's own read attempt (W7, docs/tasks/
 * w7-clipboard-preview.md), via the exact same `getClipboardText()` seam
 * `runWCopy`/`runICopy` use — no second way to read the clipboard. Unlike
 * `handleReadFailure`, this never toasts for `DENIED`/`UNSUPPORTED` (handled
 * silently by `demoteOnUnreadable`, same as always) OR for `EMPTY` — a
 * genuinely empty clipboard is one of the preview's own honestly-labelled
 * states (the card shows "Your clipboard is empty." inline), not an error,
 * so it's recorded as an obtained empty string rather than toasted. Only a
 * truly unexpected code falls back to a toast, since nothing else in the
 * card explains it.
 */
async function runClipboardPreviewRead() {
  try {
    const text = await getClipboardText();
    setClipboardPreviewText(text);
  } catch (err) {
    if (demoteOnUnreadable(err)) return;
    if (err && err.code === 'EMPTY') {
      setClipboardPreviewText('');
      return;
    }
    ctx.toast({ message: "Couldn't read the clipboard. Try again.", tone: 'error' });
  }
}

/**
 * The clipboard preview's `paste`-shaped path (W7), the same shape as
 * `handleActionPaste` below: `preventDefault` so the pasted text never
 * visibly lands in the contenteditable control, the text comes straight
 * from `event.clipboardData`, and the control is cleared and blurred after.
 * A failed extraction (nothing pasted, e.g. an image) is treated the same
 * as a genuinely empty clipboard — recorded, not toasted — for the same
 * reason as `runClipboardPreviewRead`'s `EMPTY` case above.
 */
function handleClipboardPreviewPaste(event) {
  event.preventDefault();
  const actionEl = event.target;

  let text;
  try {
    text = readFromPasteEvent(event);
  } catch {
    text = '';
  }

  actionEl.textContent = '';
  actionEl.blur();
  setClipboardPreviewText(text);
}

// ---------------------------------------------------------------------------
// Shared decision steps — the one place each button's actual outcome is
// decided, called from BOTH its `read`-shaped click path (`runWCopy`/
// `runICopy`, fed by an awaited `getClipboardText()`) and its `paste`-shaped
// path (`handleActionPaste`, fed synchronously by a native `paste` event).
// Keeping the decision here rather than in each path separately is what lets
// W5's growth guard, empty-clipboard refusal, disabled-clipboard-piece case,
// and all-disabled-stack case (and W6's mirror-image guard for i/copy) apply
// identically no matter which strategy produced the clipboard text. Neither
// function performs I/O of its own (no clipboard, no localStorage, no
// commit) — callers persist state only after the actual clipboard write
// succeeds, same reasoning `runWCopy`/`runICopy` already followed.
// ---------------------------------------------------------------------------

/**
 * w/copy's decision step. A disabled clipboard piece needs no clipboard text
 * at all — assembling `''` is what "write only, no read, no paste needed"
 * (design point 4) means for that piece — so it ignores `clipboardText`
 * entirely and skips the growth guard; an all-disabled stack falls out of
 * this same branch, since `assemble(stack, '')` naturally reports
 * `EMPTY_STACK` when nothing else is enabled either. Every other case runs
 * the growth guard (only against the app's own last *wrap*, per the W6
 * interaction with i/copy) and then `assemble`. Returns `assemble`'s own
 * `{ok:true,text}` / `{ok:false,reason}` shape, with `'SKIP'` added
 * alongside `assemble`'s `'EMPTY_STACK'`/`'EMPTY_CLIPBOARD'`.
 * @param {ReturnType<typeof getActiveStack>} stack
 * @param {string} clipboardText
 * @param {string|null} lastOutput
 * @param {'wrap'|'stack'|null} lastKind
 */
function decideWCopy(stack, clipboardText, lastOutput, lastKind) {
  const clipboardPiece = stack.pieces.find((p) => p.kind === 'clipboard');
  const clipboardEnabled = Boolean(clipboardPiece && clipboardPiece.enabled);
  if (!clipboardEnabled) return assemble(stack, '');
  if (shouldSkip(clipboardText, lastOutput) && lastKind === 'wrap') {
    return { ok: false, reason: 'SKIP' };
  }
  return assemble(stack, clipboardText);
}

/** Maps `decideWCopy`'s failure `reason` to its exact toast (spec §6/§7.5). */
function wcopyFailureToast(reason) {
  if (reason === 'SKIP') {
    return { message: 'Already wrapped. Copy something new first.', tone: 'info' };
  }
  if (reason === 'EMPTY_STACK') {
    return { message: 'Nothing to copy. Enable a piece first.', tone: 'error' };
  }
  return { message: 'Your clipboard is empty.', tone: 'error' }; // EMPTY_CLIPBOARD
}

/**
 * i/copy's decision step (W6), the mirror image of `decideWCopy`: the growth
 * guard only fires against the app's own last *stack*, and the only other
 * refusal is a genuinely empty (or whitespace-only) clipboard — i/copy has
 * no "disabled piece" or "all-disabled stack" concept of its own, since it
 * never consults the stack's pieces, only its `separator`. Reads `pileState`
 * (module-level, W6) but never writes it: the caller commits `nextPile`
 * itself, only after the clipboard write actually succeeds. Returns
 * `{ok:true,text,nextPile}` or `{ok:false,reason:'SKIP'|'EMPTY'}`.
 * @param {string} clipboardText
 * @param {string} separator
 * @param {string|null} lastOutput
 * @param {'wrap'|'stack'|null} lastKind
 */
function decideICopy(clipboardText, separator, lastOutput, lastKind) {
  if (shouldSkip(clipboardText, lastOutput) && lastKind === 'stack') {
    return { ok: false, reason: 'SKIP' };
  }
  if (clipboardText.trim() === '') {
    return { ok: false, reason: 'EMPTY' };
  }
  const nextPile = appendChunk(pileState, clipboardText);
  return { ok: true, nextPile, text: renderPile(nextPile, separator) };
}

/** Maps `decideICopy`'s failure `reason` to its exact toast (spec §6/§7.5). */
function icopyFailureToast(reason) {
  if (reason === 'SKIP') {
    return { message: 'Already stacked. Copy something new first.', tone: 'info' };
  }
  return { message: 'Your clipboard is empty.', tone: 'error' }; // EMPTY
}

/**
 * The `read`-shaped half of the action path (spec §6): assemble immediately
 * if the clipboard piece is disabled (no read needed on any strategy —
 * design point 4), otherwise `readText()`, transform, and write. Only ever
 * called when there IS a read to attempt — the delegated click handler
 * below checks `nextClipboardStrategy` first and, in `paste` strategy, just
 * focuses the action control instead of calling this at all; the actual
 * wrap for that strategy happens in `handleActionPaste`'s `paste` listener.
 */
async function runWCopy() {
  const stack = getActiveStack(store.get());
  if (!stack) return;

  const clipboardPiece = stack.pieces.find((p) => p.kind === 'clipboard');
  const clipboardEnabled = Boolean(clipboardPiece && clipboardPiece.enabled);

  if (!clipboardEnabled) {
    // decideWCopy's disabled-clipboard branch also covers the all-disabled-
    // stack case (assemble('') naturally reports EMPTY_STACK when nothing
    // else is enabled either), so there is no separate pre-check here.
    const result = decideWCopy(stack, '', null, null);
    if (!result.ok) {
      ctx.toast(wcopyFailureToast(result.reason));
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
  // identical to `lastOutput` in both cases. `decideWCopy`'s `lastKind ===
  // 'wrap'` check is what makes the distinction.
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
    // W7: feed the preview "for free" the instant a real read succeeds —
    // regardless of what decideWCopy does with it next (SKIP/EMPTY_STACK
    // included), since this genuinely is what's on the clipboard right now
    // (docs/tasks/w7-clipboard-preview.md).
    setClipboardPreviewText(clipboardText);
    const result = decideWCopy(stack, clipboardText, lastOutput, lastKind);
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
    if (abortReason) {
      ctx.toast(wcopyFailureToast(abortReason));
    } else if (readError) {
      handleReadFailure(readError);
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
  // the mirror image of `runWCopy`'s guard, same reasoning. `decideICopy`'s
  // `lastKind === 'stack'` check is what makes the distinction.
  const lastKind = loadLastOutputKind();

  let abortReason = null; // 'SKIP' | 'EMPTY'
  let nextPile = null;
  let renderedText = null;
  let readError = null;

  const textPromise = getClipboardText().then((clipboardText) => {
    // W7: same "for free" feed as runWCopy above.
    setClipboardPreviewText(clipboardText);
    const result = decideICopy(clipboardText, stack.separator, lastOutput, lastKind);
    if (!result.ok) {
      abortReason = result.reason;
      throw new Error(`icopy: ${result.reason}`);
    }
    nextPile = result.nextPile;
    renderedText = result.text;
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
    if (abortReason) {
      ctx.toast(icopyFailureToast(abortReason));
    } else if (readError) {
      handleReadFailure(readError);
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

/**
 * w/copy's half of the `paste`-shaped path: `text` is already extracted from
 * `event.clipboardData` by `handleActionPaste`. Every guarantee (growth
 * guard, empty-clipboard refusal, disabled-clipboard-piece case,
 * all-disabled-stack case) comes from `decideWCopy`, the exact same decision
 * step `runWCopy`'s read branch uses — this is the same action path, just
 * fed by a paste instead of a read. `finish` (clear + blur the control, then
 * re-render its label) runs on every exit, success or failure, so the
 * control never keeps a caret or stray text regardless of outcome.
 */
function handleWCopyPaste(text, finish) {
  const stack = getActiveStack(store.get());
  if (!stack) {
    finish();
    return;
  }

  const result = decideWCopy(stack, text, loadLastOutput(), loadLastOutputKind());
  if (!result.ok) {
    finish();
    ctx.toast(wcopyFailureToast(result.reason));
    return;
  }

  // Called synchronously inside the paste event itself — a user gesture on
  // every platform, WebKit included — so a plain writeText is safe here, no
  // writeDeferred trick needed (spec §4.4).
  writeText(result.text)
    .then(() => {
      saveLastOutput(result.text);
      saveLastOutputKind('wrap');
      finish();
      ctx.toast({ message: 'Wrapped with copy', tone: 'success' });
    })
    .catch(() => {
      finish();
      ctx.toast({ message: "Couldn't write to the clipboard. Try again.", tone: 'error' });
    });
}

/**
 * i/copy's half of the `paste`-shaped path (W6): the mirror image of
 * `handleWCopyPaste`, sharing `decideICopy` with `runICopy` the same way
 * `handleWCopyPaste` shares `decideWCopy` with `runWCopy`. i/copy needs the
 * active stack only for its `separator` — it has no clipboard-piece or
 * all-disabled-stack case of its own.
 */
function handleICopyPaste(text, finish) {
  const stack = getActiveStack(store.get());
  if (!stack) {
    finish();
    return;
  }

  const result = decideICopy(text, stack.separator, loadLastOutput(), loadLastOutputKind());
  if (!result.ok) {
    finish();
    ctx.toast(icopyFailureToast(result.reason));
    return;
  }

  writeText(result.text)
    .then(() => {
      pileState = result.nextPile;
      savePile(pileState);
      saveLastOutput(result.text);
      saveLastOutputKind('stack');
      renderPileStrip();
      finish();
      const count = pileState.chunks.length;
      ctx.toast({ message: `Stacked. ${count} ${count === 1 ? 'piece' : 'pieces'}.`, tone: 'success' });
    })
    .catch(() => {
      finish();
      ctx.toast({ message: "Couldn't write to the clipboard. Try again.", tone: 'error' });
    });
}

/**
 * The `paste`-shaped half of the action path (design point 2), for BOTH
 * controls: each is a paste target, so a native paste landing on it needs no
 * permission and no callout arbitration of its own — the `paste` DOM event
 * itself is the user gesture. Which control the paste landed on (its
 * `data-action`) decides whether this runs the wrap path or the stack path;
 * everything else about the two is identical — `preventDefault` stops the
 * browser from ever actually inserting the pasted text into the
 * contenteditable (it must never visibly hold it), the text is taken
 * straight from `event.clipboardData`, and `finish` clears + blurs whichever
 * control received the paste and re-renders both controls' labels.
 */
function handleActionPaste(event) {
  const actionEl = event.target;
  const action = actionEl && actionEl.dataset ? actionEl.dataset.action : null;
  if (action !== 'wcopy' && action !== 'icopy') return;

  event.preventDefault();

  const finish = () => {
    actionEl.textContent = '';
    actionEl.blur();
    updateActionUI(store.get());
  };

  let text;
  try {
    text = readFromPasteEvent(event);
  } catch {
    finish();
    ctx.toast({ message: 'Your clipboard is empty.', tone: 'error' });
    return;
  }

  // W7: feed the preview "for free" from a successful paste too, same as
  // the read-shaped path above — one insertion point covers both buttons.
  setClipboardPreviewText(text);

  if (action === 'wcopy') {
    handleWCopyPaste(text, finish);
  } else {
    handleICopyPaste(text, finish);
  }
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
    case 'wcopy': {
      // In `paste` strategy, a click's only job is to focus the action
      // control so the platform offers its native Paste (design point 2);
      // the actual wrap happens in the `paste` listener below, on
      // `handleActionPaste`. `nextClipboardStrategy` is the single source
      // of truth for that decision, same rule as the read-failure path.
      // w/copy only needs this when its stack's clipboard piece is enabled
      // — disabled, it writes immediately on any strategy (design point 4).
      const { attemptRead } = nextClipboardStrategy({ storedStrategy: clipboardStrategy, readOutcome: null });
      const stack = getActiveStack(store.get());
      const clipboardPiece = stack && stack.pieces.find((p) => p.kind === 'clipboard');
      const clipboardEnabled = Boolean(clipboardPiece && clipboardPiece.enabled);
      if (clipboardEnabled && !attemptRead) {
        actionEl.focus();
      } else {
        runWCopy();
      }
      break;
    }
    case 'icopy': {
      // i/copy always needs the clipboard's current content (its own
      // stack's clipboard-piece toggle doesn't apply to it — see
      // `updateActionUI`), so the same focus-vs-run decision applies
      // unconditionally on `attemptRead`, with no clipboardEnabled check.
      const { attemptRead } = nextClipboardStrategy({ storedStrategy: clipboardStrategy, readOutcome: null });
      if (attemptRead) {
        runICopy();
      } else {
        actionEl.focus();
      }
      break;
    }
    // W7: the clipboard preview's control — the exact same focus-vs-run
    // decision as w/copy/i/copy above, and for the same reason: a device in
    // `paste` strategy can only ever get clipboard text from a native paste
    // landing on this control (handleClipboardPreviewPaste, wired below).
    case 'clipboard-preview-action': {
      const { attemptRead } = nextClipboardStrategy({ storedStrategy: clipboardStrategy, readOutcome: null });
      if (attemptRead) {
        runClipboardPreviewRead();
      } else {
        actionEl.focus();
      }
      break;
    }
    case 'toggle-clipboard-preview':
      toggleClipboardPreviewPref(ctx);
      break;
    case 'clipboard-preview-expand': {
      const pieceEl = actionEl.closest('[data-id]');
      if (pieceEl) toggleClipboardPreviewExpanded(pieceEl, ctx);
      break;
    }
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
  if (target.matches('[data-role="show-clipboard"]')) {
    setShowClipboard(target.checked, ctx);
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
  // A stack row, the top bar title, and both action controls are not native
  // buttons (a stack row also hosts its own nested delete button; the
  // action controls are contenteditable paste targets — see W5/W6), so give
  // them keyboard activation by reusing the click handler above via a
  // synthetic click. `preventDefault` here also stops Enter/Space from
  // inserting a newline/space into whichever action control is focused
  // before that click fires (`beforeinput` below covers every other way
  // content could land in either — paste is handled separately,
  // deliberately, since that IS the gesture the `paste` strategy relies on).
  if (
    (event.key === 'Enter' || event.key === ' ') &&
    target.matches &&
    target.matches(
      '[data-action="switch-stack"], [data-action="begin-rename-stack"], [data-action="wcopy"], [data-action="icopy"], [data-action="clipboard-preview-action"]',
    )
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
  if (target.matches && target.matches('[data-action="wcopy"], [data-action="icopy"]')) {
    handleActionPaste(event);
    return;
  }
  if (target.matches && target.matches('[data-action="clipboard-preview-action"]')) {
    handleClipboardPreviewPaste(event);
    return;
  }
  if (!target.matches || !target.matches('[data-role="paste-text"]')) return;
  handlePasteFallback(event);
});

// Neither action control (nor the clipboard preview's own control, W7) must
// ever retain typed, dropped, or IME-composed content — only a `paste`
// (handled above, separately, since that's the gesture the `paste` strategy
// relies on) may ever produce a result, and even that is read straight from
// `event.clipboardData` rather than left to actually land in the element.
// Blocking every `beforeinput` unconditionally on all three is simpler and
// more robust than trying to allow-list input types, and keeps the guard as
// one rule instead of one per control.
document.addEventListener('beforeinput', (event) => {
  const target = event.target;
  if (
    target.matches &&
    target.matches('[data-action="wcopy"], [data-action="icopy"], [data-action="clipboard-preview-action"]')
  ) {
    event.preventDefault();
  }
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
