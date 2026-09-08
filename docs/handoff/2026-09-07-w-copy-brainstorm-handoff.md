# w/copy — Brainstorm Handoff

**Date:** 2026-09-07
**From:** local Claude Code session (Opus 5)
**To:** cloud agent continuing this work
**Repo:** https://github.com/talonbaker/with-copy
**Status:** Design brainstorm IN PROGRESS. One question answered, one asked and
unanswered, ~12 queued. **No code exists and none should be written yet.**

---

## 1. What this project is

**w/copy (WithCopy)** — domain `withcopy.app`. A local-first browser tool that
wraps clipboard content in reusable boilerplate. The user runs multiple AI agent
sessions; each time an agent's context fills, its handoff text needs to be
sandwiched between a standing header and footer before being pasted into a fresh
session. Today that is a manual scratch-doc paste/copy/delete cycle, repeated per
agent, and it is materially worse on a phone.

The MVP core loop is one action: read the system clipboard, merge it with the
user's arranged text pieces, write the result back to the clipboard.

The authoritative requirements document is the **PRD v2 draft**, which the user
holds. It is NOT yet committed to this repo. **Ask the user to paste the PRD v2
draft before doing design work** — this handoff summarizes decisions and defects
against it but is not a substitute for it.

---

## 2. Standing rules for you, the receiving agent

These come from the user's global `CLAUDE.md` and override default behavior.
Violating them is the fastest way to lose their trust.

- **Questions: one at a time, in plain conversational text, then wait.** NEVER
  use `AskUserQuestion` or any multi-choice popup, option list, bubble, or form.
  NEVER batch numbered questions ("1 of 4"). Define any jargon your question uses.
- Solo developer. Everything is a resume piece — craft over slop. Push back when
  he is wrong and teach him why.
- **Tenets, in priority order:** performance, then reliability/safety, then
  modern industry standards, with simplicity as tiebreaker.
- Review is async and unscheduled. Park finished work cleanly (report written,
  branch pushed). Never block waiting on him. Keep going while green; ask only
  for destructive operations, real scope changes, or genuine design forks.
- **Non-negotiables:** full test suite before commit; foundation before polish;
  never mock external systems in integration tests; diff content before merging;
  commit `CLAUDE.md` with the work that updates it.

### Process rules currently in force

This session invoked the `superpowers:brainstorming` skill and classified the
work as the **architectural path** (the repo is empty — one commit, a stub
README — so nothing here qualifies as "bounded"). That path is:

1. Explore project context — done
2. Ask clarifying questions, one at a time — **you are here**
3. Propose 2-3 approaches with trade-offs and a recommendation
4. Present the design in sections, approval after each section
5. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, commit it
6. Self-review the spec (placeholders, contradictions, scope, ambiguity)
7. User reviews the spec file
8. Only then invoke the `writing-plans` skill

**HARD GATE: write no code, scaffold no project, invoke no implementation skill
until the user has explicitly approved a presented design.** After the spec is
approved, the only skill to invoke next is `writing-plans` — not a frontend or
scaffolding skill.

---

## 3. Decisions locked so far

| # | Decision |
|---|---|
| D1 | Target platforms are **phone and desktop, both on day one**. Neither is a follow-on. |
| D2 | **Chrome only.** No Firefox or Safari support is required for MVP. |
| D3 | **Web-hosted for MVP on both platforms.** That is the minimum bar. |
| D4 | A desktop-native companion installed via a PowerShell `irm` piped to `iex` one-liner is an idea the user likes and wants eventually. It is **Phase 2 parking lot, explicitly not MVP.** |
| D5 | The user wants this work to continue **in a cloud agent** so his local machine does not need to stay on. New as of 2026-09-07; a constraint on process, not on the product. |

### Technical consequences already established from D2

- Chrome desktop supports `navigator.clipboard.readText()` and can grant the
  clipboard-read permission **persistently per origin**, so the repeated tight
  loop in the primary scenario will not re-prompt on every press. This was the
  single biggest technical risk in the PRD, and Chrome-only largely retires it.
- Chrome on Android may still surface a paste confirmation on some versions.
  **Design an explicit fallback path** (for example a manual paste target or
  textarea) — do not assume silent reads on mobile.
- This is why the browser question was asked first: Firefox does not expose
  `readText()` to web pages at all, and iOS Safari prompts on every call. Both
  are now out of scope, so neither shapes the design.

---

## 4. Review findings against the PRD — five defects, all still open

These were raised to the user and are not yet resolved. They must be settled
before a spec can be written. Do not resolve them by fiat in code.

1. **Section 5 contradicts Section 7.** Presets are explicitly out of scope for
   MVP, but the data-model sketch carries a `setups` array. Either MVP has
   exactly one implicit setup, or the array exists in the schema but is never
   surfaced in the UI. Needs an explicit call.
2. **Section 6.2 contradicts Section 7.** "…or select more than one to be used in
   sequence" implies several variants of one piece can be active simultaneously,
   which `"activeVariant": "v1"` (a single string) cannot represent. This changes
   both the schema and the selection gesture, so it cannot be deferred to
   Section 8.
3. **Section 6.4 is the principal technical risk** — now largely mitigated by D2,
   but the mobile fallback described above still has to be designed, not
   discovered during build.
4. **The loop contains hidden app-switches.** Browser-only with no global hotkey
   (Section 9) means each iteration is: copy in the agent app, switch to w/copy,
   tap, switch back, paste. That is two context switches per agent, which is a
   large share of the friction the product exists to remove. Confirm this is the
   accepted MVP shape, and note it is exactly what D4's desktop companion and the
   parked share-target integration would fix.
5. **Functional gap: piece joining is unspecified.** Nothing in the PRD says how
   adjacent pieces are concatenated — newline, blank line, nothing, or per-piece
   configurable. The output is simply wrong without this, and it is not listed
   among Section 8's open questions.

---

## 5. Question queue

### Asked, awaiting the user's answer

**Q2 — variant multiplicity (resolves defect 2).** When a piece has several
variants, at the moment of pressing w/copy does the user ever want *two or more
variants of that same piece* in the output at once (for example header-v1 and
header-v3 stacked), or is it always exactly one variant chosen from the set? If
it is always one-of-N, both the schema and the swipe gesture get materially
simpler and the general case should not be built.

### Queued, not yet asked — ask one at a time, in this order

- **Q3 — Join semantics (resolves defect 5).** How are adjacent pieces joined:
  single newline, blank line, nothing, or per-piece configurable? Is leading and
  trailing whitespace trimmed from each piece before joining?
- **Q4 — Setups (resolves defect 1).** Exactly one implicit setup in MVP, or keep
  the `setups` array in the schema while showing only one in the UI?
- **Q5 — Config editing surface.** Are pieces edited through structured UI forms,
  through a raw JSON editor inside the app, or both? PRD Section 7 and Section
  8.4 (linting, "refuse to load or partially recover") hint that the user intends
  to hand-edit JSON. This is the single largest determinant of UI surface area.
- **Q6 — Preview.** Does the app show the merged result before or after writing it
  to the clipboard, or is the action silent with only a toast?
- **Q7 — The clipboard slot.** Exactly one per arrangement, or may it appear more
  than once? What should happen when the clipboard is empty, unreadable, or
  contains non-text?
- **Q8 — Stack.** Any constraint, or is the recommendation free? Default
  recommendation would be React + TypeScript + Vite, static build.
- **Q9 — Hosting.** Is `withcopy.app` registered, and is DNS under his control?
  Preferred static host — Cloudflare Pages, Vercel, Netlify, GitHub Pages?
- **Q10 — PWA.** Is installability or offline capability required for MVP, or is a
  plain web page enough? Relevant to the mobile half of D1.
- **Q11 — Testing.** Expectation is Vitest for units plus Playwright for E2E.
  Confirm — and note that E2E clipboard tests in Chrome need explicit permission
  grants in the test harness. His non-negotiable is a full suite green before any
  commit.
- **Q12 — Reordering UI.** Does arrangement reordering need drag-and-drop on
  mobile, or are up/down buttons acceptable for MVP?
- **Q13 — Schema validation (PRD Section 8.4).** JSON Schema, Zod, or a
  hand-rolled linter — and on an invalid config, refuse to load or attempt
  partial recovery?

Also still open from PRD Section 8 and not yet turned into questions: the exact
variant-selection **gesture** (8.1 — likely needs a throwaway UX prototype rather
than a guess) and **formatting-toggle scope** (8.2, which is out of scope for MVP
and only matters for keeping the schema forward-compatible).

---

## 6. What NOT to do

- Do not write code, scaffold, or install dependencies.
- Do not resolve any open question by picking a default and moving on. Ask.
- Do not use `AskUserQuestion` or present option bubbles. Plain text, one
  question, then wait.
- Do not treat this handoff as the requirements. Get the PRD v2 draft from him.

## 7. Your next action

Ask the user Q2 above, in plain text, as a single question. Then continue down
the queue one at a time, reordering as his answers make later questions moot or
urgent.
