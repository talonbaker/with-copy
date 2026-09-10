/*
 * clipboard.js — clipboard read/write adapter (spec §4.4).
 *
 * Two platform strategies, chosen per device (W5)
 * ------------------------------------------------
 * An earlier version of this file assumed `writeDeferred` (below) was the
 * fix for WebKit: hold a clipboard *write* open across the *read* by calling
 * `navigator.clipboard.write()` synchronously in the gesture, with the
 * read's result supplied as a promise. That was wrong for the one case
 * w/copy actually exists to serve — the product owner's real iPhone (iOS
 * 18.7) showed that pressing w/copy with content copied from *another app*
 * fails immediately, with no native Paste callout at all. `writeDeferred`
 * only ever looked like it worked in testing because the probe page's own
 * "read then write" experiments left the probe's own output on the
 * clipboard, and WebKit skips the Paste callout entirely for content that
 * came from the same origin — never the case that matters here.
 *
 * The diagnosis: with *foreign* clipboard content, WebKit must show the
 * Paste callout to satisfy `readText()`. Holding a clipboard write open
 * across that read (exactly what `writeDeferred(readText().then(...))`
 * does) appears to suppress the callout entirely, so the read is denied
 * instantly. A real `paste` DOM event needs no permission, no callout
 * arbitration, and no prompt — it's the only path the iPhone evidence
 * trusts. See `docs/tasks/w5-clipboard-streamline.md` for the full evidence
 * and probe.html for the experiments that pinned this down.
 *
 * So there are two strategies, not one universal sequence:
 *
 * - `read` — `readText()`, transform, `writeText()`. Desktop Chrome only:
 *   its clipboard-read permission is granted once per origin and persists,
 *   so an awaited read-then-write in one click handler just works.
 * - `paste` — no read is ever attempted. The action control is itself a
 *   paste target; the user's native Paste (into that control) supplies the
 *   text via `readFromPasteEvent`, and the result is written *inside that
 *   same `paste` event*, which is a user gesture on every platform,
 *   including WebKit, and needs no permission at all. iPhone (and anything
 *   that has ever had a read denied) uses this exclusively.
 *
 * The strategy is decided once (seeded by a capability probe, see
 * `seedClipboardStrategy`) and persisted in `localStorage` under
 * `wcopy.clipboardStrategy`; `nextClipboardStrategy` is the pure rule for
 * how a stored strategy plus a read's outcome combine into the next one — a
 * `read`-strategy device demotes itself to `paste` permanently, and
 * silently, the first time a read comes back `DENIED` or `UNSUPPORTED` (see
 * `js/main.js`'s action path, spec §6). `writeDeferred` is kept below only
 * for the `read` strategy's own write, which still benefits from the same
 * WebKit-safe shape even though `read` strategy in practice means desktop
 * Chrome; it is never used as a way to avoid a paste event on WebKit again.
 */

/** @typedef {'UNSUPPORTED'|'DENIED'|'NOT_FOCUSED'|'EMPTY'|'UNKNOWN'} ClipboardErrorCode */

export class ClipboardError extends Error {
  /**
   * @param {ClipboardErrorCode} code
   * @param {string} message
   * @param {ErrorOptions} [options]
   */
  constructor(code, message, options) {
    super(message, options);
    this.name = 'ClipboardError';
    this.code = code;
  }
}

/** True when the Async Clipboard API is present in a secure context. */
export function supportsClipboard() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof isSecureContext !== 'undefined' &&
    isSecureContext
  );
}

/**
 * Map any thrown value from a clipboard call to a `ClipboardError`.
 * @param {unknown} err
 */
function toClipboardError(err) {
  if (err instanceof ClipboardError) return err;

  const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
  const message = err instanceof Error ? err.message : String(err ?? '');

  if (name === 'NotAllowedError') {
    if (/focus/i.test(message)) {
      return new ClipboardError('NOT_FOCUSED', 'The page lost focus. Tap w/copy again.', { cause: err });
    }
    return new ClipboardError('DENIED', 'Clipboard access was blocked.', { cause: err });
  }
  if (name === 'SecurityError') {
    return new ClipboardError('DENIED', 'Clipboard access was blocked.', { cause: err });
  }
  if (name === 'NotFoundError') {
    return new ClipboardError('EMPTY', 'The clipboard has no readable text.', { cause: err });
  }
  return new ClipboardError('UNKNOWN', message || 'Something went wrong with the clipboard.', { cause: err });
}

/**
 * Read plain text from the clipboard. Must be called from a user gesture on
 * WebKit, or it never resolves the native "Paste" prompt.
 * @returns {Promise<string>}
 */
export async function readText() {
  if (!supportsClipboard() || typeof navigator.clipboard.readText !== 'function') {
    throw new ClipboardError('UNSUPPORTED', "This browser can't read the clipboard.");
  }
  try {
    return await navigator.clipboard.readText();
  } catch (err) {
    throw toClipboardError(err);
  }
}

/**
 * Write plain text to the clipboard immediately. Safe on desktop Chrome
 * right after an awaited read; on WebKit prefer `writeDeferred` whenever a
 * read precedes the write.
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function writeText(text) {
  if (!supportsClipboard() || typeof navigator.clipboard.writeText !== 'function') {
    throw new ClipboardError('UNSUPPORTED', "This browser can't write to the clipboard.");
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    throw toClipboardError(err);
  }
}

/**
 * WebKit-safe deferred write. Call this SYNCHRONOUSLY inside the user
 * gesture, passing a promise for the text to write (typically
 * `readText().then(transform)`). It calls `navigator.clipboard.write`
 * synchronously with a `ClipboardItem` whose `text/plain` entry is a Blob
 * promise, so the gesture is spent on the `write()` call, not on awaiting
 * `textPromise` first.
 * @param {Promise<string>} textPromise
 * @returns {Promise<void>}
 */
export function writeDeferred(textPromise) {
  if (!supportsClipboard()) {
    return Promise.reject(new ClipboardError('UNSUPPORTED', "This browser can't write to the clipboard."));
  }

  const guarded = textPromise.catch((err) => {
    throw toClipboardError(err);
  });

  if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard.write === 'function') {
    const blobPromise = guarded.then((text) => new Blob([text], { type: 'text/plain' }));
    // ClipboardItem only reads this promise if navigator.clipboard.write()
    // gets far enough to need the data (per spec, its own consumption is
    // internal to the browser, not a JS-visible .then/.catch). When write()
    // instead rejects immediately — e.g. a denied read/write permission,
    // exactly the case that demotes the strategy — nothing else in this
    // function ever attaches a handler to `blobPromise` itself, so a
    // rejection here would otherwise surface as an unhandled promise
    // rejection in the console even though the real error is already
    // reported through the `navigator.clipboard.write(...)` promise below.
    // This no-op catch only marks it handled; it doesn't change what
    // ClipboardItem itself reads from the promise.
    blobPromise.catch(() => {});
    let item;
    try {
      item = new ClipboardItem({ 'text/plain': blobPromise });
    } catch (err) {
      // Some WebKit versions reject a promise-valued ClipboardItem entry at
      // construction time rather than at write() time; fall back below.
      return guarded.then((text) => writeText(text));
    }
    return navigator.clipboard.write([item]).catch((err) => {
      throw toClipboardError(err);
    });
  }

  // No ClipboardItem support: best effort, resolve then write plainly.
  return guarded.then((text) => writeText(text));
}

/**
 * Extract plain text from a native `paste` event. Needs no permission: the
 * event itself is a user gesture, so a write performed inside its handler is
 * always gesture-safe, including on WebKit.
 * @param {ClipboardEvent} event
 * @returns {string}
 */
export function readFromPasteEvent(event) {
  const data = event && event.clipboardData;
  if (!data) {
    throw new ClipboardError('EMPTY', 'No paste data was received.');
  }
  const text = data.getData('text/plain') || data.getData('text');
  if (!text) {
    throw new ClipboardError('EMPTY', 'The pasted content had no text.');
  }
  return text;
}

// ---------------------------------------------------------------------------
// Clipboard strategy (W5) — which of the two shapes above a device uses.
// ---------------------------------------------------------------------------

/** @typedef {'read'|'paste'} ClipboardStrategy */

const STRATEGY_KEY = 'wcopy.clipboardStrategy';

/**
 * Pure decision rule behind the `read` → `paste` demotion (spec §4.4, §6).
 * Takes `{ storedStrategy, readOutcome }` — `storedStrategy` is whatever is
 * currently persisted (`'read'`, `'paste'`, or `null`/`undefined` for a
 * device that hasn't been seeded yet, treated the same as `'read'`);
 * `readOutcome` is `null` when the caller hasn't attempted a read yet and is
 * only asking whether it should, or one of `'ok'`, `'denied'`,
 * `'unsupported'`, `'other'` once it has. Returns `{ strategy, attemptRead }`:
 * the strategy to persist going forward, and whether *this* action should
 * attempt a read at all.
 *
 * - Once in `paste` strategy, it stays there and a read is never attempted
 *   again — a demotion is permanent for this device (design point 1).
 * - In `read` strategy, a `denied` or `unsupported` outcome demotes to
 *   `paste` immediately; every other outcome (including not having read
 *   yet) keeps `read` and says to attempt one.
 *
 * No DOM, no `localStorage`, no `navigator` — safe to unit test directly.
 * @param {{ storedStrategy: ClipboardStrategy | null | undefined, readOutcome: 'ok'|'denied'|'unsupported'|'other'|null }} input
 * @returns {{ strategy: ClipboardStrategy, attemptRead: boolean }}
 */
export function nextClipboardStrategy({ storedStrategy, readOutcome }) {
  if (storedStrategy === 'paste') {
    return { strategy: 'paste', attemptRead: false };
  }
  if (readOutcome === 'denied' || readOutcome === 'unsupported') {
    return { strategy: 'paste', attemptRead: false };
  }
  return { strategy: 'read', attemptRead: true };
}

/**
 * Pure rule for seeding the strategy on a device that has never stored one.
 * Takes `{ maxTouchPoints, hasQueryableClipboardReadPermission }` — plain
 * values, not `navigator` itself, so this is testable without a DOM — and
 * returns `'paste'` only when the device is touch-capable (a stand-in for
 * "platform where WebKit's rules apply", per design point 1) *and* has no
 * queryable clipboard-read permission (the capability-probe half: Chrome
 * exposes `navigator.permissions.query({name:'clipboard-read'})`, WebKit
 * does not recognize that permission name at all). Anything else starts
 * `'read'`. Deliberately does not sniff the user agent string.
 * @param {{ maxTouchPoints: number, hasQueryableClipboardReadPermission: boolean }} input
 * @returns {ClipboardStrategy}
 */
export function detectDefaultStrategy({ maxTouchPoints, hasQueryableClipboardReadPermission }) {
  const touch = typeof maxTouchPoints === 'number' && maxTouchPoints > 0;
  return touch && !hasQueryableClipboardReadPermission ? 'paste' : 'read';
}

function getLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads the persisted clipboard strategy. Returns `'read'`, `'paste'`, or
 * `null` if nothing has been seeded yet or `localStorage` is unavailable.
 * Never throws.
 * @returns {ClipboardStrategy | null}
 */
export function loadClipboardStrategy() {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const value = storage.getItem(STRATEGY_KEY);
    return value === 'read' || value === 'paste' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Persists the clipboard strategy. Never throws: a failed write (quota,
 * private mode, absent `localStorage`) is a silent no-op, same reasoning as
 * `store.js`'s persistence helpers — the caller still has the in-memory
 * value for the rest of this session even if it can't be saved for next
 * time.
 * @param {ClipboardStrategy} strategy
 */
export function saveClipboardStrategy(strategy) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STRATEGY_KEY, strategy);
  } catch {
    // Ignore, same reasoning as store.js's saveState.
  }
}

/**
 * The capability probe half of `detectDefaultStrategy`: whether this engine
 * can be asked, ahead of time, if clipboard-read is queryable — without
 * actually invoking a real read, which would spend a gesture (or fail
 * outright outside one) just to find out. Chrome implements the Permissions
 * API for `'clipboard-read'` and returns a `PermissionStatus`; WebKit does
 * not recognize that permission name and throws synchronously before ever
 * returning a promise. That synchronous throw — not the user agent string —
 * is the signal this relies on.
 * @returns {boolean}
 */
function canQueryClipboardReadPermission() {
  if (
    typeof navigator === 'undefined' ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== 'function'
  ) {
    return false;
  }
  try {
    // The query's own promise is irrelevant here — only whether the engine
    // accepted the permission name synchronously matters — but it's caught
    // defensively so an engine that instead *rejects* asynchronously for an
    // unrecognized name never surfaces as an unhandled rejection.
    navigator.permissions.query({ name: 'clipboard-read' }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Seeds the clipboard strategy for a device that has never stored one,
 * persists it, and returns it. Synchronous: `canQueryClipboardReadPermission`
 * only needs to observe whether `permissions.query` throws, not await its
 * result, so seeding never delays the first render waiting on a promise.
 * @returns {ClipboardStrategy}
 */
export function seedClipboardStrategy() {
  const strategy = detectDefaultStrategy({
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
    hasQueryableClipboardReadPermission: canQueryClipboardReadPermission(),
  });
  saveClipboardStrategy(strategy);
  return strategy;
}

/**
 * The strategy to use right now: whatever is already stored, or a freshly
 * seeded one (persisted as a side effect) if this device has never stored
 * one before. This is the only function `main.js` needs to call at startup.
 * @returns {ClipboardStrategy}
 */
export function getOrSeedClipboardStrategy() {
  const stored = loadClipboardStrategy();
  return stored || seedClipboardStrategy();
}
