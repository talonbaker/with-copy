# W3A: Drag to reorder

## Goal

Pieces reorder by dragging their handle, on mouse and on touch, with the
other cards animating into place, plus a keyboard alternative. This is the
single most visible piece of craft in the app. Make it feel excellent.

## Read first

- `CLAUDE.md`
- `docs/spec/2026-09-09-w-copy-technical-spec.md` §4.7, §5, §7.2
- `docs/design/2026-09-09-design-handoff.md` §2 (Pieces), §4 (visual tone)
- `docs/tasks/manual-checklist.md` ("Reorder")

## Files you own

- `src/js/ui/drag.js`
- Edits to `src/js/ui/stack-view.js` (call `enableReorder` after render; commit the reorder)
- Edits to `src/css/app.css` (a commented "drag" section)
- `src/sw.js`: append `/js/ui/drag.js` to `PRECACHE_URLS`

## What to build

`enableReorder(listEl, { handleSelector, itemSelector, onReorder })` per the
spec. Pointer Events only (`pointerdown` on the handle, `setPointerCapture`,
`pointermove`, `pointerup`/`pointercancel`). `touch-action: none` on the
handle only, so the page still scrolls when touching anywhere else. The
lifted card gets a raised style and follows the pointer via `transform`.
As the pointer crosses the midpoint of a sibling, the sibling shifts by the
dragged card's height using a `transform` transition (FLIP), so nothing
reflows during the drag. On drop, clear all transforms in one frame, call
`onReorder(from, to)`, and let the structural render place the cards; the
final positions must match the transformed positions so there is no jump.
Auto-scroll when dragging near the top or bottom edge of the viewport.
Keyboard: handle is focusable; Arrow Up/Down moves the item and keeps focus
on the handle after re-render; announce the move via the toast's live region
or a visually hidden live region.

Respect `prefers-reduced-motion`: no shift animation, instant placement.

## Acceptance

- `npm test` green.
- Every row under "Reorder" in `manual-checklist.md` passes in Chromium,
  including touch emulation at 390px.
- A DevTools performance recording during a drag shows no layout or paint
  from the shift animation (compositor only), except the auto-scroll.

## Git

Work on the current branch in this checkout. Commit when green. Do not push.

## Report

Commit SHAs; checklist rows passed; how you handled the drop-to-render
handoff without a jump; any edge cases you found (dragging the only card,
dragging while variants are expanded).
