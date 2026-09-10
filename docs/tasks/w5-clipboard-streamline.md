# W5: Make the w/copy button the paste gesture on iPhone

## The evidence (real iPhone, iOS 18.7, WebKit)

The product owner ran `probe.html` on a real iPhone. Results:

| Experiment | Result |
|---|---|
| 3. `await readText()` then `await writeText()` | **FAILED — DENIED** |
| 4. `writeDeferred(readText().then(transform))` | OK |
| 5. Paste-event path | OK, wrote 136 chars |

**Read experiment 4's "OK" with suspicion.** The clipboard at that moment held
text the probe page had written itself (its content showed the accumulated
tags `[read-then-write] [wrapped] [pasted+transformed]`). WebKit skips the
native Paste callout entirely when the clipboard's current contents came from
the same origin, so experiment 4 never exercised the case that matters: a
clipboard holding text copied from **another app**. That is the only case
w/copy exists to serve.

The product owner's real-world report fills that gap: pressing w/copy with
foreign clipboard content shows **no paste callout at all** and fails
immediately. Their words: Chrome "is not asking me for paste, permissions, but
simply failing until I hit the paste button."

**Diagnosis.** With foreign clipboard content WebKit must show the Paste
callout to satisfy `readText()`. The current action path calls
`navigator.clipboard.write()` synchronously in the same gesture (that is what
`writeDeferred` does, and it is the right shape for a *write*). Holding a
clipboard write open across the read appears to suppress the callout, so the
read is denied instantly and the user sees an error for something that never
had a chance to succeed. Experiment 5 proves the way out: a real `paste`
event needs no permission, no callout arbitration, and no prompt.

**Only experiment 5 is trustworthy for the real case.** Build on it.

## The goal

The product owner's direction, verbatim in intent: the fewest possible taps,
and *no notification, prompt, sheet, or error should appear because of the
platform's paste requirement*. If a paste gesture is unavoidable, the w/copy
button itself must be that gesture. The success toast stays; it is
confirmation, not a prompt.

Target on iPhone: **tap w/copy, tap the native Paste callout, done.** Two
taps, no keyboard, no error, no dialog. Same as today's manual workaround,
minus the failure and minus the sheet.

Desktop Chrome keeps its current one-tap path; the permission there is
granted once per origin and persists. Do not regress it.

## Read first

- `CLAUDE.md`
- `docs/spec/2026-09-09-w-copy-technical-spec.md` §4.4, §6, §7.5
- `js/clipboard.js`, and in `js/main.js`: `runWCopy`, `handlePasteFallback`,
  `openPasteFallback`, and the delegated click handler's `wcopy` case
- `app/index.html` (the action bar and the paste dialog), `css/app.css`

## Files you own

`js/clipboard.js`, `js/main.js` (action path only), `app/index.html`
(action bar), `css/app.css` (a commented "W5" section), `sw.js` (bump
`VERSION`), `tests/` (tests for any pure helper you add), `probe.html` and
`js/probe.js` (add the experiments below), and spec §4.4, §6, §7.5 to match.

## Design

**1. Two clipboard strategies, chosen per device.**

- `read` — call `readText()`, transform, `writeText()`. Desktop Chrome.
- `paste` — the button is a paste target; the user's native Paste supplies
  the text; we transform and write inside the `paste` event, which is itself
  a user gesture and needs no permission. iPhone and anything that has ever
  refused a read.

Persist the choice in `localStorage` under `wcopy.clipboardStrategy`. Seed it
on first run: WebKit on iOS starts as `paste` (detect by feature and platform
together, e.g. `navigator.maxTouchPoints > 0` plus the absence of a working
read; prefer a capability probe over user-agent sniffing where you can).
Anything else starts as `read` and demotes itself to `paste` permanently the
first time a read is denied. **A demotion is silent.** No error toast ever
fires because of it; the app simply switches the button into paste mode and
tells the user what to do next through the button's own label.

**2. The button as the paste target.**

Make the action control able to receive a paste without summoning a keyboard:

- A `contenteditable` element (or an editable host overlaying the button)
  with `inputmode="none"`, `enterkeyhint="done"`, `autocapitalize="off"`,
  `autocorrect="off"`, `spellcheck="false"`, and an accessible name.
  `inputmode="none"` is what suppresses the software keyboard on iOS 16+;
  verify it in your report.
- In `paste` strategy the label reads **"Paste to w/copy"** so the next
  action is self-evident; in `read` strategy it stays **"w/copy"**.
- Tapping it focuses it, which is what makes iOS offer Paste in its native
  edit menu. On the `paste` event: `preventDefault()`, take the text from
  `event.clipboardData`, run the growth guard and `assemble`, `writeText` the
  result **inside the handler**, then clear the element's content, blur it,
  and toast "Wrapped with copy".
- The element must never retain pasted text, never scroll the page on focus,
  and must look identical to a button in both strategies.
- Keyboard users get the same path for free: focus it and press the paste
  shortcut.

If the native edit menu does not appear reliably on a single tap, a deliberate
long-press is the documented iOS gesture for it; say so on the button
(a small secondary line, not a toast) rather than opening a sheet.

**3. Retire the failure sheet from the normal path.** The paste-fallback
dialog stays in the code only for the genuinely broken case (no clipboard API
at all). It must not open as a consequence of a denied read any more, because
a denied read is now an expected, silent, handled outcome.

**4. Keep every existing guarantee.** Growth guard by exact match against the
app's own last output, empty-clipboard refusal, disabled clipboard piece
(write only, no read, no paste needed), all-disabled stack, and every toast in
spec §7.5 that is not listed for removal below.

**5. Toast table changes (spec §7.5).** Remove both "Paste it here instead."
rows and the "Tap w/copy again." row; those states are no longer reachable.
Everything else stays verbatim.

## Extend the probe first

Before changing the action path, add these to `probe.html` so the product
owner can settle the open questions on a real device in one pass. Each must
print its outcome on screen and be included in "Copy results".

6. **Foreign-clipboard read.** Instructions on the page: "Copy some text in
   another app first, then tap." Then `readText()` alone. Does the native
   Paste callout appear? Does it resolve?
7. **Foreign-clipboard `writeDeferred`.** Same precondition, then experiment
   4's pattern. This is the experiment that decides whether the current
   architecture was ever viable with foreign content.
8. **Contenteditable paste target.** A styled button-like editable with
   `inputmode="none"`. Reports: did the keyboard stay down, did the edit menu
   offer Paste, did the `paste` event fire, did the write inside it succeed.
9. **Same as 8 but one tap** — measure whether the edit menu appears on the
   first tap or needs a long-press.

Ship the probe changes as their own commit so they can be deployed and tested
while the rest of the work continues.

## Acceptance

- `npm test` green, with tests for the pure strategy-decision helper: given
  `{ storedStrategy, readOutcome }` it returns the next strategy and whether
  to attempt a read. No DOM in that helper.
- Desktop Chromium, read strategy: unchanged one-tap behaviour, growth guard,
  empty clipboard, disabled clipboard piece, all-disabled stack.
- Chromium with clipboard-read denied: the app switches to paste strategy
  **with no error toast**, relabels the button, and a real paste on the button
  produces the wrapped output.
- Focus, blur, and content-clearing of the editable leave no stray text and no
  layout shift.
- No `securitypolicyviolation`, no console errors, no inline styles.
- List for the product owner exactly what needs the iPhone to confirm.

## Git

Branch `feat/clipboard-streamline` off `main`. Commit in logical units. Push
the branch. Do not merge, and do not open the pull request yourself; the
orchestrator does that.

## Report

Commit SHAs; the strategy-selection rule you implemented; whether
`inputmode="none"` suppressed the keyboard in your testing; the exact toast
table after your changes; and the numbered list of things only a real iPhone
can confirm.
