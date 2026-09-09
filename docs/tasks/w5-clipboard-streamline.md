# W5: Streamline the clipboard path on iPhone

## Why

Product owner's report from real devices (2026-09-09): on iPhone, pressing
w/copy does not show the native paste prompt. The read fails, w/copy shows
an error toast and the paste sheet, the user taps the field, taps Paste, and
then everything works. That is three or four taps and an error message on
the platform's normal path. The browser itself gives no indication anything
happened, so the error toast is the only signal, and it reads as a failure
when it is really "this platform needs a paste".

The ceiling on iPhone is set by WebKit, not by us: the web cannot read the
clipboard without one explicit paste gesture, ever. The product owner's
direction (2026-09-09): the fewest possible taps, ideally none beyond the
button; if the platform demands a paste gesture, **the w/copy button itself
should be that gesture**, and no prompt, sheet, or error should appear
because of it. The success toast stays; it is confirmation, not a prompt.
Never a dead end on any path.

Concretely, on a device that has refused a clipboard read, the action
button becomes the paste target: pressing it puts the user directly in a
state where the next native "Paste" action completes the wrap, with the
button's own label telling them so ("Paste to w/copy"). Explore whether a
contenteditable action button can receive the paste from the native
long-press callout in one gesture, and whether the same-origin exemption
(WebKit skips the callout when the clipboard was last written by this
page) can be exploited for repeat presses. Report what only an iPhone can
confirm; the probe page is being extended in parallel to measure it.

## Read first

- `CLAUDE.md`
- `docs/spec/2026-09-09-w-copy-technical-spec.md` §4.4, §6, §7.5
- `js/clipboard.js`, the action path in `js/main.js` (`runWCopy`,
  `handlePasteFallback`, `openPasteFallback`), the paste dialog markup in
  `app/index.html`
- The probe results from the product owner's iPhone, pasted at the end of
  this brief by the orchestrator, if available. They decide between the two
  read strategies below.

## Files you own

- `js/clipboard.js`, `js/main.js` (action path only), `app/index.html`
  (paste and ready dialogs), `css/app.css` (a commented "W5" section),
  `sw.js` (bump `VERSION`), `tests/` (new tests for any pure helper you add),
  and the spec sections §4.4, §6, §7.5 to match what you build.

## Design

**1. Read first, alone.** In the tap handler call `readText()` by itself,
synchronously, before anything else touches the clipboard. On WebKit this is
what surfaces the native "Paste" callout next to the finger; on desktop
Chrome it is the one-time permission prompt. Do not call
`navigator.clipboard.write` in the same gesture before the read resolves;
the current code does, and the evidence is that WebKit then rejects the read
without showing the callout. Keep `writeDeferred` in `clipboard.js` only if
the probe results show the deferred pattern succeeding where the sequential
one fails; otherwise delete it and its comment block, and say so.

**2. Then write.** After the read resolves, apply the growth guard and
`assemble`, then `writeText(result)`.

**3. Write rejected: recover with one tap, never an error.** If `writeText`
rejects with `DENIED` here, the read succeeded but the tap's activation
expired during the await (WebKit). Hold the result in memory and show a
small "ready" sheet or toast with one large button, "Tap to copy". That tap
is a fresh gesture, so `writeText` succeeds. Tone is success or info, never
error: nothing failed.

**4. Read rejected: go straight to paste, calmly.** If `readText` rejects
with `DENIED` or `UNSUPPORTED`, open the paste sheet immediately with no
error toast. The sheet's copy states the situation plainly: "This browser
needs a paste. Tap the box, then tap Paste." On the `paste` event, assemble
and write inside the event, close, and toast "Wrapped with copy".

**5. Remember which path this device needs.** Store `wcopy.clipboardPath`
in localStorage: `read` when a read succeeds, `paste` when it is denied.
When `paste` is remembered, the next press opens the paste sheet
immediately instead of attempting a read that will fail, so there is no
delay and no flash of failure. The sheet carries a small text link, "Try
reading the clipboard again", which clears the memory and retries the read
in that tap.

**6. Disabled clipboard piece.** No read is needed; `writeText` directly in
the tap. Unchanged in behaviour, but route it through the same recovery in
step 3 if the write is rejected.

**7. Toasts.** Update the §7.5 table: remove the two "Paste it here instead"
error rows, add "Ready. Tap to copy." (info) if you use a toast for step 3,
and keep every other row verbatim.

## Acceptance

- `npm test` green, with tests for any pure helper (path memory, decision
  function that maps `{ remembered, readOutcome, writeOutcome }` to the next
  step).
- Desktop Chrome: first press prompts once, then every press is one tap and
  one success toast. No regression on the growth guard, empty clipboard,
  disabled clipboard piece, or all-disabled stack.
- Chromium with clipboard-read denied (Playwright can deny it): press opens
  the paste sheet directly, no error toast; pasting produces the wrapped
  output; the memory makes the next press open the sheet at once; the retry
  link clears it.
- Simulated activation expiry (stub `navigator.clipboard.writeText` to
  reject once with `NotAllowedError` after a resolved read): the ready sheet
  appears; its button writes successfully.
- No `securitypolicyviolation`, no console errors.
- What only a real iPhone can confirm is listed in your report for the
  product owner: the native callout appears on press, the whole flow is two
  taps, and the installed PWA behaves the same as the browser tab.

## Git

Work on the branch the orchestrator names. Commit when green. Do not push.

## Report

Commit SHAs; which read strategy you kept and why; what the product owner
must confirm on the iPhone; the updated toast table.
