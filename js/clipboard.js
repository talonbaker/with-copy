/*
 * clipboard.js — clipboard read/write adapter (spec §4.4).
 *
 * Why WebKit needs `writeDeferred`
 * ---------------------------------
 * iPhone "Chrome" is WebKit under the hood (Apple requires every iOS browser
 * to use WebKit outside the EU), so it follows Safari's clipboard rules, not
 * desktop Chrome's:
 *
 * - Desktop Chrome's transient activation (the "this came from a real user
 *   gesture" flag) survives an `await`, so `await readText(); await
 *   writeText(result)` inside one tap handler works fine — the write still
 *   counts as gesture-triggered even after the read's await.
 * - WebKit's activation does NOT reliably survive an `await`. A `writeText`
 *   called after an awaited read can be rejected with `NotAllowedError`
 *   because, by the time it runs, WebKit no longer considers the call to be
 *   inside the original gesture.
 * - WebKit *does* accept `navigator.clipboard.write([...])` when the
 *   `write()` call itself happens synchronously inside the gesture's call
 *   stack, even if the `ClipboardItem`'s payload is a `Promise` that
 *   resolves later. The gesture only has to cover the moment `write()` is
 *   invoked, not the moment the data becomes available. That is exactly the
 *   shape of "read the clipboard, transform it, write the result": call
 *   `write()` synchronously with a promise for the transformed text, let the
 *   read/transform resolve that promise whenever it's ready.
 * - `writeDeferred` is built around that: it calls
 *   `navigator.clipboard.write([new ClipboardItem({ 'text/plain': blobPromise })])`
 *   synchronously, without ever awaiting first, so the caller can pass in a
 *   promise chain that starts with `readText()`. Where `ClipboardItem` does
 *   not exist (older WebKit, locked-down embedded webviews), it falls back
 *   to `writeText(await promise)`, which only works if that resolution still
 *   lands inside (or close enough to) the gesture — worse than the
 *   `ClipboardItem` path, but the best available fallback.
 * - WebKit also requires the user to tap through a native "Paste" callout
 *   for `readText`; nothing here can suppress or auto-accept it, which is
 *   why the app never assumes a read completes promptly and always keeps a
 *   paste-event fallback (`readFromPasteEvent`) that needs no permission at
 *   all — a `paste` DOM event is itself a user gesture, so the write it
 *   triggers is always safe on WebKit.
 *
 * None of the above is guessed: it is exercised by `probe.html` (spec §9) on
 * real desktop Chrome and real iPhone Chrome, and the probe's findings are
 * reported back rather than assumed.
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
