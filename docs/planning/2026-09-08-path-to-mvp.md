# w/copy: Path to MVP

**Date:** 2026-09-08 (revised the same day after the product owner's answers)
**Status:** Planning document. No design is approved and no code exists.
**Supersedes:** the question queue in `docs/handoff/2026-09-07-w-copy-brainstorm-handoff.md`
(the handoff's standing rules remain in force).
**Requirements:** `docs/prd/w-copy-prd.md` (v1.2) read with `docs/planning/decisions.md`.

This document answers one question: what has to be thought about, decided,
de-risked, and built between an empty repository and a shipped MVP. Decisions
live in the decision log; this document only points at them.

---

## 0. Where things stand

| | |
|---|---|
| Repository | Stub README, the 2026-09-07 handoff, PRD v1.2, the decision log, this document. |
| Process | `superpowers:brainstorming`, architectural path, step 2 of 8 (clarifying questions), nearly complete. |
| Decided | D1 to D21 in `decisions.md`. |
| Open | Five items in §2 below. |
| Hard gate | No code, no scaffolding, no implementation skill until a presented design is explicitly approved. |
| Next step | Close the five open items, then step 3: propose two or three approaches with trade-offs. |

---

## 1. What "extremely fast" has to mean

D7 is only enforceable if it is measurable. This section proposes how to turn
it into budgets. The numbers are proposals awaiting the product owner's
acceptance (open item O5 in §2).

### 1.1 Where the time actually goes

One iteration of the core loop, on either platform:

1. Copy in the agent app. *(OS, not ours.)*
2. Switch to w/copy. *(OS, not ours, except that a home-screen-installed app switches faster than a browser tab. D21 helps here.)*
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
| Repeat-visit time to interactive | under 100 ms on a mid-range phone | Lighthouse in CI, plus the service worker from D21 |
| Press to toast, excluding the clipboard API itself | under 16 ms (one frame) | Instrumented in the E2E suite |
| Main-thread work on the action path | no layout read, no storage write, no DOM rebuild | Code review rule, documented in `CLAUDE.md` |
| Runtime dependencies | zero | `package.json` has devDependencies only |
| Animation | every transition runs on the compositor (transform and opacity only); no animation drops below 60 fps on a mid-range phone | Chrome DevTools performance trace in the E2E suite for the three main gestures |

The last row is new. D18 asks for smooth, polished controls; D7 says polish
never costs performance. The way both hold at once is to animate only
properties the compositor can handle without touching layout.

### 1.3 Consequences already settled or implied

- **Storage.** A config is a few kilobytes. `localStorage` is synchronous and
  trivial; `IndexedDB` is asynchronous and needs a wrapper. Under D7 and the
  simplicity tiebreaker, `localStorage` is the recommendation for the spec,
  with a size guard and `navigator.storage.persist()` to reduce eviction risk.
- **PWA (D21).** Service-worker caching is the fastest repeat load, and a
  home-screen install gives a faster app switch on Android.
- **Build step.** Vanilla JS runs unbundled as ES modules. A build step is
  still worth having for minification and for the size check, but it must be
  trivial (one command, one config file) or it works against D6. Open item O4.
- **Rendering.** With no framework, the choice is between rebuilding the stack
  DOM from state on every change, or targeted updates. For a list of under
  twenty cards either is fast. The picker in D17 and the editor in D15 push
  toward a small, explicit state-to-DOM layer rather than ad hoc updates. This
  is the main fork for step 3.

---

## 2. What is decided and what is still open

Everything in the original question queue, with its status.

### Decided (see `decisions.md` for the exact wording)

| Topic | Decision |
|---|---|
| Which PRD is authoritative | D9: union of v1.2 and the v2 draft; the log wins conflicts. |
| Join semantics | D10: one global separator, blank line default, trailing whitespace trimmed. |
| Empty or non-text clipboard | D11: refuse with a specific toast. |
| Variant multiplicity | D12: exactly one active variant per piece. |
| One stack or many | D13: one, with an additive path to many. |
| The clipboard slot | D14: exactly one, validated on import. |
| Authoring surface | D15: in-app UI. JSON is backup and portability only. |
| Invalid or old config | D16: refuse invalid, migrate old, hand-written validator. |
| Variant gesture | D17: tap reveals all variants; add, edit, enable, disable from that view; feel settled during build. |
| Craft | D18: polished and smooth, never at the cost of budgets. |
| Reordering | D19: long-press drag, up and down buttons as fallback. |
| App switches | D20: two per iteration accepted for MVP. |
| PWA | D21: installable with offline caching. |

### Open

**O1. Preview.** *(was Q11)*
PRD: toast only, no preview of the merged text. Recommendation: toast only for
MVP. A preview is a second screen of UI and a second thing to keep fast.

**O2. Hosting and domain.** *(was Q14)*
Is `withcopy.app` registered with DNS under the product owner's control?
Cloudflare Pages or GitHub Pages? Cloudflare supports custom response headers
(Content-Security-Policy, HSTS); GitHub Pages does not, leaving only a meta-tag
CSP. Recommendation: Cloudflare Pages.

**O3. Testing.** *(was Q15)*
Recommendation: Vitest for pure logic (merge, validation, migration), Playwright
against real Chrome for the clipboard path with permissions granted in the
harness, never mocked, on both a desktop and a mobile-emulated viewport.

**O4. Build step.** *(was Q16)*
No build at all and serve the source files, or a minimal one-command minify
step that also enforces the size budget? Recommendation: the minimal step.

**O5. Performance budget numbers.** *(was Q17)*
Accept the seven rows in §1.2 as starting targets, or change any number?

### Scope consequences of D15 and D17

These two answers add a whole authoring surface that the 1.0 PRD did not
describe. Concretely, MVP now includes:

- Create, rename, and delete a piece.
- Add, edit, delete, enable, and disable a variant within a piece.
- A variant picker per piece that shows every enabled variant and marks the
  active one.
- Enough state management to keep the stack view, the picker, and the editor
  consistent without a framework.

This is the right call (nobody hand-authors JSON) but it roughly doubles the UI
surface relative to the 1.0 text. Phase 5 in §4 has been resized accordingly,
and the schema in PRD §5 must be redefined in the spec: a map of id to string
cannot carry an enabled flag.

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
   hand-written. D19's fallback bounds the risk; it does not remove it.
4. **The picker's feel (D17).** The product owner wants to settle the gesture
   by feel. That means at least one throwaway interaction prototype, which is
   code before design approval. Proposal: a single-file prototype with no
   persistence, no clipboard, no shared code with the app, explicitly deleted
   afterwards. Needs the product owner's go-ahead.
5. **Data loss.** `localStorage` can be evicted when the browser is under
   storage pressure or the user clears site data. Export is the backup.
   `navigator.storage.persist()` helps. The design must make the loss mode
   obvious and the recovery (import) fast.
6. **Content Security Policy.** A clipboard app is a plausible target for
   injected script. No `eval`, no inline handlers, a strict CSP. Whether CSP can
   be a real header depends on O2 (hosting).
7. **Permission persistence on desktop.** The core assumption behind D2 is that
   Chrome desktop grants clipboard-read persistently per origin. This is
   documented behaviour but should be confirmed in the E2E harness rather than
   trusted.

---

## 4. The steps from here to MVP

Ordered. Each phase has an output that can be reviewed asynchronously.

### Phase 0: decide *(now, nearly done)*

Close O1 to O5. Output: the decision log complete for MVP.

### Phase 1: design *(brainstorm steps 3 to 7)*

1. Propose two or three approaches with trade-offs and a recommendation. The
   real forks are: the state-to-DOM model in vanilla JS (rebuild versus
   targeted updates versus a tiny reactive store); single page versus landing
   plus app; and how the editor and picker are surfaced (in-place, bottom
   sheet, separate view).
2. Present the design in sections, approval after each:
   - data model, schema, validation, migration
   - merge algorithm, join semantics, edge cases
   - clipboard adapter, permission flow, every fallback
   - stack view, picker, editor: structure, gestures, motion, one-handed
     layout, desktop scaling
   - persistence, import, export, loss recovery
   - PWA: manifest, service worker, cache invalidation
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
- Build step per O4, with the size and external-origin checks from §1.2.
- Test harness per O3: unit runner, Playwright with clipboard permissions
  granted, desktop and mobile-emulated projects.
- CI: suite plus budgets on every push; preview deploy per branch.
- Hosting wired to the domain with HTTPS and headers per O2.

Output: an empty app that deploys, with a green suite and enforced budgets.

### Phase 4: the core loop *(first usable build)*

- Merge function: pure, exhaustively unit tested against D10 and D11.
- Storage layer with validation and migration per D16.
- Clipboard adapter with every fallback from §3 items 1 and 2.
- Minimal UI: the stack rendered from a default config, the placeholder, the
  action button, the toast.

Output: something the product owner can dogfood in the real agent-handoff
loop, on phone and desktop. Everything after this is informed by that use.

### Phase 5: authoring and selection *(resized for D15 and D17)*

- Piece editor: create, rename, delete.
- Variant editor: add, edit, delete, enable, disable.
- Variant picker per D17, with the feel iterated against the animation budget.
- Reordering per D19.
- Import and export, with the loss-recovery path from §3 item 5.

### Phase 6: mobile hardening

- Android Chrome clipboard fallback verified on a physical device.
- PWA manifest and service worker per D21, with cache invalidation on deploy.
- One-handed layout audit; touch-target sizes; safe-area insets.

### Phase 7: landing and launch

- Landing page per PRD §4, same budgets.
- Launch checklist: Lighthouse at 100 across the board on both pages, CSP
  live, zero external requests confirmed, keyboard-only pass on desktop,
  screen-reader pass on the action path.

### Phase 8: parking lot *(explicitly not MVP)*

- D4 desktop companion via `irm | iex`.
- Android share target (removes one app switch per iteration; depends on D21).
- Multiple stacks or presets (D13 leaves the door open).
- Formatting toggles.
- Per-piece join overrides (D10 defers them).
- Preview, if O1 lands on toast-only.

---

## 5. Definition of MVP done

All of the following, none optional:

- The core loop works on Chrome desktop and Chrome Android, on the real domain
  over HTTPS, with no repeat permission prompt on desktop and a designed
  fallback on Android.
- Pieces and variants can be fully managed in the app without touching JSON.
- Every budget in §1.2 (as finally agreed) is enforced in CI and green.
- Full suite green on every commit; the clipboard path is tested against real
  Chrome, not a mock.
- Import and export round-trip losslessly, and an invalid file is refused with
  a precise error.
- Installable as a PWA and usable offline.
- Landing page and app page both ship; zero external requests; strict CSP.
- Every decision in `decisions.md` is reflected in what was built, and the spec
  matches the build.
