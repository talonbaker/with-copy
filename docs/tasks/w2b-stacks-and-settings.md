# W2B: Stacks panel and settings

## Goal

Multiple stacks and the settings screen: the left slide-out panel with the
stack list, stack create/rename/delete with undo, switching with accent
change, and the settings dialog with theme, density, export, and import.
Share link and QR are a later task; leave their buttons present but
disabled with a tooltip "Coming next".

## Read first

- `CLAUDE.md`
- `docs/spec/2026-09-09-w-copy-technical-spec.md` §3, §4.1, §4.3, §4.6, §7.1, §7.4, §7.5
- `docs/design/2026-09-09-design-handoff.md` §2 (Stacks), §4 (structure, color, settings), §6
- The W2A report, pasted at the end of this brief
- `docs/tasks/manual-checklist.md`

## Files you own

- `src/js/ui/side-panel.js`, `src/js/ui/settings.js`
- Edits to `src/js/main.js` (wiring only), `src/app/index.html` (panel and settings templates), `src/css/app.css` (additions under a commented section)
- `src/sw.js`: append every new file you create to `PRECACHE_URLS`

## What to build

**Side panel**: opens from the menu button, slides in from the left with a
backdrop, closes on backdrop click, Escape, and after choosing a stack.
Lists stacks from `tpl-stack-row` with accent dot and active mark. Tapping a
row commits `activeStackId` and re-renders (accent changes across the UI).
"New stack" creates from `createStack` with the next unused accent and the
name "Untitled stack", makes it active, and focuses the name for editing.
Stack rename is inline on the top bar title (click to edit, Enter or blur to
commit). Delete lives on the row (or a swipe-revealed action if you can do
it cleanly); it is immediate with `undoable`; the delete control is hidden
when only one stack exists.

**Settings dialog**: spec §7.4. Theme and density radios commit to
`state.settings` and apply immediately. Export: "Copy JSON" writes the
pretty-printed state via `clipboard.writeText`; "Download" uses a Blob and a
temporary anchor (works in the app itself; the artifact sandbox limitation
does not apply here). Import: a textarea to paste into and a file input;
both run `migrate` then `validateState`; on failure render every
`path: message` in a `<pre>` and change nothing; on success replace the
state via one `commit` and offer Undo that restores the previous state.
About: app name, `VERSION` read from the registered service worker if
available (or "dev"), link to the repository.

## Acceptance

- `npm test` green.
- Every row under "Stacks" and "Settings, export, import" in
  `manual-checklist.md` passes in Chromium.
- Accent, theme, and density changes are visible without reload and persist
  across reload.
- No console errors, no CSP violations.

## Git

Work on the current branch in this checkout. Commit when green. Do not push.

## Report

Commit SHAs; checklist rows passed; deviations; anything the share-link task
needs to know about the settings dialog structure.
