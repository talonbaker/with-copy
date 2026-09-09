# W1A: Core logic modules

## Goal

Build the four pure-ish modules everything else depends on, with `node:test`
coverage, exactly to the contracts in the technical spec §3 and §4.1 to 4.3
and 4.5.

## Read first

- `CLAUDE.md`
- `docs/spec/2026-09-09-w-copy-technical-spec.md` §1, §3, §4.1, §4.2, §4.3, §4.5, §8, §13
- `docs/design/2026-09-09-design-handoff.md` §2 (data model rules and the growth edge case)

## Files you own

- `package.json` (scripts and `"type": "module"` only; no dependencies)
- `src/js/schema.js`
- `src/js/merge.js`
- `src/js/store.js`
- `src/js/link.js`
- `tests/schema.test.js`, `tests/merge.test.js`, `tests/store.test.js`, `tests/link.test.js`

Do not create or edit anything else. If a contract in the spec is impossible
or ambiguous, implement the closest faithful reading and say so in your report.

## Requirements beyond the spec text

- `schema.js` has no DOM access. `newId` uses `crypto.getRandomValues`,
  which exists as a global in Node 18+ and in browsers.
- `validateState` and `validateStack` collect *every* error, not just the
  first. Paths use the exact notation in spec §4.1. Reject unknown keys at
  every level.
- `migrate` accepts a version-1 object and returns it validated. Build the
  function so a version-2 case is one more branch, not a rewrite.
- `store.js` must work in Node for tests: `createStore` takes `save` as an
  injected function; `loadState`/`saveState`/`loadLastOutput`/`saveLastOutput`
  are the only functions that touch `localStorage`, and they guard against
  it being absent or throwing.
- Coalesced save: ten `patch` calls in one synchronous run cause exactly one
  `save` call. Prove it in a test with a counting `save`.
- `link.js` runs in Node 18+ (`CompressionStream` is global). Use
  `'deflate'`, not `'gzip'` or `'deflate-raw'`. base64url with no padding.
- The onboarding stack text is in spec §8.

## Acceptance

- `npm test` passes with at least the cases listed in spec §13 for each file.
- No file imports anything outside `src/js/` and Node/browser globals.
- Every exported function has a one-paragraph JSDoc comment describing
  inputs, outputs, and thrown errors.

## Git

You are in an isolated worktree on your own branch. Commit there with
`git add` and `git commit` (message style in `CLAUDE.md`). Do not push.

## Report

Reply with: the branch name and final commit SHA; `npm test` summary line;
any deviation from the spec and why; anything another module will need to
know that the spec did not say.
