# W1C: Platform, clipboard adapter, probe, PWA, deploy

## Goal

Everything that touches the browser platform or the hosting: the clipboard
adapter and the probe page that exercises it on real devices, the service
worker and manifest, icons, and the GitHub Pages workflow.

## Read first

- `CLAUDE.md`
- `docs/spec/2026-09-09-w-copy-technical-spec.md` §1, §4.4, §9, §10, §11, §12
- `docs/design/2026-09-09-design-handoff.md` §5
- `docs/setup/github-pages-dns.md`

## Files you own

- `src/js/clipboard.js`
- `src/probe.html`, `src/js/probe.js`, `src/css/probe.css`
- `src/sw.js`
- `src/manifest.webmanifest`
- `src/CNAME` (content: `withcopy.app`)
- `src/icons/icon.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`
- `.github/workflows/pages.yml`
- `.gitignore`, `.editorconfig`

## What to build

**`clipboard.js`**: spec §4.4 exactly. Map every DOMException you can
provoke (`NotAllowedError`, `SecurityError`, document-not-focused) to a
`ClipboardError` code. `writeDeferred` must call `navigator.clipboard.write`
synchronously with a `ClipboardItem` whose `text/plain` is a `Blob` promise,
and must fall back to `writeText(await promise)` where `ClipboardItem` is
missing. Document the WebKit reasoning in a comment block at the top.

**Probe page**: spec §9. Self-contained page with its own small stylesheet
(you may not touch `app.css`). One button per experiment, a result line
under each showing outcome, error name, and error message, plus the user
agent string and whether the page runs standalone
(`matchMedia('(display-mode: standalone)')`). A "Copy results" button that
writes the whole report as text. The page must also work when opened as an
installed PWA. Include its own `<meta>` CSP identical to the app's.

**Service worker**: spec §10. Precache list written out explicitly (no
globbing at runtime). `VERSION` literal `'dev'`. Skip the probe files.
Cache-first for precached URLs, network-only for everything else. On
activate, delete every other cache and `clients.claim()`. Post a message to
clients when a new version has activated so the app can toast.

**Manifest and icons**: spec §10. Design a simple mark: a rounded square in
the neutral dark, with a "w/" wordmark in the green accent, legible at 48px.
Produce `icon.svg` by hand, then rasterize the PNGs with the pre-installed
Chromium via a throwaway Playwright script you run and then delete (Playwright
is dev-side tooling here, nothing about it is committed). The maskable icon
keeps the mark inside the central 80% safe zone.

**Workflow**: spec §11. Trigger on push to `main` and `workflow_dispatch`.
Steps: checkout; `node --version`; `npm test`; `sed` the SHA into `src/sw.js`;
`actions/configure-pages`; `actions/upload-pages-artifact` with `path: src`;
`actions/deploy-pages`. Concurrency group `pages`, cancel-in-progress false.

**`.gitignore`**: `node_modules/`, `.DS_Store`, `*.log`, and any Playwright
output directory you use. **`.editorconfig`**: 2-space, LF, utf-8, final
newline.

## Acceptance

- `clipboard.js` imports cleanly in a browser module and has no top-level
  side effects.
- The probe page loads from a local server with no console errors and each
  button produces an on-screen result on desktop Chromium (reads will need a
  permission grant; Playwright can grant `clipboard-read` and
  `clipboard-write` if you want to automate a smoke run).
- `sw.js` registers without error and, after one load, the app shell serves
  from cache with the network disabled in DevTools.
- The workflow file passes `actionlint`-style sanity: valid YAML, correct
  permissions block, correct action versions (use the current major versions).
- PNGs exist at the exact sizes and the SVG renders.

## Git

You are in an isolated worktree on your own branch. Commit there. Do not push.

## Report

Branch and SHA; the exact precache list; how you rasterized the icons; the
result of running the probe on desktop Chromium (which experiments passed);
anything about WebKit behaviour you could not verify and the product owner
must test on an iPhone.
