# W1B: UI shell and design system

## Goal

Build the static page, the design tokens, the component styles, and the toast
and undo modules, so that the integration agent has finished markup and CSS to
render into. This task is where the app gets its look. Treat it as the visual
design pass for a portfolio piece.

## Read first

- `CLAUDE.md`
- `docs/design/2026-09-09-design-handoff.md` §3, §4 (the whole visual brief)
- `docs/spec/2026-09-09-w-copy-technical-spec.md` §1, §4.6, §7, §12

## Files you own

- `src/index.html`
- `src/css/tokens.css`
- `src/css/app.css`
- `src/js/ui/toast.js`
- `src/js/ui/undo.js`

Do not create other files. Reference `/icons/icon.svg` for the favicon and
`/manifest.webmanifest` for the manifest link even though another agent is
producing them in parallel; they will exist at merge time.

## What to build

**`index.html`**: the DOM skeleton in spec §7.1, the CSP meta from §12, the
manifest and icon links from §10, and `<template>` elements the integration
agent will clone:

- `tpl-piece` (spec §7.2 card), `tpl-clipboard-piece`, `tpl-variant-row`
  (radio-style row with label, rename, delete), `tpl-stack-row` (panel row
  with accent dot, name, active mark), and the inner content of the settings,
  expand, and paste-fallback dialogs.
- An inline `<svg>` sprite of `<symbol>`s for every icon used: menu, gear,
  expand, delete, drag handle, clipboard, add, check, close, undo, link, qr,
  chevron. Simple 24px stroked icons, consistent weight.
- For your own visual development, place three sample cards (header,
  clipboard, footer) inside the `<ol class="wc-stack">` using the template
  markup, plus a sample variants list open on one of them. Mark that block
  with `<!-- sample content: remove in W2A -->`.
- Two external module scripts at the end of body: `js/main.js` (will not
  exist yet; that is fine) and nothing else.

**`tokens.css`**: everything in spec §7.3. Pick the neutral palette and the
eight accents yourself; check contrast. Provide the light set on bare
`:root`, dark under `prefers-color-scheme: dark` guarded by
`:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`.
Density and accent are attributes on `:root`.

**`app.css`**: layout and every component in §7.1 and §7.2, the side panel
with a backdrop, the three dialogs (native `<dialog>` styled, including
`::backdrop`), the toast, the switch, the action bar pinned to the bottom of
the viewport with safe-area insets, and the fill-screen expand dialog that
covers the viewport on narrow screens and is a large centered sheet on wide
ones. Motion only via `transform` and `opacity`; zero it under
`prefers-reduced-motion`.

**`toast.js`, `undo.js`**: spec §4.6. `showToast` owns the
`[data-role="toast"]` element; renders message, optional action button, and a
close button; slides in from the top under 640px and from the bottom above.
`undoable` wraps `showToast` with one undo slot.

## Visual direction

Modern, minimal, warm. Neutral surfaces, generous radius, soft shadows in
light mode and hairline borders in dark. The w/copy button is the one
saturated element: full accent fill, large, pinned, unmistakable. Kind
labels are small uppercase chips in muted kind colors. The clipboard card is
visually distinct: dashed border, centered icon, caption. The page should
look finished with the sample content in it. Screenshot it at 390px and
1280px in both themes and describe what you see in your report.

## Acceptance

- Opening `src/index.html` from a local server shows the sample stack with no
  console errors and no CSP violations (the missing `main.js` 404 is expected).
- Toggling `data-theme`, `data-density`, and `data-accent` on `<html>` in
  DevTools visibly changes the page.
- `showToast` and `undoable` work when called from the console after
  importing them as modules.

## Git

You are in an isolated worktree on your own branch. Commit there. Do not push.

## Report

Branch and SHA; the palette you chose (hex values for neutrals and the eight
accents in light and dark); the list of template ids and symbol ids you
defined; screenshots described in words; anything the integration agent
needs to know about class names or structure beyond the spec.
