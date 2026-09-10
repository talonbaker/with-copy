# W6: i/copy — accumulate clipboard chunks

## Why

From the product owner (2026-09-10): sometimes you can only copy a few
sections of text at a time, but you want all of them in one block. Today that
means juggling a scratch document. i/copy removes the juggling:

> copy, hit i/copy, copy, hit i/copy … and the clipboard grows.

Concretely: clipboard empty → copy "A" → i/copy → clipboard is "A" → copy "B"
→ i/copy → clipboard is "A" + separator + "B" → copy "C" → i/copy → "A B C".
No header, no footer. Plain accumulation.

## Button, not a block — and why

The product owner asked whether this should be a second button or a new piece
kind (a "previous clipboard" block). Build it as a **button**. Reasoning to
respect, not re-litigate:

- A block would take part in every w/copy press, which changes what w/copy
  does. The product owner was explicit that i/copy output is *not* sandwiched.
- Pieces are configuration: per stack, reorderable, saved, edited. The pile is
  a transient scratch buffer with a completely different lifetime. Modelling
  it as a piece would put a mutable runtime buffer inside the exported JSON
  and the share link, where it does not belong.
- Two verbs deserve two buttons. "Wrap" and "stack" are different actions.

## The pile

- Stored in `localStorage` under `wcopy.pile` as `{ chunks: string[] }`.
  **Never part of the exported JSON or the share link.** It is not stack
  configuration.
- One pile, shared across stacks. It is a property of the clipboard workflow,
  not of a stack.
- Chunks are joined with the active stack's `separator` (same rule as
  `assemble`: trailing whitespace trimmed per chunk, leading kept).
- Add a pure module `js/pile.js` with the logic and `tests/pile.test.js`
  covering it. Suggested surface, adjust if you find better:

```js
export function loadPile();                  // { chunks: [] } when absent or unreadable
export function savePile(pile);
export function appendChunk(pile, text);     // returns a NEW pile; ignores empty/whitespace-only
export function renderPile(pile, separator); // the joined string
export function clearPile();
```

## Behaviour

Pressing i/copy:

1. Obtain the clipboard text using **the same strategy machinery W5 builds**
   for w/copy (read on desktop, the button-as-paste-target path on iPhone).
   The two buttons must share one clipboard path; do not write a second one.
   If W5 has not landed yet, build against the current adapter and leave a
   clear seam so W5's strategy selection drops in.
2. Growth guard: if the clipboard text exactly equals the app's own last
   output, do nothing but toast "Already stacked. Copy something new first."
   Without this, pressing twice duplicates the whole pile.
3. Empty or whitespace-only clipboard: toast "Your clipboard is empty." and
   change nothing.
4. Otherwise append the chunk, save, write the whole rendered pile to the
   clipboard, record it as the last output, and toast the count:
   **"Stacked. 3 pieces."** (singular "1 piece").

## The pile indicator

A slim strip directly above the action bar, visible **only when the pile is
non-empty**, holding the count and a Clear control:

```
3 pieces stacked                                    Clear
```

- Clear empties the pile immediately with an Undo (project rule: no
  confirmation dialogs, destructive actions apply immediately with Undo).
- Tapping the count reveals a short preview of the chunks (first line of each,
  truncated) so the user can see what they have. Keep it inside the existing
  single-screen model; a small expanding region, not a dialog.
- It carries the active stack's accent at low emphasis. i/copy must read as
  secondary to w/copy: w/copy stays the one saturated, dominant control. Put
  i/copy beside it in the action bar, visually paired but clearly lighter
  (outline or tonal treatment), and make sure the pair still works one-handed
  at 390px and does not crowd the safe-area inset.

## The interaction between i/copy and w/copy

This detail makes the feature genuinely useful, so get it right.

After i/copy writes the pile to the clipboard, the clipboard equals the app's
own last output. Pressing w/copy would therefore hit the growth guard and
refuse — but wrapping the finished pile in a header and footer is exactly what
the user will want next.

Fix: record **what kind of action** produced the last output, alongside the
text (`wcopy.lastOutput` gains a kind: `'wrap' | 'stack'`). The guard then
reads: refuse to *wrap* what we already wrapped, and refuse to *stack* what we
already stacked, but allow wrapping a pile. Cover every combination in
`tests/`.

Pressing w/copy on a pile does not clear the pile. Clearing is explicit, via
the Clear control. (Flagged to the product owner; if they ask for auto-clear
after a wrap, that is a one-line change in the wrap handler.)

## Files you own

`js/pile.js`, `tests/pile.test.js`, `js/main.js` (action path and wiring),
`app/index.html` (action bar and pile strip), `css/app.css` (a commented "W6"
section), `sw.js` (append `/js/pile.js` to `PRECACHE_URLS`, bump `VERSION`),
`js/merge.js` and `tests/merge.test.js` only if the guard change belongs
there, and the spec (§3 for the new storage key, §6 for the action paths,
§7.5 for the new toasts).

## Acceptance

- `npm test` green, including pile tests: append, empty and whitespace-only
  rejected, separator honoured, trailing whitespace trimmed, render for zero,
  one, and many chunks, clear, and every guard combination from the section
  above.
- In Chromium: the full copy → i/copy → copy → i/copy → w/copy journey ends
  with a correctly wrapped, correctly ordered block on the clipboard.
- The pile survives a reload and is absent from both the JSON export and the
  share link. Prove the absence.
- The indicator appears and disappears at the right moments; Clear undoes.
- Both buttons work one-handed at 390px in light and dark, in both densities.
- No `securitypolicyviolation`, no console errors, no inline styles.

## Git

Branch `feat/icopy` off `main`. Commit in logical units. Push the branch. Do
not merge, and do not open the pull request yourself; the orchestrator does
that.

## Report

Commit SHAs; the final `wcopy.lastOutput` shape and guard truth table; the
exact new toast strings; how the two buttons share one clipboard path; and a
description of how the pair looks at 390px.
