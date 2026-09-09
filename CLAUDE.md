# w/copy

A local-first web app that wraps clipboard text with reusable pieces and
writes the result back to the clipboard. Vanilla HTML, CSS, JS. No framework,
no dependencies, no build step, no backend.

## Read first

- `docs/design/2026-09-09-design-handoff.md` for product, UX, visual design.
- `docs/spec/2026-09-09-w-copy-technical-spec.md` for architecture and
  module contracts. Interfaces there are contracts; change the spec first.
- `docs/planning/decisions.md` for every decision and why.
- `docs/tasks/` for the brief you were assigned.

## Rules

- Zero runtime dependencies. `package.json` has scripts only. Never add a
  package. Never add a bundler, transpiler, or preprocessor.
- Everything under `src/` is served as-is. Native ES modules, no JSX, no
  TypeScript, no Sass.
- No inline `<script>`, no inline event handlers, no `eval`, no `innerHTML`
  with user text. The page ships a strict Content-Security-Policy meta tag.
- No external requests at runtime. No web fonts, no CDNs, no analytics.
- Animate only `transform` and `opacity`. Respect `prefers-reduced-motion`.
- Every user action gets visible feedback. Errors are never silent.
- No confirmation dialogs. Destructive actions apply immediately with Undo.
- Chrome on desktop and iPhone (WebKit). Write clipboard code to WebKit's
  rules; see spec §4.4.
- Run `npm test` before every commit and only commit green. Pure modules
  (`schema`, `merge`, `link`, `store`) must have `node:test` coverage.
- Stay inside the files your brief assigns. If you need a change elsewhere,
  say so in your report instead of making it.
- Commit with a clear `type: summary` message (`feat:`, `fix:`, `docs:`,
  `test:`, `chore:`). Do not push unless your brief says to.
- Craft over speed. This is a portfolio piece. No placeholder UI, no TODOs
  left in shipped code.

## Commands

```
npm test          # node --test tests/
python3 -m http.server -d src 8000   # serve locally at http://localhost:8000
```
