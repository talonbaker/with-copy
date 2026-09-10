// pile.js — the i/copy pile: a scratch buffer of clipboard chunks (W6).
// See docs/tasks/w6-icopy-stack.md and
// docs/spec/2026-09-09-w-copy-technical-spec.md §3, §4.8.
//
// The pile is NOT stack configuration: it is one shared, transient buffer
// for the clipboard workflow, stored under its own localStorage key
// (`wcopy.pile`) and never touched by export, import, or the share link.
// Persistence here follows the exact guarded pattern `store.js` uses for
// `wcopy.state`/`wcopy.lastOutput` — every localStorage access is wrapped so
// a missing or throwing localStorage (Node, private browsing, quota) never
// throws — but `pile.js` stays a separate module because the pile is not
// part of the application state `store.js` manages: it has its own
// lifetime, is never migrated or validated against a schema, and nothing
// about it should make `createStore`'s subscribers re-render.
//
// `appendChunk` and `renderPile`, the two functions the action path actually
// runs on every keystroke of logic, are pure and synchronous — no
// localStorage, no DOM — so `tests/pile.test.js` covers them directly under
// node:test with no environment faking at all.

const PILE_KEY = 'wcopy.pile';

function getLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isValidPileShape(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Array.isArray(value.chunks) &&
    value.chunks.every((chunk) => typeof chunk === 'string')
  );
}

/**
 * Reads the persisted pile from `localStorage` (key `wcopy.pile`). Takes no
 * arguments and returns `{ chunks: string[] }`: an empty pile when nothing
 * is stored, `localStorage` is unavailable, or the stored value is missing,
 * corrupt JSON, or the wrong shape. Never throws.
 */
export function loadPile() {
  const storage = getLocalStorage();
  if (!storage) return { chunks: [] };

  let raw;
  try {
    raw = storage.getItem(PILE_KEY);
  } catch {
    return { chunks: [] };
  }
  if (!raw) return { chunks: [] };

  try {
    const parsed = JSON.parse(raw);
    if (isValidPileShape(parsed)) {
      return { chunks: [...parsed.chunks] };
    }
  } catch {
    // Falls through to the empty pile below, same as store.js's loadState
    // treating corrupt JSON as "nothing usable was stored" rather than
    // throwing — the pile has no export/import path to preserve for
    // recovery, so there is nothing worth stashing.
  }
  return { chunks: [] };
}

/**
 * Persists `pile` to `localStorage` under `wcopy.pile`. Takes the `pile`
 * object (`{ chunks: string[] }`) and returns nothing. Never throws: a
 * missing or failing `localStorage` (private mode, quota) is a silent
 * no-op, matching `store.js`'s `saveState`/`saveLastOutput`.
 */
export function savePile(pile) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(PILE_KEY, JSON.stringify({ chunks: pile.chunks }));
  } catch {
    // Ignore, same reasoning as store.js's saveState.
  }
}

/**
 * Removes the persisted pile from `localStorage` entirely. Takes no
 * arguments and returns nothing. Never throws.
 */
export function clearPile() {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(PILE_KEY);
  } catch {
    // Ignore, same reasoning as store.js's saveState.
  }
}

/**
 * Appends one clipboard chunk to a pile. Pure and synchronous: takes the
 * current `pile` and the candidate `text`, and returns a NEW pile object
 * with `text` appended to `chunks` — the input pile is never mutated, so
 * callers can always compare the old and new pile. A `text` that is not a
 * string, or is empty or whitespace-only, is ignored: the returned pile has
 * the same chunks (in a new array) and nothing is added. Never throws.
 */
export function appendChunk(pile, text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { chunks: [...pile.chunks] };
  }
  return { chunks: [...pile.chunks, text] };
}

/**
 * Renders a pile to the single string i/copy writes to the clipboard.
 * Pure and synchronous: takes the `pile` and the `separator` string (the
 * active stack's `separator`, per spec §3) and returns the chunks joined by
 * `separator`, each chunk with its trailing whitespace stripped
 * (`replace(/\s+$/, '')`) and leading whitespace kept — the same rule
 * `merge.assemble` applies to non-clipboard segments, so a rendered pile
 * reads like plain accumulation, not like a wrapped block. Returns `''` for
 * zero chunks. Never throws.
 */
export function renderPile(pile, separator) {
  return pile.chunks.map((chunk) => chunk.replace(/\s+$/, '')).join(separator);
}
