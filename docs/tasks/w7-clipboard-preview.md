# W7: Show the clipboard contents, on request

## Why

From the product owner (2026-09-10): the clipboard card shows a clipboard icon
and the caption "Your clipboard goes here", but never the actual contents.
They want the *option* to see what is on the clipboard, so they can tell what
w/copy is about to wrap before they press it.

## The constraint that shapes this whole feature

Decision **D8** is locked: *every clipboard read is an explicit user-initiated
action; no background, on-load, or on-focus reads.* A live preview that keeps
itself current is therefore impossible, and would be wrong even if it were
possible. On iPhone it is doubly impossible: WebKit will not surrender
clipboard text without a paste gesture.

So the preview is **gesture-driven and honestly stale**. The user asks to see
the clipboard; the app reads it at that moment and shows what it got. It never
silently re-reads, and it never claims to be current when it cannot know.

This is not a limitation to design around quietly. Say it in the interface: the
preview shows what was on the clipboard *when it was last checked*.

## Privacy: off by default, never written to disk

Clipboard contents are frequently sensitive: passwords, tokens, private
messages. Two hard rules:

1. The preview is **off by default**. It is opt-in, which is exactly what the
   product owner asked for ("at least be the option").
2. The preview text lives **in memory only**. Never write clipboard content to
   `localStorage`, never include it in the JSON export, never put it in a
   share link. Only the on/off preference is persisted.

Rule 2 has no exceptions. A crash or reload losing the preview is correct
behaviour.

## Design

**The toggle lives on the clipboard card.** An eye control in the card's bar,
beside the existing enable switch, so it is discoverable exactly where the
question arises. It writes a single global preference,
`settings.showClipboard` (boolean, default `false`), so the choice follows the
user across stacks rather than being re-made in each one. Add it to the schema
in spec §3 and to `validateState`, and mirror it as a row in the Settings
dialog under Appearance so it is findable there too.

**States of the card when the preview is on:**

| State | What the card shows |
|---|---|
| Nothing read yet this session | The clipboard icon and a single control: **"Show clipboard"** |
| Text obtained | The preview (see below), a character count, and a **Refresh** control |
| Read refused, or the platform needs a paste | The same **"Show clipboard"** control, relabelled to say a paste is needed, per the W5 strategy. Never an error toast. |
| Clipboard empty | "Your clipboard is empty." in the card, muted, with Refresh |

**The preview itself:**

- First 6 lines or 400 characters, whichever comes first, then a fade and an
  **expand** control. Handoff documents are enormous; never render the whole
  thing into the card by default.
- Expanded, the preview is a scrollable region with a sensible maximum height,
  not an infinite card that buries the action button.
- Below it, a quiet line: the character count and when it was checked
  (e.g. "4,812 characters · checked just now", ageing to "2 minutes ago").
  The staleness wording is the honesty requirement above; do not skip it.
- Whitespace must be visible enough to be useful: preserve line breaks, and
  show leading and trailing whitespace faithfully rather than collapsing it.
- Text is inserted with `textContent`. Never `innerHTML`.

**Where the text comes from.** Use the same shared seam both buttons already
use, `getClipboardText()` in `js/main.js` (W6 introduced it; W5 gives it the
per-platform strategy). Do not add a second way to obtain clipboard text.
Whenever w/copy or i/copy successfully obtains clipboard text, feed it to the
preview for free, so pressing a button also refreshes what is on screen.

**When the preview is off**, the card looks exactly as it does today. No
residual controls, no layout shift.

## Files you own

`js/main.js` (preview state and wiring), `js/ui/piece-card.js` (the clipboard
card's rendering and its eye control), `js/schema.js` and
`tests/schema.test.js` (the new setting plus validation and migration),
`js/ui/settings.js` (the Appearance row), `app/index.html` (card markup and
the settings row), `css/app.css` (a commented "W7" section), `sw.js` (bump
`VERSION`), and the spec (§3, §7.1, §7.2, §7.4).

Add a small pure helper with tests for the parts worth testing without a DOM:
truncation to lines-or-characters, the character count formatting, and the
relative-time wording.

## Acceptance

- `npm test` green, including the new schema rules and the pure helpers.
- Default state: preview off, card identical to today.
- Turning it on and tapping "Show clipboard" in Chromium shows the real
  clipboard text, count, and freshness line; Refresh updates it.
- With clipboard-read denied, the card offers the paste route and **no error
  toast fires**.
- Pressing w/copy or i/copy updates the preview without a second read.
- Grep the codebase to prove clipboard text never reaches `localStorage`, the
  export, or the share link. State in your report how you proved it.
- Long text: the card stays a reasonable height, the action buttons stay
  reachable one-handed at 390px, and expanding scrolls within the card.
- Multi-line text with leading and trailing whitespace renders faithfully.
- No `securitypolicyviolation`, no console errors, no inline styles.

## Git

Branch `feat/clipboard-preview` off `main` **after the W5 clipboard
streamlining work has merged**; this feature depends on that strategy and
edits the same files. Commit in logical units, push the branch, do not merge
and do not open the pull request; the orchestrator does that.

## Report

Commit SHAs; the exact staleness wording you chose; how you proved clipboard
text never reaches storage; how the card behaves with a 50,000 character
clipboard; and screenshots described in words at 390px in both themes.
