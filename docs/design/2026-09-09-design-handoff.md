# w/copy — Development Handoff Document

> Supplied verbatim by the product owner on 2026-09-09, gathered through a
> structured design conversation with a separate agent. Authoritative for
> product decisions, UX, and visual design. The technical spec at
> `docs/spec/2026-09-09-w-copy-technical-spec.md` is authoritative for
> low-level architecture. Where they overlap, this document wins. Two
> additions given alongside it: hosting is GitHub Pages for now, and the
> testing question is deferred.

**Domain:** withcopy.app (already registered, DNS on Cloudflare)
**Status:** Design complete for MVP. No code written yet. Ready for architecture proposal / build to begin.
**Related:** A separate, more technical architecture document exists in the repo at `github.com/talonbaker/with-copy` (branch `claude/brainstorm-handoff-review-9idxuf`, under `docs/`). That document is the authoritative source for low-level technical architecture; this document is the authoritative source for product decisions, UX, and visual design, gathered through a structured design conversation. Where the two overlap, decisions below are the current/final word — the architecture doc was written earlier in the process and this document supersedes anything it says about JSON-as-primary-interaction, stack/piece independence, and other items detailed below.

---

## 1. Problem Statement

The user frequently copies context or prompts into new AI agent sessions — for example, when clearing an agent's context window or handing off to a fresh session. This involves taking an agent's handoff document, pasting it into a notepad-style doc, and wrapping it with:
- A **header** telling the next agent what they're about to read.
- A **footer** telling the agent what to do next (e.g. ask questions, start working, wait for a command).

Doing this repeatedly — especially for multiple agents at once, or needing to tweak one header/footer and recopy everywhere — is tedious and error-prone (hard to see where one pasted document begins/ends when working with a lot of text).

**Goal:** one button that takes whatever's currently on the clipboard, wraps it with predefined header/footer (and other) content, and puts the result back on the clipboard — ready to paste immediately. "Just w/copy and paste."

A secondary but real use case: short, repetitive pastes into apps like Instagram (e.g. captions/comments where only a small middle portion changes each time) — same mechanic, different, much lower-frequency context.

---

## 2. Core Concept & Data Model

### Stacks
- A **stack** is a named, ordered collection of **pieces** (e.g. a "Claude" stack, an "Instagram" stack).
- Each stack is fully self-contained. **Pieces are NOT shared or referenced across stacks** — each stack owns independent copies of its own pieces. Editing a piece while viewing one stack never affects another stack, even if their content originated from a copy or looks similar.
- The app opens to the **last-used stack** by default (like a browser reopening to the last tab). Switching stacks is a **deliberate manual action** — never automatic/context-detected.
- Switching stacks updates the stack's accent color across the UI (see §4).
- A **new stack** starts pre-filled with the standard header/clipboard/footer shape as a default template (not blank). No custom-starting-template feature is needed for v1 — a power user who wants a different default can achieve it via JSON import (see §6).
- Stack navigation is a simple flat list (not reorderable/prioritized) accessed via a hamburger-style menu — described as a "saved" or "favorites" list.

### Pieces
- A **piece** is a block of text (header, footer, or any other custom text block) within a stack.
- Exactly **one clipboard slot** exists per stack, marking where clipboard content is injected. The clipboard slot is **toggleable off** like any other piece — a stack can validly be header + footer only, with no clipboard content forced in.
- A piece can have **multiple variants** (e.g. several alternate headers), but exactly **one variant is active at a time**. Selecting a variant is done by **tapping the piece to reveal the full list of variants** (not cycling/swiping blind). This is sufficient for MVP since variants aren't switched often — usage is mostly "one active setup with occasional tweaks."
- Pieces within a stack are **reorderable via drag and drop**, using a dedicated drag handle (e.g. on the far right edge of each piece row) — not locked once added, and not requiring delete-and-re-add to resequence.

### Editing & Deletion
- Editing happens **inline**, directly on the piece (pieces are just text — no separate "edit mode" screen).
- **No confirmation dialogs before deleting.** Deletion happens immediately, with an **undo** option available right after — explicitly modeled on Gmail's delete/undo pattern. (General preference: avoid confirmation prompts for actions the user has just explicitly requested.)
- For long pieces that are awkward to edit in a small inline box (especially on phone), each piece has a **"fill screen" expand option** — modeled explicitly on Gmail's compose window (starts docked/small, expands to full screen, collapses back).

### The Growth Edge Case (important — must be handled)
Repeatedly pressing the w/copy button without copying anything new in between would otherwise cause **unbounded growth**: each press re-wraps whatever's currently on the clipboard (including the app's own prior output) in the header/footer again, so content grows by roughly one header+footer length per press.

**Required fix:** the app must track its own last-produced output internally, and **skip re-wrapping if the current clipboard content exactly matches that last output** (i.e., nothing new was copied since the last w/copy press).

**Explicitly rejected approach:** do NOT use content-pattern detection (i.e., guessing "this looks like a header/footer already"). A user might legitimately want to wrap a header/footer around content that happens to resemble one, and pattern-guessing would incorrectly block that. The check must be based on exact-match against the app's own last output, not heuristics about content shape.

---

## 3. Onboarding & First-Run Experience

The app should **not** start blank. It ships with an example header and footer pre-filled, written so the example itself explains the mechanic — the demo content doubles as instructions. Direction (not final copy, but the intent):

- Header: something like *"Hello, welcome to w/copy. Below me is your current clipboard [content]."*
- Footer: something like *"Above me is your clipboard content."*

The first time a new user taps the button, the merged result visibly demonstrates the header/footer/clipboard "sandwich" using their own real clipboard content — the product explains itself through its own output.

---

## 4. Visual Design & UI

### Overall structure
- **Single screen only.** No separate "edit mode" vs. "use mode" — editing happens inline within the same view used day-to-day. (Two screens was considered and explicitly rejected as unnecessary — "even two screens seems like too much.")
- **Layout:** both desktop and mobile share the same layout approach — a long vertical/portrait-style stack of piece-cards ("stacked squares"), rather than separate layouts per platform.
- **Structural inspiration:** modeled loosely on Gmail's app patterns —
  - A side panel slides out from the left (hamburger menu → list of saved stacks).
  - A settings gear icon lives in the top right, opening a dedicated settings screen (not a flat list bolted onto the main page).
  - Tapping a labeled piece (e.g. a header block) expands to reveal its variants.

### Visual tone
- **Modern, minimal, clean.** Explicitly not a "utility" look, and explicitly not dated/boxy ("nineties Windows app" was given as the anti-example).
- Gmail was cited as doing density, font sizing, and light/dark mode well — comfortable with that general mechanical approach, but wants w/copy's personality to feel **more modern** than Gmail's own visual style.

### Color system (deliberate and restrained — not decorative)
- Interface is **mostly neutral/minimal** by default.
- The **w/copy button itself** is the one genuinely colorful, prominent element on the page — the primary visual focal point.
- **Toggles/checkboxes and piece-type labels** carry small color accents (e.g. so a "header" piece is visually distinguishable from a "footer" piece at a glance).
- **Each stack has its own accent color**, applied across the UI when that stack is active (e.g. green or orange for "Claude," blue for "Instagram"). This serves two purposes: an instant visual cue for which stack is currently open, and a bit of warmth so the app doesn't feel dreary/sterile.

### Dark mode
- **Both light and dark themes are priorities for v1** — not dark-mode-only. Follows OS/system theme setting automatically by default.
- Reasoning: although a "modern app" might default to dark mode, this is a **text-heavy** application (reading and editing blocks of text), where light mode is genuinely useful, not just a fallback.
- Manual override available in Settings (in addition to following system setting).

### Density
- Both a **compact** view (see more pieces at once) and a **spaced-out/readable** view are needed — adjustable via a setting, not a single fixed default.

### Feedback (toasts)
- Pressing the w/copy button **must** show a toast confirming the action — silent success is explicitly rejected ("that's really stupid" — direct user feedback). Direction: slides in from the top on phone, possibly from the bottom on desktop (exact side per platform not finalized). Wording direction: something like "copied" / "with copy" — friendly, brief.
- **Errors must also never fail silently.** Clipboard read/write failures (permission issues, WebKit quirks — see §5) must show a toast with guidance, e.g. "something went wrong, please enable clipboard settings" or similar — same toast UI pattern as the success case, different message/tone.

### Settings
- Dedicated settings screen (not inline on the main page), reached via the gear icon.
- Contains: theme (light/dark/system), density (compact/spaced), JSON export/import (see §6).
- No strong opinion on further grouping yet — expected to evolve as more settings are added; **default to industry-standard patterns** when a UI decision isn't strongly held (this is a standing preference for this project, not just for settings).

---

## 5. Technical Requirements & Platform

- **Browser target: Chrome only** (Chrome on desktop and iPhone).
- **Stack: vanilla HTML/CSS/JS, zero runtime dependencies, no backend.**
- **No build step.** Genuinely zero tooling — consistent with the zero-dependency approach. Note: the URL-fragment link-compression feature for cross-device transfer (§7) is **runtime app logic**, not a build-time process, so it does not require introducing a build step.
- **Installable as a PWA**, with offline support, on both phone and desktop from day one.
- **Performance:** no hard numeric budgets (earlier draft figures like sub-25KB page weight / sub-100ms load were explicitly dropped as unnecessary to lock in). The bar is qualitative: stay lean, feel instantaneous.
- **Real device usage:** iPhone (heavily used, not a secondary device) + desktop, no Android. A given session is typically all-iPhone or all-desktop.
- **Important platform note:** outside the EU, all iOS browsers — including "Chrome" on iPhone — are required by Apple to run on the WebKit engine, so iOS "Chrome" behaves like Safari for clipboard purposes, not like desktop Chrome:
  - Clipboard **writes** triggered directly by a user gesture (e.g. a button tap) should work reliably.
  - Clipboard **reads**, especially background/async ones, are more restricted on WebKit than on desktop Chrome. Build and test with this constraint in mind.
- A native app (using `UIPasteboard`, which needs no permission prompt since iOS 13 and only a one-time "allow paste" dialog since iOS 16) was discussed as a more reliable alternative but is **explicitly deferred** — **build the web version first.**

---

## 6. JSON: Storage Format & Power-User Escape Hatch

- **In-app UI is the primary and only way most users create/edit pieces and stacks.** Hand-editing raw JSON is not the intended primary interaction for typical users.
- JSON still exists **under the hood** as the storage/serialization format (including as the basis for the compressed cross-device link — see §7).
- Settings includes a **JSON export/import** option as a power-user escape hatch — lets a user who wants to hand-edit their save file do so, and also serves as the way a power user could define a custom default template for new stacks (since no in-app custom-template feature is planned for v1).
- The JSON format should be **lintable**.

---

## 7. Cross-Device Transfer (in scope for MVP, lightweight)

- Approach: compress a stack's data into a **link carried in the URL fragment**, which never touches a server (no backend, no accounts). On desktop this can optionally be shown as a **QR code** for the phone to scan.
- This is distinct from the longer-term "full sync" dream described in §8 — this is a manual, one-time, link/QR-based transfer mechanism, feasible within the no-backend MVP constraints.

---

## 8. Explicitly Out of Scope for MVP (Phase 2 / future ideas — do not build now)

These were discussed and are worth preserving for context, but should **not** be built as part of the initial MVP:

- **Full cross-device sync** (copy on one device, appears automatically on others) — the long-term dream, likely via a small future paid tier, but considered "nice to have for phase 2," not needed now. User believes it might be easier to build than expected, and thinks it could plausibly be offered for free given how small the data (headers/footers, at most a few thousand words, "at the very very most" a few hundred thousand) actually is.
- **Native iOS app** — deferred in favor of the web version; may be revisited later if WebKit clipboard limitations prove too restrictive in practice.
- **Paste-formatting toggles** — an idea for checkboxes/toggles controlling whether output includes wrapping quotes, other defining characters, newlines, or blank-line spacing. Motivating example: manually wrapping text in quotation marks on a phone keyboard is fiddly, especially with large text blocks. Not committed to MVP scope.
- **Custom starting templates for new stacks** — not needed as a dedicated feature; achievable already via JSON import.

---

## 9. Open Items (do not block starting development)

1. **Hosting provider:** undecided between **GitHub Pages** and **Cloudflare Pages**. Since the domain's DNS is already on Cloudflare, Cloudflare Pages would consolidate DNS and hosting in one place — leaning consideration, not a final decision. Either is viable; site is expected to be very small (well under any realistic size limit for a zero-dependency vanilla JS app).
2. **Testing strategy:** whether to use Vitest and/or Playwright (as mentioned in the earlier architecture doc) is still undecided — deferred to be settled during/alongside development rather than blocking the start of it.
3. **Toast direction per platform:** top vs. bottom placement for desktop is not finalized (mobile is confirmed top).

---

## 10. Summary for Whoever Picks This Up

This is a small, deliberately simple tool: no backend, no accounts, no build step, one browser target. The hard part isn't the tech — it's the interaction design, and that's now fully specified above: independent per-stack pieces, drag-to-reorder, tap-to-reveal variants, Gmail-style undo-not-confirm deletion, a self-documenting first-run example, sparse-but-purposeful color (button + per-stack accent + type labels), light/dark parity, and toasts for every outcome, success or failure, never silence. The two genuinely open questions (hosting, testing) are small enough to resolve in parallel with building rather than before it.
