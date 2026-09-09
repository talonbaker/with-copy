# W3B: Share link and QR code

## Goal

Move a stack between devices without a backend: copy a link, or show a QR
code on desktop for the phone to scan. Opening the link imports the stack.

## Read first

- `CLAUDE.md`
- `docs/spec/2026-09-09-w-copy-technical-spec.md` §4.5, §7.4, §7.5, §12
- `docs/design/2026-09-09-design-handoff.md` §7
- The W2B report, pasted at the end of this brief
- `docs/tasks/manual-checklist.md` ("Share link")

## Files you own

- `src/js/qr.js`
- Edits to `src/js/ui/settings.js` (enable the two share buttons), `src/js/main.js` (fragment import on load), `src/css/app.css` (commented "share" section)

## What to build

**Share buttons** in Settings: "Copy link" builds the URL with
`encodeStack` + `buildShareUrl` and writes it with `clipboard.writeText`,
toasting "Link copied". "Show QR" renders the same URL as a QR code into a
`<canvas>` in a small dialog with the URL beneath it and a Copy button.

**`qr.js`**: a dependency-free QR encoder. Byte mode, error correction
level M, automatic version selection up to version 40, standard masking with
penalty scoring. Export `encodeQR(text) -> { size, modules: Uint8Array }`
and `drawQR(canvas, text, { scale, margin })`. Write it from the
specification, cleanly, with comments explaining each stage (data encoding,
Reed-Solomon, interleaving, placement, masking). This is a portfolio piece;
the implementation should be readable. Add `tests/qr.test.js` in `node:test`
covering: a known short string produces the expected size and a stable
module bitmap (assert a hash or a few sampled rows you verified by decoding
with a phone), the finder patterns are in place, and long input selects a
higher version.

**Import on load** in `main.js`: spec §4.5 last paragraph. Re-id the stack
and everything inside it, append, activate, toast with Undo, clear the
fragment with `history.replaceState`. If decoding fails, toast "That link
didn't contain a valid stack." and clear the fragment.

## Acceptance

- `npm test` green including the QR tests.
- Every row under "Share link" in `manual-checklist.md` passes; verify the
  QR by scanning it with a phone camera from the screen if you can, or by
  decoding the canvas with a second independent implementation in a
  throwaway script that is not committed.
- The share URL for the onboarding stack is under 1 KB.

## Git

Work on the current branch in this checkout. Commit when green. Do not push.

## Report

Commit SHAs; checklist rows passed; the share URL length for the onboarding
stack; how you verified the QR decodes.
