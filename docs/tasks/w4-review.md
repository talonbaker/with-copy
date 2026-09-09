# W4: Review and hardening

## Goal

Read the whole app as a demanding reviewer would, fix what is wrong, and
leave it in a state the product owner would be proud to show. No new
features.

## Read first

- `CLAUDE.md`
- `docs/design/2026-09-09-design-handoff.md`
- `docs/spec/2026-09-09-w-copy-technical-spec.md`
- `docs/tasks/manual-checklist.md`
- Every file under `src/` and `tests/`

## Scope

You may edit any file under `src/`, `tests/`, and `README.md`. Do not change
module contracts without noting it. Do not add features.

## Checks

1. **Walk the entire manual checklist** in Chromium at 390px and 1280px, in
   light and dark. Fix every failure.
2. **Design handoff conformance.** Go through §2, §3, §4 of the handoff line
   by line and confirm each statement is true of the app. List any that are
   not and fix them.
3. **Spec conformance.** Every toast message in §7.5 appears verbatim. Every
   validation rule in §3 is enforced. The action path matches §6.
4. **Security.** Grep for `innerHTML`, `insertAdjacentHTML`, `eval`,
   `Function(`, inline handlers, and any URL that is not same-origin. User
   text must only ever reach the DOM through `textContent` or form values.
5. **Accessibility.** Keyboard-only pass of the whole app. Every icon button
   has a label. Dialogs trap focus and restore it on close. Live region
   announces toasts. Contrast of text and of the accent button in all eight
   accents, both themes.
6. **Performance.** Lighthouse in Chromium for the app page: aim for 100 in
   Performance, Accessibility, Best Practices, and a passing PWA audit.
   Fix what it flags where fixable without a build step.
7. **Code quality.** Dead code, duplicated helpers, inconsistent naming,
   missing JSDoc on exports, console noise. Fix.
8. **README.md.** Replace the stub with a short, accurate README: what the
   app is, how to run it locally, how tests run, the deploy path, a pointer
   to `docs/`.

## Acceptance

- `npm test` green.
- Full checklist green, with the exceptions that need a real iPhone listed.
- Lighthouse scores in the report.

## Git

Work on the current branch. Commit in logical units. Do not push.

## Report

Commit SHAs; what you fixed, grouped by the eight checks; Lighthouse
numbers; the list of handoff statements you could not make true and why;
what needs a real iPhone to verify.
