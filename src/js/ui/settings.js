// ui/settings.js — the settings dialog: appearance, export/import, about
// (spec §7.4). See docs/tasks/w2b-stacks-and-settings.md.
//
// `renderSettings` syncs the theme/density radios to the current state on
// every store commit, exactly like side-panel.js's `renderStackList` — it's
// called from main.js's root `render(state)` (spec §5: "updates the header
// ... side panel, and settings"). The rest of this module is import/export
// logic invoked directly from main.js's delegated handlers.

import { migrate, validateState } from '../schema.js';
import { writeText } from '../clipboard.js';

function dialogEl() {
  return document.querySelector('[data-role="settings"]');
}

// A <dialog> shown with showModal() renders in the browser's top layer, which
// sits above ordinary DOM content — including [data-role="toast"] — no
// matter what z-index the toast has, and its ::backdrop swallows clicks
// meant for anything behind it. So a toast fired while the settings dialog
// is still open would show its "Undo" button but never let a click reach it
// (or, for a plain success toast, may auto-hide before the user ever sees
// it). main.js's paste-fallback flow already closes its dialog right before
// toasting for the same reason; every settings action that toasts follows
// that same close-then-toast order.
function closeSettingsDialog() {
  const dialog = dialogEl();
  if (dialog && dialog.open) dialog.close();
}

/** Syncs the theme/density radio groups to `state.settings`. */
export function renderSettings(state, ctx) {
  const dialog = dialogEl();
  if (!dialog) return;
  const themeInput = dialog.querySelector(
    `[data-role="theme"] input[value="${CSS.escape(state.settings.theme)}"]`,
  );
  if (themeInput) themeInput.checked = true;
  const densityInput = dialog.querySelector(
    `[data-role="density"] input[value="${CSS.escape(state.settings.density)}"]`,
  );
  if (densityInput) densityInput.checked = true;
}

/** Theme radio change → commit, applied immediately by main.js's applyRootAttributes. */
export function setTheme(theme, ctx) {
  ctx.store.commit((state) => {
    state.settings.theme = theme;
  });
}

/** Density radio change → commit, applied immediately by main.js's applyRootAttributes. */
export function setDensity(density, ctx) {
  ctx.store.commit((state) => {
    state.settings.density = density;
  });
}

// ---------------------------------------------------------------------------
// About: VERSION, per spec §10, comes from the cache the registered service
// worker opened (its name is `wcopy-${VERSION}`) — read via the Cache
// Storage API, which is shared between a page and its service worker, so
// this needs no message-passing round trip through sw.js. Falls back to
// "dev" when no such cache exists yet (no service worker, or the very first
// install still in flight), which also happens to be VERSION's own literal
// value in an unstamped checkout.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'wcopy-';
let cachedVersion = null;

async function resolveVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    if (typeof caches === 'undefined') return 'dev';
    const keys = await caches.keys();
    const key = keys.find((k) => k.startsWith(CACHE_PREFIX));
    cachedVersion = key ? key.slice(CACHE_PREFIX.length) || 'dev' : 'dev';
  } catch {
    cachedVersion = 'dev';
  }
  return cachedVersion;
}

/** Fills in the About section's version string. Safe to call more than once. */
export function initVersion() {
  const versionEl = document.querySelector('[data-role="version"]');
  if (!versionEl) return;
  resolveVersion().then((version) => {
    versionEl.textContent = `v${version}`;
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function exportJson(ctx) {
  return JSON.stringify(ctx.store.get(), null, 2);
}

/** "Copy" (Export all as JSON) → clipboard.writeText the pretty-printed state. */
export async function copyExportJson(ctx) {
  try {
    await writeText(exportJson(ctx));
    closeSettingsDialog();
    ctx.toast({ message: 'Copied JSON to clipboard.', tone: 'success' });
  } catch {
    closeSettingsDialog();
    ctx.toast({ message: "Couldn't copy. Try again.", tone: 'error' });
  }
}

/** "Download" (Export all as JSON) → Blob + temporary anchor. */
export function downloadExportJson(ctx) {
  const filename = 'wcopy-export.json';
  const blob = new Blob([exportJson(ctx)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  closeSettingsDialog();
  ctx.toast({ message: `Downloaded ${filename}.`, tone: 'success' });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function errorsEl() {
  const dialog = dialogEl();
  return dialog && dialog.querySelector('[data-role="import-errors"]');
}

function showImportErrors(errors) {
  const el = errorsEl();
  if (!el) return;
  el.textContent = errors
    .map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
    .join('\n');
  el.hidden = false;
}

function clearImportErrors() {
  const el = errorsEl();
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}

/**
 * Runs `migrate` then `validateState` on `rawText` (spec §7.4). On failure,
 * lists every `path: message` in the errors `<pre>` and changes nothing. On
 * success, replaces the whole state via one `commit` and offers Undo that
 * restores the previous state.
 */
export function applyImportText(rawText, ctx) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    showImportErrors([{ path: '', message: `Invalid JSON: ${err.message}` }]);
    return;
  }

  let migrated;
  try {
    migrated = migrate(parsed);
  } catch (err) {
    showImportErrors(err.errors || [{ path: '', message: err.message }]);
    return;
  }

  const result = validateState(migrated);
  if (!result.ok) {
    showImportErrors(result.errors);
    return;
  }

  clearImportErrors();
  const previous = ctx.store.get();
  const previousSnapshot = structuredClone(previous);

  ctx.store.commit((state) => {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, result.value);
  });

  const dialog = dialogEl();
  const textarea = dialog && dialog.querySelector('[data-role="import-text"]');
  if (textarea) textarea.value = '';
  closeSettingsDialog();

  ctx.undoable({
    message: 'Imported.',
    undo: () => {
      ctx.store.commit((state) => {
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, previousSnapshot);
      });
    },
  });
}
