# W2A: Core UI integration

## Goal

Turn the static shell into the working app: state loads and renders, cards
are editable, variants work, the fill-screen editor works, the w/copy action
path works end to end with every toast, the paste fallback works, theme and
density apply, and the service worker is registered. After this task the
product owner can use the app for its real purpose.

## Read first

- `CLAUDE.md`
- `docs/spec/2026-09-09-w-copy-technical-spec.md`, all of it, especially §4, §5, §6, §7
- `docs/design/2026-09-09-design-handoff.md` §2, §3, §4
- The reports from wave 1, pasted at the end of this brief by the orchestrator
- `docs/tasks/manual-checklist.md`

## Files you own

- `src/js/main.js`
- `src/js/ui/stack-view.js`, `src/js/ui/piece-card.js`, `src/js/ui/variants.js`, `src/js/ui/expand.js`
- Edits to `src/index.html` (remove the sample content; adjust templates only if you must, and say so)
- Edits to `src/css/app.css` (additions under a clearly commented section; do not restyle what exists)

Leave `side-panel.js` and `settings.js` for the next task. The panel and
settings buttons may open their dialogs empty for now.

## What to build

**`main.js`**: load state (`loadState`), create the store with `saveState`,
apply `data-theme`, `data-density`, `data-accent` on `<html>` from state,
subscribe and render, wire all `[data-action]` buttons through one delegated
click handler on `document`, register `sw.js` after first render and toast
"Update ready" with a Reload action on the worker's update message, and
handle the `beforeinstallprompt` event by simply storing it (no install UI
in this task). Theme "system" must track `prefers-color-scheme` live.

**`stack-view.js`**: `renderStack(state, ctx)` rebuilds the `<ol>` from the
active stack using the templates. Preserve focus and scroll per spec §5.
`ctx` carries the store and toast functions so modules do not import
globals.

**`piece-card.js`**: one card from `tpl-piece` or `tpl-clipboard-piece`.
Textarea `input` → `store.patch` on the active variant's text. Auto-grow.
Enabled switch → `commit`. Delete → `commit` remove, then `undoable` that
re-inserts at the same index. Label button toggles the variants region.

**`variants.js`**: renders the variant rows for a piece; select → `commit`
set active; add → `commit` new variant with empty text, make it active, focus
the textarea; rename inline on the row; delete → `commit` + `undoable`. The
last variant cannot be deleted (hide the button).

**`expand.js`**: opens the expand dialog with a large textarea bound to the
same variant; `input` patches the store; on close, the card textarea reflects
the text without a full render.

**Action path**: spec §6 exactly, using `clipboard.js` from wave 1. Call
`writeDeferred(...)` synchronously in the click handler on WebKit
(`/AppleWebKit/.test(navigator.userAgent) && !/Chrome\//` is not reliable on
iPhone Chrome, so use `writeDeferred` everywhere; it degrades to `writeText`
where `ClipboardItem` is missing). Every outcome toasts per §7.5. The paste
fallback dialog opens on `DENIED` and `UNSUPPORTED`; its `paste` handler
assembles, writes inside the event, saves last output, closes, toasts.

**Add piece**: the add button offers Header, Footer, Text (a tiny popover or
three buttons, your call, matched to the design system) and appends.

**Onboarding**: nothing extra; `createDefaultState` already provides the
example stack. Verify the first press demonstrates the sandwich.

## Acceptance

- `npm test` green (you should not need to touch tests, but run them).
- Every row under "Shell and theme", "Pieces", "Action path", and "PWA and
  offline" (first two rows) in `manual-checklist.md` passes in Chromium.
- No console errors, no CSP violations, no `innerHTML` with user text.
- Typing in a card at 60fps with DevTools performance recording shows no
  layout thrash beyond the auto-grow measurement.

## Git

Work on the current branch in this checkout. Commit when green. Do not push.

## Report

Commit SHAs; checklist rows passed and any that could not be verified and
why; deviations from the spec; anything W2B needs to know about `main.js`
wiring and `ctx`.
