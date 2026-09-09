# w/copy: Decision Log

Single source of truth for product and process decisions. Every row is sourced.
A decision is changed by adding a new row that supersedes it, never by editing
the old one.

| # | Date | Decision | Source |
|---|---|---|---|
| D1 | 2026-09-07 | Phone and desktop, both on day one. | Local session, handoff §3 |
| D2 | 2026-09-07 | Chrome only for MVP. No Firefox or Safari. | Local session, handoff §3 |
| D3 | 2026-09-07 | Web-hosted for MVP on both platforms. | Local session, handoff §3 |
| D4 | 2026-09-07 | PowerShell `irm \| iex` desktop companion is Phase 2, not MVP. | Local session, handoff §3 |
| D5 | 2026-09-07 | Work continues in a cloud agent. Process constraint only. | Local session, handoff §3 |
| D6 | 2026-09-08 | Vanilla HTML, CSS, JavaScript. No framework. | PRD §2, confirmed by product owner |
| D7 | 2026-09-08 | Performance is the first-order requirement: extreme speed on load and on action. | PRD §2, confirmed by product owner |
| D8 | 2026-09-08 | Every clipboard read is an explicit user-initiated action. No background, on-load, or on-focus reads. | PRD v1.1 §1 |
| D9 | 2026-09-08 | Requirements are the union of PRD v1.1 and the longer "v2 draft" as captured in the 2026-09-07 handoff. Where they conflict, this log wins. | Product owner, answer to Q1 |
| D10 | 2026-09-08 | **Join semantics.** One global separator between adjacent pieces, defaulting to a blank line. Trailing whitespace is trimmed from each piece before joining; leading whitespace is kept. Per-piece override is deferred. | Product owner, answer to Q2 |
| D11 | 2026-09-08 | **Empty or non-text clipboard.** Refuse with a specific toast. Never write a wrapper around nothing, and never silently coerce non-text content. | Product owner, answer to Q3 |
| D12 | 2026-09-08 | **Variant multiplicity.** Exactly one active variant per piece at the moment of the action. | Product owner, answer to Q4 |
| D13 | 2026-09-08 | **Stacks.** Exactly one stack in MVP. Schema shaped so that multiple stacks later is an additive migration. | Product owner, answer to Q5 |
| D14 | 2026-09-08 | **Clipboard slot.** Exactly one per stack, validated on import. | Product owner, answer to Q6 |
| D15 | 2026-09-08 | **Authoring.** Pieces and variants are created and edited inside the app through UI. JSON is for export, import, and backup only. It is never the authoring surface. | Product owner, answer to Q7 |
| D16 | 2026-09-08 | **Invalid or old config.** Refuse invalid files with a precise error. Migrate older valid versions forward. Validator is hand-written; no runtime dependency. | Product owner, answer to Q8 |
| D17 | 2026-09-08 | **Variant selection.** Tapping a piece reveals all of its variants for selection; the user sees what is available rather than blind-cycling. Variants are a visible, editable collection per piece: add, edit, enable, disable. The exact gesture and motion are to be settled by feel during build, with both a picker and a cycle sharing one data model. | Product owner, answer to Q9 |
| D18 | 2026-09-08 | **Craft.** This is a portfolio piece. Controls must look and feel polished and smooth. Polish is never bought at the cost of the performance budgets. | Product owner, answer to Q9 |
| D19 | 2026-09-08 | **Reordering.** Long-press then drag is the target. Up and down buttons are an acceptable MVP fallback. | Product owner, answer to Q10 |
| D20 | 2026-09-08 | **App switches.** Two context switches per iteration is the accepted MVP shape. Desktop companion (D4) and an Android share target are the later fixes. | Product owner, answer to Q12 |
| D21 | 2026-09-08 | **PWA.** Installable to the home screen with offline caching in MVP. | Product owner, answer to Q13 |
| D22 | 2026-09-09 | **Design handoff is authoritative for product, UX, and visual design.** `docs/design/2026-09-09-design-handoff.md` wins over every earlier document on those topics. The technical spec wins on low-level architecture. | Product owner |
| D23 | 2026-09-09 | **Multiple stacks.** Supersedes D13. A stack is a named, ordered collection of pieces with its own accent color. Pieces are never shared across stacks. App opens to the last-used stack. New stacks start from the header/clipboard/footer template. | Design handoff §2 |
| D24 | 2026-09-09 | **Clipboard slot is toggleable.** Supersedes the "always present" reading of D14. Still exactly one per stack, but it can be disabled like any piece. When disabled, the app does not read the clipboard at all. | Design handoff §2 |
| D25 | 2026-09-09 | **Growth guard.** The app remembers its own last output and skips wrapping when the clipboard exactly equals it, with a toast. Content-pattern detection is explicitly rejected. | Design handoff §2 |
| D26 | 2026-09-09 | **Editing model.** Inline editing on the card, a fill-screen expand for long text, no confirmation dialogs, delete-then-undo modeled on Gmail. | Design handoff §2 |
| D27 | 2026-09-09 | **Variants.** Amends D17. Tap reveals the full list; one active. Per-variant enable/disable is dropped; enable/disable lives on the piece. Deleting a variant (with undo) covers the rest. | Design handoff §2, spec simplification |
| D28 | 2026-09-09 | **Onboarding.** Ships with a self-explaining example header and footer, never blank. | Design handoff §3 |
| D29 | 2026-09-09 | **Visual design.** Single screen; left slide-out panel of stacks; gear to a settings screen; modern and minimal; neutral UI with one colorful action button, small type-label accents, and a per-stack accent. Light and dark with system default and manual override. Compact and comfortable density. | Design handoff §4 |
| D30 | 2026-09-09 | **Toasts for every outcome.** Success and every error, never silent. Top on phone. Bottom on desktop, chosen as the industry-standard default since the handoff left it open. | Design handoff §4, §9 |
| D31 | 2026-09-09 | **Platform.** Amends D2. Chrome on desktop and on iPhone. iPhone Chrome is WebKit, so clipboard behaviour follows Safari rules. No Android. | Design handoff §5 |
| D32 | 2026-09-09 | **No build step. Zero tooling.** Supersedes the open build-step item. Source is served as-is. A deploy workflow may copy files and stamp a version string; it may not transform code. | Design handoff §5 |
| D33 | 2026-09-09 | **No numeric performance budgets.** Supersedes the proposed budgets. The bar is qualitative: lean, instantaneous. | Design handoff §5 |
| D34 | 2026-09-09 | **JSON is the storage format and a power-user escape hatch** via export/import in Settings. Never the primary interaction. Must be lintable, meaning validation errors carry a path and a message. | Design handoff §6 |
| D35 | 2026-09-09 | **Cross-device transfer** by a compressed link in the URL fragment, optionally a QR code on desktop. In scope for MVP. | Design handoff §7 |
| D36 | 2026-09-09 | **Hosting: GitHub Pages** for now, custom domain withcopy.app, DNS stays on Cloudflare. | Product owner |
| D37 | 2026-09-09 | **Testing strategy deferred.** Vitest and Playwright are not adopted. Until decided, pure logic modules are tested with Node's built-in `node:test` runner, which adds no dependency and no tooling, so the "suite green before commit" rule still has something to run. UI is verified against a written manual checklist. | Product owner, with the minimum chosen by the orchestrating agent |
| D38 | 2026-09-09 | **No separate landing page in MVP.** The app is served at the root. The onboarding content explains the product. A landing page can be added later without rework. | Orchestrating agent, flagged to the product owner |
| D39 | 2026-09-09 | **Separator is per stack**, default blank line, no UI in MVP (editable via JSON). Refines D10 now that stacks exist. | Orchestrating agent, technical |
| D40 | 2026-09-09 | **Work is delegated to Sonnet agents only**, orchestrated from this session. No Opus agents. | Product owner |

## Open

- Testing strategy beyond `node:test` (D37).
- Toast placement on desktop is a default, not a preference (D30).
