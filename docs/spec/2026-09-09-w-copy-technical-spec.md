# w/copy: Technical Specification

**Date:** 2026-09-09
**Status:** Authoritative for low-level architecture. Product, UX, and visual
decisions come from `docs/design/2026-09-09-design-handoff.md`, which wins on
any overlap. Decisions are logged in `docs/planning/decisions.md`.

This spec is written so that several agents can build separate modules in
parallel and have them fit. Interfaces below are contracts. Change one only by
changing it here first.

---

## 1. Constraints that shape everything

- Vanilla HTML, CSS, JavaScript (ES2022, native ES modules). No framework, no
  runtime dependency, no build step. Source files are served exactly as
  committed.
- Chrome on desktop and Chrome on iPhone. iPhone Chrome is WebKit, so the
  clipboard code must satisfy Safari's rules, not Chrome's.
- Static hosting on GitHub Pages at `https://withcopy.app`. No backend. No
  telemetry. No external requests at runtime, including fonts.
- Installable PWA with offline support.
- Performance bar is qualitative: lean, instantaneous. Practically: no
  layout-triggering animation, no work on the action path beyond the
  clipboard calls and one toast, no synchronous storage write larger than the
  state itself (a few kilobytes).
- Security: strict Content-Security-Policy via a `<meta>` tag (GitHub Pages
  cannot set headers). No inline scripts, no inline event handlers, no `eval`.
  All JS in external module files, all CSS in external files.

---

## 2. Repository layout

```
/                                 the repository root IS the published site (GitHub Pages, branch main, folder /)
├── .nojekyll                     tells Pages to publish files untouched
├── CNAME                         withcopy.app
├── index.html                    root: minimal forwarding page to /app/ until the landing page exists (D41)
├── app/
│   └── index.html                the app (single screen), served at /app/
├── probe.html                    temporary clipboard probe page (see §9)
├── manifest.webmanifest
├── sw.js                         service worker
├── icons/                        icon.svg, icon-192.png, icon-512.png, apple-touch-icon.png, maskable-512.png
├── css/
│   ├── tokens.css                design tokens: color, space, type, radius, motion; light/dark; density
│   └── app.css                   layout and components
├── js/
│   ├── main.js                   bootstrap: load state, render, wire events
│   ├── store.js                  state container + persistence
│   ├── schema.js                 ids, defaults, validation, migration
│   ├── merge.js                  pure assembly of the output text
│   ├── clipboard.js              read/write adapter with WebKit strategy
│   ├── pile.js                   i/copy's pile: pure append/render + guarded localStorage IO
│   ├── link.js                   stack <-> URL fragment codec
│   ├── qr.js                     QR encoder
│   └── ui/
│       ├── toast.js
│       ├── undo.js
│       ├── stack-view.js         renders the list of piece cards
│       ├── piece-card.js         one card: label, text, variants, controls
│       ├── variants.js           variant list behaviour
│       ├── drag.js               pointer-based reorder with a handle
│       ├── expand.js             fill-screen editor dialog
│       ├── side-panel.js         stack list
│       └── settings.js           settings dialog, export/import, share link
├── tests/                        node:test files, run with `npm test` (no deps)
├── package.json                  scripts only, no dependencies
├── CLAUDE.md                     project rules for agents
├── README.md
└── docs/                         planning and specs; published as plain files, harmless
```

Non-site files (`docs/`, `tests/`, `package.json`, `CLAUDE.md`, `README.md`)
are published too, since branch deployment serves the whole root. They are
public anyway and contain nothing sensitive (D42). The service worker never
precaches them.

`package.json` exists only for `"scripts": { "test": "node --test tests/**/*.test.js" }`
and `"type": "module"`. It has no `dependencies` and no `devDependencies`.

**Paths.** The app page is `/app/index.html`, served at `/app/`. Every
reference to CSS, JS, icons, and the manifest from any page is root-absolute
(`/css/app.css`, `/js/main.js`, `/icons/icon.svg`, `/manifest.webmanifest`),
never relative, so pages can move without breaking. The root `index.html` is
a tiny page with the same CSP, a `<meta http-equiv="refresh" content="0; url=/app/">`,
and a visible link to `/app/` for browsers that block the refresh. Share
links are `https://withcopy.app/app/#s=...`. When the landing page is built
(after MVP, D41) it replaces the root page and nothing else moves.

---

## 3. Data model

Schema version 1. Stored as JSON. Every id is a short random string from
`newId(prefix)`: prefix, underscore, 10 base36 chars from `crypto.getRandomValues`.

```json
{
  "version": 1,
  "activeStackId": "stk_a1b2c3d4e5",
  "settings": {
    "theme": "system",
    "density": "comfortable"
  },
  "stacks": [
    {
      "id": "stk_a1b2c3d4e5",
      "name": "My first stack",
      "accent": "green",
      "separator": "\n\n",
      "pieces": [
        {
          "id": "pc_x1y2z3w4v5",
          "kind": "header",
          "enabled": true,
          "activeVariantId": "var_q1w2e3r4t5",
          "variants": [
            { "id": "var_q1w2e3r4t5", "label": "Default", "text": "Hello, welcome to w/copy..." }
          ]
        },
        { "id": "pc_clip000001", "kind": "clipboard", "enabled": true },
        {
          "id": "pc_m1n2b3v4c5",
          "kind": "footer",
          "enabled": true,
          "activeVariantId": "var_z1x2c3v4b5",
          "variants": [
            { "id": "var_z1x2c3v4b5", "label": "Default", "text": "Everything above me was..." }
          ]
        }
      ]
    }
  ]
}
```

Rules, all enforced by `validateState`:

- `version` is the integer `1`.
- `settings.theme` is one of `system | light | dark`. `settings.density` is
  one of `comfortable | compact`.
- `stacks` is a non-empty array. `activeStackId` names one of them.
- `stack.accent` is one of the eight accent names in §7.3.
- `stack.separator` is a string. Default `"\n\n"`.
- `piece.kind` is one of `header | footer | text | clipboard`.
- Exactly one piece per stack has kind `clipboard`. It has no `variants` and
  no `activeVariantId`.
- Every non-clipboard piece has a non-empty `variants` array and an
  `activeVariantId` naming one of them.
- Ids are unique within their scope. Unknown extra keys are rejected (lintable).

Other localStorage keys, never part of export:

| Key | Value |
|---|---|
| `wcopy.state` | the JSON above |
| `wcopy.lastOutput` | the exact string the app last wrote to the clipboard, for the growth guard |
| `wcopy.lastOutputKind` | `'wrap' \| 'stack'` — which button produced `wcopy.lastOutput` (W6). Written alongside it, by whichever of `runWCopy`/`runICopy` in `main.js` last succeeded. The growth guard (§6) now checks both: refuse to wrap what was last *wrapped*, refuse to stack what was last *stacked*, but allow wrapping a pile (kind `stack`) and stacking a wrapped block (kind `wrap`), since those are different actions even when the clipboard text momentarily matches. Kept as its own key rather than folded into `wcopy.lastOutput`'s value so `store.js`'s existing `saveLastOutput(text)`/`loadLastOutput()` contract (§4.3) is untouched by this addition. |
| `wcopy.pile` | `{ chunks: string[] }` — i/copy's accumulated clipboard chunks (§4.8). One pile, shared across stacks; not scoped to `activeStackId`. **Never part of the exported JSON or the share link** — it is a transient clipboard-workflow buffer, not stack configuration. |

Export/import of the whole state uses the same JSON. Export/import of one stack
(the share link) uses the `stack` object alone, wrapped as
`{ "version": 1, "stack": { ... } }`.

---

## 4. Module contracts

All modules are ES modules with named exports. Pure modules (`schema`,
`merge`, `link`) must not touch the DOM or `window` beyond `crypto` and
`CompressionStream`, so `node:test` can run them.

### 4.1 `schema.js`

```js
export const SCHEMA_VERSION = 1;
export const ACCENTS = ['green','orange','blue','purple','pink','teal','red','yellow'];
export const KINDS = ['header','footer','text','clipboard'];

export function newId(prefix);                       // 'stk' | 'pc' | 'var'
export function createVariant(text = '', label = '');
export function createPiece(kind, text = '');        // clipboard kind ignores text
export function createStack({ name, accent });       // header + clipboard + footer template, empty texts
export function createOnboardingStack();             // the self-explaining example (§8)
export function createDefaultState();                // one onboarding stack, settings defaults

export function validateState(input);  // { ok: true, value } | { ok: false, errors: [{ path, message }] }
export function validateStack(input);  // same shape, for a bare stack object
export function migrate(input);        // returns an object at SCHEMA_VERSION or throws Error with .errors
```

`validateState` returns a deep copy on success so callers never keep a
reference to caller-owned input. Error paths use dotted/bracket notation,
e.g. `stacks[0].pieces[2].activeVariantId`.

### 4.2 `merge.js`

```js
export function needsClipboard(stack);               // true if the clipboard piece is enabled
export function assemble(stack, clipboardText);
// -> { ok: true, text }
// -> { ok: false, reason: 'EMPTY_STACK' | 'EMPTY_CLIPBOARD' }
export function shouldSkip(clipboardText, lastOutput); // exact string equality, false when lastOutput is null
```

Algorithm for `assemble`:

1. Take pieces in order where `enabled` is true.
2. For a clipboard piece, the segment is `clipboardText` unchanged.
3. For any other piece, the segment is the active variant's `text` with
   trailing whitespace removed (`replace(/\s+$/, '')`). Leading whitespace
   is kept.
4. Drop segments that are empty strings after step 3, except the clipboard
   segment, which is never dropped silently: if the clipboard piece is
   enabled and `clipboardText` is empty or whitespace only, return
   `EMPTY_CLIPBOARD`.
5. If no segments remain, return `EMPTY_STACK`.
6. Join with `stack.separator`.

`assemble` is pure and synchronous.

### 4.3 `store.js`

```js
export function createStore({ initial, save });
// -> { get(), commit(mutator), patch(mutator), subscribe(listener) -> unsubscribe }
export function loadState();     // reads wcopy.state, migrates, validates; falls back to createDefaultState() and reports
export function saveState(state);
export function loadLastOutput(); export function saveLastOutput(text);
```

- `commit(fn)` calls `fn(draftState)`, then saves, then notifies subscribers.
  Use for structural changes (add, delete, reorder, switch stack, settings).
- `patch(fn)` calls `fn(draftState)` and saves, but does not notify. Use for
  keystrokes in a text field, so the field being typed in is never
  re-rendered under the user's cursor.
- Saving is coalesced: many calls in one task produce one `localStorage`
  write, scheduled with `queueMicrotask`.
- `loadState` on corrupt or invalid stored data does not throw: it keeps the
  bad JSON under `wcopy.state.corrupt` for recovery, returns the default state,
  and returns a flag so the UI can toast "Saved data could not be read; a
  fresh start was created."

### 4.4 `clipboard.js`

```js
export class ClipboardError extends Error { code; } // 'UNSUPPORTED' | 'DENIED' | 'NOT_FOCUSED' | 'EMPTY' | 'UNKNOWN'
export function supportsClipboard();                 // navigator.clipboard && isSecureContext
export async function readText();                    // string; throws ClipboardError
export async function writeText(text);               // throws ClipboardError
export function writeDeferred(textPromise);          // Promise<void>; WebKit-safe write, see below
export function readFromPasteEvent(event);           // string from event.clipboardData

// Platform strategy (W5)
export function nextClipboardStrategy({ storedStrategy, readOutcome });
// pure; -> { strategy: 'read'|'paste', attemptRead: boolean }
export function detectDefaultStrategy({ maxTouchPoints, hasQueryableClipboardReadPermission });
// pure; -> 'read'|'paste', the seeding rule
export function loadClipboardStrategy();             // 'read'|'paste'|null; localStorage-backed
export function saveClipboardStrategy(strategy);      // persists it; never throws
export function seedClipboardStrategy();              // detects + persists + returns it; synchronous
export function getOrSeedClipboardStrategy();         // stored value, or seeds one if none yet
```

**Two strategies, chosen per device (W5), shared by both action controls
(W6 added the second control; the strategy itself is per-device, not
per-button).** This supersedes the single read-then-write sequence this
section originally described. The product owner's real-iPhone (iOS 18.7)
probe results overturned that original design: `writeDeferred(readText()
.then(...))` only ever looked viable in testing because the probe's own
"read then write" experiments left the probe's own prior output on the
clipboard, and WebKit skips its native Paste callout entirely for
same-origin content — never the case that matters. With clipboard content
copied from another app, pressing w/copy on iPhone failed immediately with
**no callout at all**: holding a clipboard write open across the read
(exactly what `writeDeferred` does) appears to suppress the callout, so the
read is denied before the user ever gets a chance to grant it. See
`docs/tasks/w5-clipboard-streamline.md` for the full evidence and
`probe.html` for the experiments that pinned this down.

- **`read` strategy — Desktop Chrome.** `readText()` prompts once per origin
  and the grant persists; `await readText()` then `await writeText()` works
  because Chrome's transient activation outlives the await. Each button's
  click handler calls `writeDeferred(readText().then(assembleAndGuard))`
  synchronously, unchanged from before W5 — desktop Chrome never needed the
  WebKit trick to begin with, but keeping the same shape here costs nothing
  and keeps this code path identical to what shipped and was tested.
- **`paste` strategy — iPhone (WebKit), and anything that has ever had a read
  denied.** No read is ever attempted, by either button. Both action
  controls (spec §7.1) are themselves paste targets: `contenteditable`,
  `inputmode="none"` to keep the software keyboard down. Which control the
  user's native Paste lands on decides which action runs — the text arrives
  via `readFromPasteEvent`, and the handler for that control runs its own
  growth guard and assembly, then `writeText`s the result *inside that same
  `paste` event*, which is a user gesture on every platform, WebKit
  included, and needs no permission of its own.
- **Choosing and persisting the strategy.** Stored in `localStorage` under
  `wcopy.clipboardStrategy`, one value for the whole device — not one per
  button. Seeded once, on first run, by `detectDefaultStrategy`: a
  touch-capable device (`navigator.maxTouchPoints > 0`) with no queryable
  clipboard-read permission (a capability probe —
  `navigator.permissions.query({name:'clipboard-read'})` throws synchronously
  on WebKit, which does not recognize that permission name, but not on
  Chrome — preferred over sniffing the user agent string) seeds `paste`;
  everything else seeds `read`. `nextClipboardStrategy` is the pure rule for
  what happens after: in `read` strategy, a `DENIED` or `UNSUPPORTED` read
  outcome demotes to `paste` permanently; `paste` strategy never attempts a
  read again. **A demotion is silent** — no toast, ever — each action
  control's own label (`js/main.js`'s `updateActionUI`) is the only signal:
  w/copy switches from "w/copy" to "Paste to w/copy", i/copy from "i/copy"
  to "Paste to pile" — short enough not to wrap at 390px (`"Paste to
  i/copy"` measures wider than i/copy's own share of `.wc-actionrow` and
  overflows there; "pile" is already the app's own name, everywhere else in
  the UI, for what i/copy accumulates into). This is the single most
  important behavior in the whole feature: on a device that cannot read the
  clipboard, the user must never see an error, a sheet, or a prompt as a
  result of that.
  - w/copy's paste invitation additionally requires its active stack's
    clipboard piece to be enabled — disabled, it writes immediately on any
    strategy, no read or paste needed (design point 4), so it never has
    anything to invite a paste for.
  - i/copy's paste invitation depends on the strategy alone: i/copy always
    needs the clipboard's current content (that is the whole feature, W6),
    so its own stack's clipboard-piece toggle is irrelevant to it.
- **The old paste-fallback dialog** (a focused, empty `<textarea>` in a sheet
  titled "Paste here", `readFromPasteEvent` + `writeText` on its `paste`
  event) is no longer opened as a consequence of a denied or unsupported
  read — that is now the `paste` strategy's job, handled inline on whichever
  action control the user presses, with no dialog at all. The dialog, and
  the functions that drive it, remain in `js/main.js` and `app/index.html`
  unused, reserved for a device with no Clipboard API whatsoever (neither
  `read` nor `paste` strategy can write back in that case); nothing
  currently opens it automatically.

Every failure still maps to a `ClipboardError` code, and the UI maps every
code that reaches it to a toast message (§7.5) — nothing is silent — except
`DENIED`/`UNSUPPORTED` in `read` strategy, which is the one deliberately
silent case above.

### 4.5 `link.js`

```js
export async function encodeStack(stack);   // -> base64url string
export async function decodeStack(str);     // -> validated stack object; throws Error with .errors
export function buildShareUrl(encoded, origin = location.origin); // `${origin}/app/#s=${encoded}`
export function parseShareFragment(hash);   // -> encoded string | null
```

Encoding: `JSON.stringify({ version: 1, stack })` → UTF-8 bytes →
`CompressionStream('deflate')` → base64url (no padding). Decoding reverses it
and runs `validateStack`. Both `CompressionStream` and `DecompressionStream`
exist in Chrome 80+, Safari 16.4+, and Node 18+.

On app load, if `parseShareFragment(location.hash)` yields a value: decode,
assign a fresh `id` to the stack and to every piece and variant (never
overwrite), append it, make it active, toast "Imported 'Name'" with Undo,
and clear the fragment with `history.replaceState`.

### 4.6 `ui/toast.js` and `ui/undo.js`

```js
export function showToast({ message, tone = 'info', action, duration = 4000 });
// tone: 'success' | 'error' | 'info'; action: { label, onClick }; returns { dismiss() }
export function undoable({ message, undo, duration = 6000 }); // one slot; a new undoable replaces the previous
```

One toast visible at a time. Position: top on narrow viewports (under 640px
wide), bottom on wider ones. Slide and fade using `transform` and `opacity`
only. Respect `prefers-reduced-motion`.

### 4.7 `ui/drag.js`

```js
export function enableReorder(listEl, { handleSelector, itemSelector, onReorder });
// onReorder(fromIndex, toIndex) is called once on drop
```

Pointer Events on the handle only, `touch-action: none` on the handle. While
dragging, the lifted card follows the pointer with `transform`; the other
cards shift with a FLIP transition. Long-press is not required when a
dedicated handle exists (the handoff asks for a handle). Keyboard alternative:
handle is focusable, Arrow Up/Down with the handle focused moves the item.

### 4.8 `pile.js` (W6)

```js
export function loadPile();                  // { chunks: [] } when absent, unreadable, or the wrong shape
export function savePile(pile);
export function clearPile();
export function appendChunk(pile, text);      // pure; returns a NEW pile; ignores empty/whitespace-only text
export function renderPile(pile, separator);  // pure; the joined string, per-chunk trailing-trim, '' for zero chunks
```

`appendChunk` and `renderPile` are pure and synchronous, like `merge.js` —
no DOM, no `localStorage` — and are the two functions `node:test` exercises
directly. `loadPile`/`savePile`/`clearPile` follow `store.js`'s guarded
`localStorage` pattern (never throw; a missing or throwing `localStorage` is
treated as an empty pile) but live in their own module because the pile is
not part of the `wcopy.state` document `store.js` owns: it has no schema
version, is never validated or migrated, and updating it must never trigger
a `store` subscriber to re-render (§5).

`renderPile`'s per-chunk rule — trailing whitespace stripped
(`replace(/\s+$/, '')`), leading kept — mirrors `merge.assemble`'s rule for
non-clipboard segments, so a rendered pile always reads as plain
accumulation and never picks up a stray trailing newline between chunks.

---

## 5. Rendering model

No virtual DOM. Two paths:

- **Structural render.** `subscribe` in `main.js` calls `renderStack(state)`
  which rebuilds the piece list for the active stack, and updates the header
  (stack name, accent), side panel, and settings. Cheap for a list of a few
  dozen cards.
- **Text edits.** The card's `<textarea>` `input` event calls `store.patch`
  and nothing re-renders. Auto-grow uses CSS `field-sizing: content` with a
  JS fallback that sets `height` from `scrollHeight` (a layout read, but only
  while typing, never on the action path).

Focus and scroll position are preserved across structural renders by
recording the focused element's `data-id` and restoring it after render.

---

## 6. Action path (the w/copy and i/copy presses) (W5: two shapes, chosen per device)

Each action control's click handler decides, before doing anything else,
whether this press needs a read at all — `nextClipboardStrategy` (§4.4) is
the single source of truth for that, called with `readOutcome: null`:

```
click on the action control
 ├─ wcopy AND its stack's clipboard piece disabled -> runWCopy(): assemble(stack,''); write; toast success (no read/paste, any strategy)
 ├─ attemptRead === false (paste strategy) -> focus the action control; do nothing else here
 └─ attemptRead === true  (read strategy)  -> runWCopy() / runICopy()
```

`i/copy` has no clipboard-piece concept of its own (see below), so its
click handler skips straight to the `attemptRead` branch.

`runWCopy()` and `runICopy()` (the `read`-shaped path, desktop Chrome in
practice) each obtain the clipboard text the same way, via `getClipboardText`
in `main.js` — today a pass-through to `clipboard.js`'s `readText()`:

```
runWCopy
 ├─ clipboard piece disabled          -> text = assemble(stack, '') ; write ; toast success
 │    (an all-disabled stack falls out of this same branch: assemble('')
 │    reports EMPTY_STACK when nothing else is enabled either)
 └─ clipboard piece enabled
      ├─ getClipboardText() (platform strategy §4.4)
      ├─ read failed, DENIED/UNSUPPORTED -> nextClipboardStrategy demotes to `paste`; SILENT — no toast, both buttons relabel on next render
      ├─ read failed, other code         -> toast per error code (§7.5)
      ├─ shouldSkip(text, lastOutput) AND
      │  lastOutputKind === 'wrap'        -> toast info "Already wrapped. Copy something new first."
      ├─ assemble -> EMPTY_STACK/EMPTY_CLIPBOARD -> toast error "Nothing to copy. Enable a piece first." / "Your clipboard is empty."
      └─ write result ; saveLastOutput(result) ; saveLastOutputKind('wrap')
         ; toast success "Wrapped with copy"
```

```
runICopy (W6)
 ├─ getClipboardText() (same strategy as w/copy, §4.4)
 ├─ read failed, DENIED/UNSUPPORTED -> same silent demotion as runWCopy
 ├─ read failed, other code         -> toast per error code, same mapping as w/copy
 ├─ shouldSkip(text, lastOutput) AND
 │  lastOutputKind === 'stack'       -> toast info "Already stacked. Copy something new first."
 ├─ text is empty or whitespace-only -> toast error "Your clipboard is empty."
 └─ appendChunk(pile, text) ; render = renderPile(newPile, stack.separator)
    ; write render ; savePile(newPile) ; saveLastOutput(render)
    ; saveLastOutputKind('stack') ; toast success "Stacked. N piece(s)."
```

`handleActionPaste` (the `paste`-shaped path, fed by a native `paste` event
landing on either action control instead of a read — iPhone in practice)
dispatches on which control the paste landed on (its `data-action`), then
runs the matching decision below — the exact same `decideWCopy`/`decideICopy`
steps `runWCopy`/`runICopy` use, just fed by a paste instead of a read:

```
paste event on the wcopy control
 ├─ preventDefault() — the control must never visibly hold the pasted text
 ├─ readFromPasteEvent fails                 -> toast error "Your clipboard is empty."
 ├─ clipboard piece disabled                 -> text = assemble(stack, '') ; write ; toast success (growth guard never runs)
 ├─ clipboard piece enabled, shouldSkip(text, lastOutput) AND
 │  lastOutputKind === 'wrap'                 -> toast info "Already wrapped. Copy something new first."
 ├─ assemble -> EMPTY_STACK/EMPTY_CLIPBOARD   -> toast error, same mapping as runWCopy
 └─ writeText(result) ; saveLastOutput(result) ; saveLastOutputKind('wrap')
    ; clear + blur the control ; toast success "Wrapped with copy"

paste event on the icopy control (W6)
 ├─ preventDefault()
 ├─ readFromPasteEvent fails           -> toast error "Your clipboard is empty."
 ├─ shouldSkip(text, lastOutput) AND
 │  lastOutputKind === 'stack'          -> toast info "Already stacked. Copy something new first."
 ├─ text is empty or whitespace-only   -> toast error "Your clipboard is empty."
 └─ appendChunk(pile, text) ; render = renderPile(newPile, stack.separator)
    ; writeText(render) ; savePile(newPile) ; saveLastOutput(render)
    ; saveLastOutputKind('stack') ; clear + blur the control ; toast success "Stacked. N piece(s)."
```

`saveLastOutput`/`saveLastOutputKind` run after the write resolves, and are
shared across both strategies and both buttons — the growth guard tracks the
app's last output and its kind regardless of which strategy or which button
produced it. On desktop (`read` strategy) each path is still one awaited
clipboard read, one awaited clipboard write, and one toast, exactly as
before W5; nothing about that path changed except what happens on a
denied/unsupported read.

The guard's kind check is what makes the two buttons compose, on either
strategy: wrapping a pile i/copy just wrote is allowed even though the
clipboard text equals `lastOutput` (its kind is `'stack'`, not `'wrap'`),
and likewise stacking a freshly-wrapped block is allowed (kind `'wrap'`,
not `'stack'`). Pressing w/copy on a pile never clears the pile — only the
pile strip's explicit Clear control does (§7.1).

---

## 7. UI structure and styling

### 7.1 DOM skeleton (`app/index.html`)

```html
<header class="wc-topbar">
  <button class="wc-iconbtn" data-action="open-panel" aria-label="Stacks">☰</button>
  <h1 class="wc-stackname" data-role="stack-name">Claude</h1>
  <button class="wc-iconbtn" data-action="open-settings" aria-label="Settings">⚙</button>
</header>

<main class="wc-main">
  <ol class="wc-stack" data-role="stack"> <!-- piece cards, see 7.2 --> </ol>
  <button class="wc-add" data-action="add-piece">Add piece</button>
</main>

<div class="wc-actionbar">
  <!-- W6: visible only while the pile is non-empty -->
  <div class="wc-pilestrip" data-role="pile-strip" hidden>
    <button data-role="pile-toggle" data-action="toggle-pile-preview" aria-expanded="false">
      <span data-role="pile-count">3 pieces stacked</span>
    </button>
    <button data-action="clear-pile">Clear</button>
  </div>
  <div class="wc-pilepreview" data-role="pile-preview" hidden>
    <ol data-role="pile-preview-list"> <!-- first line of each chunk --> </ol>
  </div>
  <div class="wc-actionrow">
    <div class="wc-action" data-action="wcopy" data-role="action-wcopy"
         role="button" tabindex="0" contenteditable="true" inputmode="none"
         enterkeyhint="done" autocapitalize="off" autocorrect="off"
         spellcheck="false" aria-label="w/copy">w/copy</div>
    <div class="wc-action wc-action--pile" data-action="icopy" data-role="action-icopy"
         role="button" tabindex="0" contenteditable="true" inputmode="none"
         enterkeyhint="done" autocapitalize="off" autocorrect="off"
         spellcheck="false" aria-label="i/copy">i/copy</div>
  </div>
  <p data-role="action-hint" hidden>If Paste doesn't pop up, try a long‑press.</p>
</div>

<aside class="wc-panel" data-role="panel" hidden> <!-- stack list --> </aside>
<dialog class="wc-settings" data-role="settings"></dialog>
<dialog class="wc-expand" data-role="expand"></dialog>
<dialog class="wc-paste" data-role="paste-fallback"></dialog>
<div class="wc-toast" data-role="toast" role="status" aria-live="polite" hidden></div>
```

Icons are inline SVG symbols in a hidden `<svg>` sprite in `index.html`, not
text glyphs; the glyphs above are placeholders.

**Both action controls are `contenteditable` paste targets, not `<button>`s
(W5, extended to i/copy in this merge).** Neither can read the clipboard
directly on every platform (§4.4), so each doubles as the surface a native
Paste lands on: `contenteditable="true"` makes that possible at all,
`inputmode="none"` keeps the software keyboard from appearing (verified
iOS 16+), and `role="button"`/`tabindex="0"` keep them in the tab order and
announced correctly despite not being real buttons. Their labels
(`main.js`'s `updateActionUI`) are plain text with no element children —
deliberately, so a stray paste can never orphan an element inside an
editable host — and `aria-label` is kept in sync with that text rather than
relying on the editable's own accessible-name computation. A single
`beforeinput` guard (delegated, not duplicated per control) rejects every
edit on both, so neither can ever become a real text field; every paste is
read straight from `event.clipboardData`, never allowed to actually land in
the element, and the control is cleared and blurred after handling it. See
`js/main.js`'s `handleActionPaste` and §6.

**The pile strip and preview (W6).** `[data-role="pile-strip"]` is hidden
whenever `pileState.chunks.length === 0` and shown otherwise; its toggle
button expands `[data-role="pile-preview"]` (an `aria-expanded` disclosure,
not a dialog) into a scrollable list of one line per chunk (its first line,
CSS-truncated), each numbered by position. Clear empties the pile
immediately and offers Undo, per the no-confirmation-dialogs rule (§ project
rules). `.wc-action--pile` (i/copy) is deliberately never the same visual
weight as `.wc-action` (w/copy): tonal fill (`--accent-soft`/`--accent`
instead of a solid `--accent` background), a smaller font size, and a
narrower share of `.wc-actionrow`'s flex space, so w/copy stays the single
dominant, saturated control. i/copy's own inner icon (present in the
original W6 design) was dropped when it became a paste target: a plain-text
label is what keeps a stray paste from ever orphaning an element inside an
editable host, matching w/copy.

### 7.2 Piece card

```html
<li class="wc-piece" data-id="pc_..." data-kind="header" data-enabled="true">
  <div class="wc-piece__bar">
    <label class="wc-switch"><input type="checkbox" checked aria-label="Enabled"></label>
    <button class="wc-piece__label" data-action="toggle-variants" aria-expanded="false">
      <span class="wc-kind">Header</span>
      <span class="wc-piece__variantname">Default</span>
    </button>
    <button class="wc-iconbtn" data-action="expand" aria-label="Fill screen"></button>
    <button class="wc-iconbtn" data-action="delete-piece" aria-label="Delete"></button>
    <button class="wc-handle" aria-label="Drag to reorder" tabindex="0"></button>
  </div>
  <textarea class="wc-piece__text" data-role="text" spellcheck="false"></textarea>
  <div class="wc-variants" hidden> <!-- variants.js renders here --> </div>
</li>
```

The clipboard piece renders the same bar (no variants button, no expand) and
a centred clipboard icon with the caption "Your clipboard goes here" in place
of the textarea.

### 7.3 Tokens (`tokens.css`)

- Colors as custom properties on `:root`, redefined under
  `@media (prefers-color-scheme: dark)` and overridden by
  `:root[data-theme="light"]` / `:root[data-theme="dark"]`.
- Neutral scale: `--bg`, `--surface`, `--surface-2`, `--border`, `--text`,
  `--text-muted`.
- Accent: `--accent`, `--accent-contrast`, `--accent-soft`, set on `:root`
  from `data-accent="green"` etc. Eight accents: green, orange, blue, purple,
  pink, teal, red, yellow. Each has light and dark values chosen for 4.5:1
  contrast of `--accent-contrast` on `--accent`.
- Kind colors: `--kind-header`, `--kind-footer`, `--kind-text`,
  `--kind-clipboard`, small and muted.
- Density on `:root[data-density="compact"]`: reduces `--space-*` and card
  padding, tightens line height.
- Type: system font stack only. `--font-ui`, `--font-mono` for the textarea
  is optional; default to the same UI font.
- Motion: `--dur-fast: 120ms`, `--dur: 200ms`, `--ease`. All zeroed under
  `prefers-reduced-motion`.

### 7.4 Settings dialog

Sections: Appearance (theme radio: System, Light, Dark; density radio:
Comfortable, Compact), Stacks (Share this stack: Copy link, Show QR;
Export all as JSON: Copy, Download; Import JSON: paste field or file picker),
About (version string, link to repo).

Import validates with `validateState` and, on error, lists every
`path: message` in a `<pre>` inside the dialog. On success it replaces the
state and toasts with Undo (the previous state is kept in memory for the undo
window).

### 7.5 Toast messages

**W5 removed two "Paste it here instead." rows and the "Tap w/copy again."
row below** — those states are no longer reachable. A denied or unsupported
read now demotes to `paste` strategy silently instead of toasting and
opening the paste-fallback sheet (§4.4), for both buttons; `NOT_FOCUSED` was
only ever produced by WebKit's transient-activation rules, and WebKit now
never attempts a read at all, so that code — if it were ever somehow
produced — falls back to the generic "Write failed" message below rather
than getting a row of its own. Everything else is unchanged.

| Situation | Tone | Message |
|---|---|---|
| Wrapped and written | success | Wrapped with copy |
| Clipboard equals last output | info | Already wrapped. Copy something new first. |
| Clipboard empty | error | Your clipboard is empty. |
| No enabled pieces | error | Nothing to copy. Enable a piece first. |
| Write failed | error | Couldn't write to the clipboard. Try again. |
| Piece deleted | info | Piece deleted. (Undo) |
| Variant deleted | info | Variant deleted. (Undo) |
| Stack deleted | info | Stack deleted. (Undo) |
| Imported | success | Imported "Name". (Undo) |
| Saved data unreadable | error | Saved data couldn't be read. Started fresh. |
| Stacked and written (W6) | success | Stacked. *N* piece(s). (e.g. "Stacked. 1 piece." / "Stacked. 3 pieces.") |
| Clipboard equals last stacked output (W6) | info | Already stacked. Copy something new first. |
| Pile cleared (W6) | info | Pile cleared. (Undo) |

i/copy reuses every other row above verbatim for the outcomes it shares with
w/copy: clipboard empty, write failed. Neither button ever toasts as a
result of a denied or unsupported read on any strategy — see §4.4.

---

## 8. Onboarding content

`createOnboardingStack()` returns a stack named "My first stack", accent
green, with:

- Header (variant "Default"):
  "Hi, this is w/copy. Everything below this line was on your clipboard when
  you pressed the button."
- Clipboard piece, enabled.
- Footer (variant "Default"):
  "Everything above this line was your clipboard. Edit these pieces, add your
  own, and press w/copy again."

Final copy may be adjusted by the product owner; keep it to two short
sentences each.

---

## 9. Clipboard probe page (temporary)

`src/probe.html` with `src/js/probe.js`: a page of buttons, each running one
clipboard experiment and printing the outcome on screen, so the product owner
can test on a real iPhone and on desktop Chrome and report back:

1. `writeText` alone.
2. `readText` alone.
3. `await readText` then `await writeText`.
4. `writeDeferred(readText().then(t => t + ' [wrapped]'))`.
5. Paste-event path: focus a textarea, on `paste` write transformed text.
6. Same as 3 and 4 but inside an installed PWA (the user installs and repeats).

Results are also collected into a text block with a "Copy results" button so
they can be pasted into chat. The probe is removed before launch.

---

## 10. PWA and offline

- `manifest.webmanifest`: name "w/copy", short_name "w/copy", start_url "/app/",
  scope "/", id "/app/", display "standalone", theme_color and background_color from the neutral
  palette, icons 192 and 512 plus a maskable 512.
- `<link rel="apple-touch-icon">` 180px PNG, `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style` default.
- `sw.js`: registered from `/sw.js` with scope `/`. Precache list of every
  site file except `probe.*`, including `/app/` and `/`.
  Cache name includes `VERSION`. Install caches all; activate deletes other
  caches and claims clients; fetch is cache-first for precached URLs and
  network-only otherwise. `VERSION` is a hand-maintained string in `sw.js`
  of the form `YYYY-MM-DD.N`. **Every push to `main` that changes any site
  file must bump it**, or installed clients keep serving the old cache. The
  bump is part of the release commit, not a separate one.
- `main.js` registers the service worker after first render, listens for an
  updated worker, and toasts "Update ready" with a Reload action.

---

## 11. Deploy

GitHub Pages, source "Deploy from a branch", branch `main`, folder `/`. No
GitHub Actions workflow of ours exists (D43). GitHub's built-in Pages
publisher runs on each push to `main` and serves the repository root as-is
because of `.nojekyll`. Release procedure: run `npm test`, bump `VERSION` in
`sw.js`, commit, push the feature branch, fast-forward `main`. Custom domain
and DNS steps are in `docs/setup/github-pages-dns.md`.

---

## 12. Content Security Policy

In `index.html`:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
connect-src 'self'; manifest-src 'self'; worker-src 'self';
base-uri 'none'; form-action 'none'; object-src 'none'
```

QR rendering must therefore draw to a `<canvas>` or build inline SVG, never
inject a `data:` script or remote image.

---

## 13. Testing

`npm test` runs `node --test tests/**/*.test.js` (a bare directory argument
does not discover files on Node 22). Required coverage:

- `schema.test.js`: defaults validate; every rule in §3 has a failing case
  with the expected path; migrate round-trips version 1.
- `merge.test.js`: ordering, disabled pieces, trailing-whitespace trim,
  leading kept, empty clipboard, disabled clipboard, empty stack, custom
  separator, `shouldSkip` exact match and null.
- `link.test.js`: encode/decode round-trip, base64url has no `+ / =`,
  invalid input throws with errors, fragment parsing.
- `store.test.js`: commit notifies, patch does not, saves coalesce (with an
  injected `save` function).
- `pile.test.js` (W6): `appendChunk` ignores empty/whitespace-only text
  without mutating its input, keeps meaningful whitespace verbatim;
  `renderPile` for zero/one/many chunks, custom separator, per-chunk
  trailing-trim with leading kept; `loadPile`/`savePile`/`clearPile`
  round-trip, and behave under a missing or throwing `localStorage` the
  same way `store.test.js` verifies for `wcopy.state`.

UI behaviour is verified against `docs/tasks/manual-checklist.md` until a
browser test strategy is chosen.
