# Task briefs

Each file is a self-contained brief for one agent. Waves run in order; tasks
inside a wave run in parallel on disjoint files.

| Wave | Brief | Owns |
|---|---|---|
| 1 | `w1a-core-logic.md` | `src/js/{schema,merge,store,link}.js`, `tests/`, `package.json` |
| 1 | `w1b-ui-shell.md` | `src/app/index.html`, `src/css/*`, `src/js/ui/{toast,undo}.js` |
| 1 | `w1c-platform.md` | `src/js/clipboard.js`, `src/index.html` (root forwarder), `src/probe.html`, `src/js/probe.js`, `src/sw.js`, `src/manifest.webmanifest`, `src/CNAME`, `src/icons/*`, `.github/workflows/pages.yml`, `.gitignore`, `.editorconfig` |
| 2 | `w2a-core-ui.md` | `src/js/main.js`, `src/js/ui/{stack-view,piece-card,variants,expand}.js`, edits to `app/index.html` and `app.css` |
| 2 | `w2b-stacks-and-settings.md` | `src/js/ui/{side-panel,settings}.js`, edits to `main.js`, `app/index.html`, `app.css` |
| 3 | `w3a-drag-reorder.md` | `src/js/ui/drag.js`, edits to `stack-view.js`, `app.css` |
| 3 | `w3b-share-link-qr.md` | `src/js/qr.js`, edits to `settings.js`, `main.js`, `app.css` |
| 4 | `w4-review.md` | read everything; fix defects; no new features |

Every brief ends with the same three obligations: `npm test` green, the
relevant rows of `manual-checklist.md` walked in a real browser, and a
report in the format the brief specifies.
