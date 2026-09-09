// State container and persistence.
// See docs/spec/2026-09-09-w-copy-technical-spec.md §4.3.
//
// `createStore` is DOM-free and takes `save` as an injected function so it
// can run under node:test. Only `loadState`, `saveState`, `loadLastOutput`,
// and `saveLastOutput` touch `localStorage`, and each guards against it
// being absent (Node) or throwing (private browsing, quota, etc.).

import { createDefaultState, migrate } from './schema.js';

const STATE_KEY = 'wcopy.state';
const STATE_CORRUPT_KEY = 'wcopy.state.corrupt';
const LAST_OUTPUT_KEY = 'wcopy.lastOutput';

/**
 * Creates the in-memory state container used by the whole app. Takes
 * `{ initial, save }`, where `initial` is the starting state object and
 * `save` is a function called with the current state whenever a save is
 * due (injected so tests can run without `localStorage`). Returns
 * `{ get, commit, patch, subscribe }`:
 *
 * - `get()` returns the current state object.
 * - `commit(mutator)` calls `mutator(draftState)` to mutate the state in
 *   place, schedules a save, and notifies every subscriber. Use this for
 *   structural changes.
 * - `patch(mutator)` calls `mutator(draftState)` and schedules a save, but
 *   does not notify subscribers. Use this for high-frequency edits (e.g.
 *   keystrokes) that must not trigger a re-render.
 * - `subscribe(listener)` registers `listener(state)` to be called on every
 *   `commit`, and returns an `unsubscribe` function.
 *
 * Saves are coalesced: however many `commit`/`patch` calls happen within one
 * synchronous run of code, `save` is called at most once, scheduled with
 * `queueMicrotask`. Never throws.
 */
export function createStore({ initial, save }) {
  let state = initial;
  const listeners = new Set();
  let saveScheduled = false;

  function scheduleSave() {
    if (saveScheduled) return;
    saveScheduled = true;
    queueMicrotask(() => {
      saveScheduled = false;
      if (typeof save === 'function') {
        save(state);
      }
    });
  }

  return {
    get() {
      return state;
    },
    commit(mutator) {
      mutator(state);
      scheduleSave();
      for (const listener of listeners) {
        listener(state);
      }
    },
    patch(mutator) {
      mutator(state);
      scheduleSave();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function getLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function stashCorruptState(storage, raw) {
  try {
    storage.setItem(STATE_CORRUPT_KEY, raw);
  } catch {
    // Storage may be full or unavailable; the recovery path still proceeds
    // with the default state, it just can't preserve the bad data.
  }
}

/**
 * Loads the persisted application state from `localStorage` (key
 * `wcopy.state`), migrates and validates it. Takes no arguments and returns
 * `{ state, corrupted }`: `state` is the validated, current-schema state
 * object (or `createDefaultState()` if nothing is stored, storage is
 * unavailable, or the stored data is unreadable), and `corrupted` is `true`
 * only when stored data existed but could not be parsed or validated (in
 * which case the raw string is preserved under `wcopy.state.corrupt` for
 * recovery, best-effort). Never throws: every `localStorage` access and
 * every parse/validate step is guarded.
 */
export function loadState() {
  const storage = getLocalStorage();
  if (!storage) {
    return { state: createDefaultState(), corrupted: false };
  }

  let raw;
  try {
    raw = storage.getItem(STATE_KEY);
  } catch {
    return { state: createDefaultState(), corrupted: false };
  }

  if (raw === null || raw === undefined) {
    return { state: createDefaultState(), corrupted: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    stashCorruptState(storage, raw);
    return { state: createDefaultState(), corrupted: true };
  }

  try {
    return { state: migrate(parsed), corrupted: false };
  } catch {
    stashCorruptState(storage, raw);
    return { state: createDefaultState(), corrupted: true };
  }
}

/**
 * Persists the given state object to `localStorage` under `wcopy.state` as
 * JSON. Takes the `state` object and returns nothing. Never throws: if
 * `localStorage` is absent or the write fails (quota, private mode, etc.)
 * the call is a silent no-op from the caller's perspective.
 */
export function saveState(state) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore: nothing the caller can usefully do about a storage failure
    // for a background save.
  }
}

/**
 * Reads the last text the app wrote to the clipboard, used by the growth
 * guard in `merge.shouldSkip`. Takes no arguments and returns the stored
 * string, or `null` if nothing has been saved yet or `localStorage` is
 * absent or unreadable. Never throws.
 */
export function loadLastOutput() {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(LAST_OUTPUT_KEY);
  } catch {
    return null;
  }
}

/**
 * Records the text the app just wrote to the clipboard, for the growth
 * guard in `merge.shouldSkip`. Takes the `text` string and returns nothing.
 * Never throws: if `localStorage` is absent or the write fails, the call is
 * a silent no-op.
 */
export function saveLastOutput(text) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(LAST_OUTPUT_KEY, text);
  } catch {
    // Ignore, same reasoning as saveState.
  }
}
