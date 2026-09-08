# w/copy: Path to MVP

**Date:** 2026-09-08
**Status:** Planning document. No design is approved and no code exists.
**Supersedes:** the question queue in `docs/handoff/2026-09-07-w-copy-brainstorm-handoff.md`
(the handoff's standing rules and locked decisions remain in force).
**Requirements:** `docs/prd/w-copy-prd.md` (v1.1).

This document answers one question: what has to be thought about, decided,
de-risked, and built between an empty repository and a shipped MVP. It does not
make the open decisions. Those are the product owner's, taken one at a time.

---

## 0. Where things stand

| | |
|---|---|
| Repository | One stub README, the 2026-09-07 handoff, the PRD, this document. |
| Process | `superpowers:brainstorming`, architectural path, step 2 of 8 (clarifying questions). |
| Hard gate | No code, no scaffolding, no implementation skill until a presented design is explicitly approved. |
| Next skill | `writing-plans`, only after the spec is approved. |

### Decisions locked

| # | Decision | Source |
|---|---|---|
| D1 | Phone and desktop, both on day one. | handoff |
| D2 | Chrome only. | handoff |
| D3 | Web-hosted for MVP on both platforms. | handoff |
| D4 | PowerShell `irm \| iex` desktop companion is Phase 2, not MVP. | handoff |
| D5 | Work continues in a cloud agent. Process constraint only. | handoff |
| D6 | Vanilla HTML, CSS, JavaScript. No framework. | PRD §2, confirmed 2026-09-08 |
| D7 | Performance is the first-order requirement: extreme speed on load and on action. | PRD §2, confirmed 2026-09-08 |
| D8 | Every clipboard read is an explicit user-initiated action. No background, on-load, or on-focus reads. | PRD §1 v1.1 |

---

## 1. What "extremely fast" has to mean

D7 is only enforceable if it is measurable. This section proposes how to turn
it into budgets. The numbers are proposals for the design spec, not decisions.

### 1.1 Where the time actually goes

One iteration of the core loop, on either platform:

1. Copy in the agent app. *(OS, not ours.)*
2. Switch to w/copy. *(OS, not ours, except that a home-screen-installed page switches faster than a browser tab.)*
3. Page is ready to press. *(Ours: load, cache, render.)*
4. Press. Clipboard read. *(Ours: permission state decides whether this is 5 ms or a prompt.)*
5. Merge. *(Ours. Microseconds for any realistic size. Not where the time is.)*
6. Clipboard write, toast. *(Ours. Single async call, then paint.)*
7. Switch back, paste. *(OS, not ours.)*

The merge is a rounding error. The only places we control latency are **page
readiness on repeat visit**, **permission persistence**, and **doing nothing
extra on the action path**. Every performance decision below follows from that.

### 1.2 Proposed budgets

| Budget | Proposed target | How it is enforced |
|---|---|---|
| Transfer size, app page, all assets | under 25 KB compressed | CI size check on the build output |
| External requests at runtime | zero (no CDN, no web fonts, no analytics) | CI grep of built HTML for external origins |
| Repeat-visit time to interactive | under 100 ms on a mid-range phone | Lighthouse in CI, plus a service worker or long-lived cache headers |
| Press to toast, excluding the clipboard API itself | under 16 ms (one frame) | Instrumented in the E2E suite |
| Main-thread work on the action path | no layout read, no storage write, no DOM rebuild | Code review rule, documented in `CLAUDE.md` |
| Runtime dependencies | zero | `package.json` has devDependencies only |

### 1.3 Consequences for open questions

- **Storage.** The PRD allows `localStorage` or `IndexedDB`. A config is a few
  kilobytes at most. `localStorage` is synchronous and trivial; `IndexedDB` is
  asynchronous and needs a wrapper. Under D7 and the simplicity tiebreaker,
  `localStorage` is the recommendation, with a size guard and
  `navigator.storage.persist()` to reduce eviction risk.
- **PWA.** The fastest repeat load is one served from a service-worker cache,
  and a home-screen install gives a faster app switch on Android. This makes the
  PWA question (Q10) a performance question, not a feature question.
- **Build step.** Vanilla JS runs unbundled as ES modules. A build step is still
  worth having for minification and for the size check, but it must be trivial
  (one command, one config file) or it works against D6.
- **Rendering.** With no framework, the choice is between rebuilding the stack
  DOM from state on every change, or targeted updates. For a list of under
  twenty cards either is fast; the design should pick the simpler one and
  measure.

---

## 2. Decisions still needed, in the order they block

Grouped by what they unblock. Each entry states what the PRD currently says,
what is open, and a recommendation where one is defensible. Recommendations are
offered for the product owner to accept, reject, or amend, one at a time.

### Group A: the output must be correct (blocks the merge design)

**A1. Join semantics.** *(was Q3, handoff defect 5)*
PRD: silent. Open: how adjacent pieces are concatenated (newline, blank line,
nothing, per-piece configurable) and whether leading and trailing whitespace is
trimmed. Recommendation: a single global separator defaulting to a blank line,
per-piece override deferred; trim trailing whitespace only. Without this the
first output is wrong.

**A2. Empty or non-text clipboard.** *(was Q7, second half)*
PRD: silent. Open: on empty clipboard, do nothing with an error toast, or
produce the wrapper with an empty middle? On image or rich content, read the
plain-text representation or refuse? Recommendation: refuse with a specific
toast; never write a wrapper around nothing.

**A3. Variant multiplicity.** *(was Q2, handoff defect 2)*
PRD v1.1: `activeVariant` is a single string and the UI "toggles" variants,
which implies exactly one of N. The handoff's multi-select wording is not in
this PRD. Open only if the longer draft is authoritative. Recommendation:
confirm one-of-N and close it.

### Group B: the data model (blocks the schema and storage design)

**B1. One stack or many.** *(was Q4, handoff defect 1)*
PRD v1.1: one `activeStack`. The handoff's `setups` array is absent.
Recommendation: one stack in MVP, and shape the schema so a later `stacks` map
is an additive migration, not a rewrite.

**B2. The clipboard slot.** *(was Q7, first half)*
PRD: one `CLIPBOARD_PLACEHOLDER` entry and one central icon. Open: is exactly
one slot a rule, enforced on import? Recommendation: exactly one, validated.

**B3. Config editing surface.** *(was Q5)*
PRD: import and export JSON; the UI section covers reordering and variant
toggling but says nothing about creating or editing a piece or a variant.
Open: are pieces authored in-app, in the JSON file only, or both? This is the
largest single determinant of UI surface area and of MVP scope. No
recommendation until the product owner says how they expect to author pieces
day to day.

**B4. Schema version, validation, migration.** *(was Q13)*
PRD: a `version` field exists; nothing says what happens on an invalid or
older file. Open: hand-rolled validator or a schema library (a runtime
dependency, which conflicts with the zero-dependency budget); on invalid input,
refuse to load or partially recover. Recommendation: hand-rolled validator with
exhaustive unit tests; refuse invalid files with a precise error; migrate older
valid versions forward.

### Group C: interaction (blocks the UI design)

**C1. Variant gesture.** *(handoff 8.1)*
PRD: "swipe/tap to toggle". Open: swipe is ambiguous next to long-press-drag
reordering on a touch screen, and it has no desktop equivalent. Recommendation:
tap cycles, with a visible indicator of which variant is active and how many
exist; swipe is a later enhancement. Probably needs a throwaway prototype rather
than a guess, which would need explicit approval under the hard gate.

**C2. Reordering.** *(was Q12)*
PRD: long-press then drag. Settled as the target. Note that pointer-event drag
with no library is the single most expensive UI piece in the app. Open: are
up/down buttons an acceptable MVP fallback if drag slips, or is drag itself the
bar?

**C3. Preview.** *(was Q6)*
PRD: toast only, no preview. Recommendation: accept for MVP; a preview is a
second screen of UI and a second thing to keep fast.

**C4. Hidden app switches.** *(handoff defect 4)*
Browser-only means two context switches per iteration. Recommendation: accept
as the MVP shape, note explicitly that D4's desktop companion and an Android
share-target integration are the fixes, and that share-target depends on the
PWA decision (P1 below).

### Group D: platform (blocks foundation work)

**P1. PWA.** *(was Q10)*
PRD: silent. Open: manifest and service worker in MVP, or a plain page?
Recommendation: yes, for the performance reasons in §1.3, and because it is
the prerequisite for a share target later.

**P2. Hosting and domain.** *(was Q9)*
PRD: GitHub Pages or Cloudflare Pages. Open: which, and is `withcopy.app`
registered with DNS under the product owner's control? One material difference:
Cloudflare Pages supports custom response headers (Content-Security-Policy,
HSTS); GitHub Pages does not, leaving only a meta-tag CSP. Recommendation:
Cloudflare Pages.

**P3. Testing.** *(was Q11)*
PRD: silent, yet the product owner's non-negotiable is a full green suite
before every commit. Recommendation: Vitest for the pure logic (merge,
validation, migration), Playwright against real Chrome for the clipboard path
with permissions granted in the harness, never mocked. E2E must run on a
mobile-emulated viewport as well as desktop.

**P4. Build tooling.** *(new)*
PRD: silent. Open: no build at all (serve source), or a minimal minify step.
See §1.3. Recommendation: minimal step, one command, size check included.

### Also open

- Which PRD is authoritative: this v1.1 or the longer "v2 draft" the handoff
  reviewed. Asked 2026-09-08, unanswered. If v2 is authoritative, A3 and B1
  reopen.
- Formatting toggles (handoff 8.2): out of scope, only matters for keeping the
  schema forward-compatible.

---

## 3. Risks to retire before building

Each of these is cheaper to settle now than to discover during build.

1. **Android Chrome clipboard read.** `readText()` on Android may show a paste
   confirmation rather than a persistent permission. The fallback (a manual
   paste target) must be designed, and the real behaviour verified on a device
   before the clipboard adapter is written. A one-file throwaway spike would
   settle it; that needs explicit approval under the hard gate.
2. **Document focus.** Chrome rejects `readText()` when the document is not
   focused. A button press guarantees focus, but any keyboard shortcut or
   auto-action would not. This is a second reason for D8.
3. **Drag-and-drop in vanilla JS on touch.** Pointer events, long-press
   detection, scroll suppression during drag, and reorder animation are all
   hand-written. Scope this honestly; see C2.
4. **Data loss.** `localStorage` can be evicted when the browser is under
   storage pressure or the user clears site data. Export is the backup.
   `navigator.storage.persist()` helps. The design must make the loss mode
   obvious and the recovery (import) fast.
5. **Content Security Policy.** A clipboard app is a plausible target for
   injected script. No `eval`, no inline handlers, a strict CSP. Whether CSP can
   be a real header depends on P2 (hosting).
6. **Permission persistence on desktop.** The core assumption behind D2 is that
   Chrome desktop grants clipboard-read persistently per origin. This is
   documented behaviour but should be confirmed in the E2E harness rather than
   trusted.

---

## 4. The steps from here to MVP

Ordered. Each phase has an output that can be reviewed asynchronously.

### Phase 0: decide *(now)*

Work Group A through Group D above, one question at a time. Output: a
decisions table appended to this document or to the spec, every row sourced.

### Phase 1: design *(brainstorm steps 3 to 7)*

1. Propose two or three approaches with trade-offs and a recommendation. The
   real forks are: state-and-render model in vanilla JS; single page versus
   landing plus app; PWA or not; build step or not.
2. Present the design in sections, approval after each:
   - data model, schema, validation, migration
   - merge algorithm, join semantics, edge cases
   - clipboard adapter, permission flow, every fallback
   - UI structure, gestures, one-handed layout, desktop scaling
   - persistence, import, export, loss recovery
   - performance budgets and how each is enforced
   - test strategy and CI
   - hosting, headers, domain, deploy
3. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-w-copy-design.md`.
4. Self-review for placeholders, contradictions, scope creep, ambiguity.
5. Product owner reviews the spec file.

Output: an approved spec. The hard gate lifts here and only here.

### Phase 2: plan

Invoke `writing-plans`. Output: an implementation plan with tasks small enough
to each end in a green suite.

### Phase 3: foundation *(foundation before polish)*

- Repository layout, `CLAUDE.md` (committed with the work it describes),
  editor config, license.
- Build step per P4, with the size and external-origin checks from §1.2.
- Test harness per P3: unit runner, Playwright with clipboard permissions
  granted, desktop and mobile-emulated projects.
- CI: suite plus budgets on every push; preview deploy per branch.
- Hosting wired to the domain with HTTPS and headers per P2.

Output: an empty app that deploys, with a green suite and enforced budgets.

### Phase 4: the core loop *(first usable build)*

- Merge function: pure, exhaustively unit tested against A1 and A2.
- Storage layer with validation and migration per B4.
- Clipboard adapter with every fallback from §3 items 1 and 2.
- Minimal UI: the stack rendered from a default config, the placeholder, the
  action button, the toast.

Output: something the product owner can dogfood in the real agent-handoff
loop, on phone and desktop. Everything after this is informed by that use.

### Phase 5: configuration

- Variant toggle per C1, reordering per C2.
- Piece and variant authoring per B3.
- Import and export, with the loss-recovery path from §3 item 4.

### Phase 6: mobile hardening

- Android Chrome clipboard fallback verified on a physical device.
- PWA manifest and service worker per P1, with cache invalidation on deploy.
- One-handed layout audit; touch-target sizes; safe-area insets.

### Phase 7: landing and launch

- Landing page per PRD §4, same budgets.
- Launch checklist: Lighthouse at 100 across the board on both pages, CSP
  live, zero external requests confirmed, keyboard-only pass on desktop,
  screen-reader pass on the action path.

### Phase 8: parking lot *(explicitly not MVP)*

- D4 desktop companion via `irm | iex`.
- Android share target (removes one app switch per iteration).
- Multiple stacks or presets.
- Formatting toggles.
- Per-piece join overrides, if A1 settles on a global separator.

---

## 5. Definition of MVP done

All of the following, none optional:

- The core loop works on Chrome desktop and Chrome Android, on the real domain
  over HTTPS, with no repeat permission prompt on desktop and a designed
  fallback on Android.
- Every budget in §1.2 (as finally agreed) is enforced in CI and green.
- Full suite green on every commit; the clipboard path is tested against real
  Chrome, not a mock.
- Import and export round-trip losslessly, and an invalid file is refused with
  a precise error.
- Landing page and app page both ship; zero external requests; strict CSP.
- Every decision in §2 has a recorded answer, and the spec matches what was
  built.
