# System & Product Requirement Document: w/copy

**Document version:** 1.1 (1.0 as supplied by the product owner on 2026-09-08;
amended the same day, see the changelog at the end)
**Status:** Authoritative requirements for MVP, pending resolution of the open
questions tracked in `docs/planning/2026-09-08-path-to-mvp.md`.

> Note on provenance. The 2026-09-07 handoff in `docs/handoff/` reviewed a
> longer "PRD v2 draft" containing sections (a `setups` array, multi-variant
> selection, config linting, a global-hotkey note) that this document does not
> contain. Whether that draft is superseded by this one is an open question.
> Until answered, this document is treated as authoritative.

---

## 1. Product Overview

- **Name:** w/copy
- **Concept:** A lightweight, local-first web application that, on a single
  explicit user action, reads the current clipboard text, wraps it with
  pre-configured structural "stack" pieces (such as headers, footers, or
  context modifiers), and copies the assembled prompt back to the system
  clipboard. Every clipboard interaction is user-initiated. The app never reads
  the clipboard in the background, on page load, or on window focus.
- **Target Audience:** Users seeking zero-lag prompt assembly for AI workflows
  across both mobile and desktop web browsers.

## 2. Core Architecture & Technical Standards

- **Performance is the first-order requirement.** The app must feel
  instantaneous: near-zero load time on repeat visits, and an imperceptible
  delay between pressing the action and the clipboard being updated. Concrete,
  testable performance budgets are to be defined in the design spec and
  enforced in CI.
- **Tech Stack:** Vanilla HTML5, CSS3, and modern JavaScript (ES6+). Strictly no
  heavy frameworks (e.g., React, Angular) to minimize bundle size, eliminate
  startup overhead, and guarantee zero-lag performance.
- **Hosting & Deployment:** Static file hosting (e.g., GitHub Pages, Cloudflare
  Pages).
- **Storage & Persistence:** Local-first storage using `localStorage` or
  `IndexedDB` for layout preferences, stack ordering, and custom variants. Data
  is completely private to the client.
- **Data Portability:** Full support for importing and exporting user
  configurations via a single, portable JSON file.

## 3. Security, Context & Permissions Strategy

- **Secure Context Requirement:** Must be served exclusively over HTTPS (or
  `localhost`) as required by web security standards for Clipboard API access.
- **Clipboard API Handling:**
  - Uses the native `navigator.clipboard.readText()` and
    `navigator.clipboard.writeText()` APIs.
  - Explicit user gesture triggers (e.g., direct button press) must wrap all
    primary clipboard interactions to comply with browser permission models.
- **Error Handling & Fallbacks:**
  - **Permission Denied:** Graceful UI fallback prompting the user to grant
    clipboard access, or a manual paste fallback if permissions are blocked.
  - **Browser Support:** Feature-detection for `navigator.clipboard` with visual
    alerts if non-supported legacy environments are detected.
- **Privacy Assurance:** Zero remote telemetry, zero backend databases, and no
  external tracking. All text processing occurs in client memory.

## 4. UI/UX Specifications

- **Landing vs. Application Layout:**
  - **Landing View (`/index.html`):** Clean, minimal informational splash page
    explaining the app with a primary "Get Started" call-to-action button.
  - **App View (`/app.html`):** Responsive, mobile-first interface optimized for
    one-handed operation and scaling seamlessly to desktop screens.
- **Stack Interaction:**
  - Vertical card/stack layout representing prompt pieces.
  - Central visual placeholder displaying a clipboard icon to denote where
    active clipboard content resides.
  - Touch-friendly interactions: long-press/drag to reorder pieces, swipe/tap
    to toggle active variants within a stack piece.
- **Action & Notification Feedback:**
  - Executing the copy action updates the system clipboard and immediately
    displays a lightweight toast notification reading: "Wrapped with copy".

## 5. Data Schema (JSON Export/Import)

```json
{
  "version": "1.0",
  "activeStack": ["header_01", "CLIPBOARD_PLACEHOLDER", "footer_01"],
  "pieces": {
    "header_01": {
      "title": "Role Definition",
      "activeVariant": "v1",
      "variants": {
        "v1": "You are a concise engineering assistant.",
        "v2": "You are a senior software architect."
      }
    },
    "footer_01": {
      "title": "Output Constraint",
      "activeVariant": "v1",
      "variants": {
        "v1": "Provide direct code without preamble."
      }
    }
  }
}
```

---

## Changelog

### 1.1 (2026-09-08)

- **§1 Concept.** Removed "read or intercept". A web page cannot intercept the
  clipboard, and the product owner does not want the word or the implication.
  Replaced with wording that makes every clipboard read an explicit,
  user-initiated action, and added a sentence ruling out background, on-load,
  and on-focus reads.
- **§2.** Added an explicit performance requirement as the first item, per the
  product owner's direction that the app be extremely fast. Budgets deferred to
  the design spec so they can be agreed on rather than asserted here.
- Formatting only: converted the pasted text to Markdown and replaced
  invisible word-joiner characters around identifiers with code spans.

### 1.0 (2026-09-08)

- Initial document as supplied by the product owner.
