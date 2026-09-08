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

## Open

Tracked in `2026-09-08-path-to-mvp.md` §2. As of 2026-09-08: preview, hosting
and domain, testing, build step, performance budget numbers.
