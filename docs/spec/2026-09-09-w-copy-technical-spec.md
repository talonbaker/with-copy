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
/
├── CLAUDE.md                     project rules for agents
├── README.md
├── src/                          everything under here is deployed as-is
│   ├── index.html                root: minimal forwarding page to /app/ until the landing page exists (D41)
│   ├── app/
│   │   └── index.html            the app (single screen), served at /app/
│   ├── probe.html                temporary clipboard probe page (see §9)
│   ├── manifest.webmanifest
│   ├── sw.js                     service worker
│   ├── CNAME                     withcopy.app
│   ├── icons/                    icon.svg, icon-192.png, icon-512.png, apple-touch-icon.png, maskable-512.png
│   ├── css/
│   │   ├── tokens.css            design tokens: color, space, type, radius, motion; light/dark; density
│   │   └── app.css               layout and components
│   └── js/
│       ├── main.js               bootstrap: load state, render, wire events
│       ├── store.js              state container + persistence
│       ├── schema.js             ids, defaults, validation, migration
│       ├── merge.js              pure assembly of the output text
│       ├── clipboard.js          read/write adapter with WebKit strategy
│       ├── link.js               stack <-> URL fragment codec
│       ├── qr.js                 QR encoder (last task, optional)
│       └── ui/
│           ├── toast.js
│           ├── undo.js
│           ├── stack-view.js     renders the list of piece cards
│           ├── piece-card.js     one card: label, text, variants, controls
│           ├── variants.js       variant list behaviour
│           ├── drag.js           pointer-based reorder with a handle
│           ├── expand.js         fill-screen editor dialog
│           ├── side-panel.js     stack list
│           └── settings.js       settings dialog, export/import, share link
├── tests/                        node:test files, run with `npm test` (no deps)
├── package.json                  scripts only, no dependencies
├── .github/workflows/pages.yml   deploy src/ to GitHub Pages
└── docs/
```

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

Two other localStorage keys, never part of export:

| Key | Value |
|---|---|
| `wcopy.state` | the JSON above |
| `wcopy.lastOutput` | the exact string the app last wrote to the clipboard, for the growth guard |

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
```

Platform strategy, to be confirmed by the probe page (§9):

- **Desktop Chrome.** `readText()` prompts once per origin and the grant
  persists. `await readText()` then `await writeText()` works because Chrome's
  transient activation outlives the await.
- **iPhone (WebKit).** `readText()` inside a tap handler shows a "Paste"
  callout the user must tap. After an `await`, the tap's activation may be
  gone, so a plain `writeText` can be rejected. WebKit accepts a write that is
  *called synchronously in the gesture* with data supplied later:
  `navigator.clipboard.write([new ClipboardItem({ 'text/plain': promise })])`.
  `writeDeferred` implements that. The action handler therefore calls
  `writeDeferred(readText().then(assembleAndGuard))` synchronously.
- **Paste fallback.** If reading fails with `DENIED` or `UNSUPPORTED`, the UI
  shows a paste target: a focused, empty `<textarea>` in a sheet titled "Paste
  here". On its `paste` event, `readFromPasteEvent` yields the text and the
  handler writes the result *inside that same event*, which is a user gesture.
  This path needs no clipboard-read permission at all.

Every failure maps to a `ClipboardError` code, and the UI maps every code to a
toast message (§7.5). Nothing is silent.

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

## 6. Action path (the w/copy press)

```
press
 ├─ stack has no enabled pieces      -> toast error "Nothing to copy. Enable a piece first."
 ├─ clipboard piece disabled         -> text = assemble(stack, '') ; write ; toast success
 └─ clipboard piece enabled
      ├─ read clipboard (platform strategy §4.4)
      ├─ read failed                  -> toast per error code; DENIED/UNSUPPORTED opens paste fallback
      ├─ shouldSkip(text, lastOutput) -> toast info "Already wrapped. Copy something new first."
      ├─ assemble -> EMPTY_CLIPBOARD  -> toast error "Your clipboard is empty."
      └─ write result ; saveLastOutput(result) ; toast success "Wrapped with copy"
```

`saveLastOutput` runs after the write resolves. On desktop the whole path is
two awaited clipboard calls and one toast.

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
  <button class="wc-action" data-action="wcopy">w/copy</button>
</div>

<aside class="wc-panel" data-role="panel" hidden> <!-- stack list --> </aside>
<dialog class="wc-settings" data-role="settings"></dialog>
<dialog class="wc-expand" data-role="expand"></dialog>
<dialog class="wc-paste" data-role="paste-fallback"></dialog>
<div class="wc-toast" data-role="toast" role="status" aria-live="polite" hidden></div>
```

Icons are inline SVG symbols in a hidden `<svg>` sprite in `index.html`, not
text glyphs; the glyphs above are placeholders.

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

| Situation | Tone | Message |
|---|---|---|
| Wrapped and written | success | Wrapped with copy |
| Clipboard equals last output | info | Already wrapped. Copy something new first. |
| Clipboard empty | error | Your clipboard is empty. |
| No enabled pieces | error | Nothing to copy. Enable a piece first. |
| Read denied | error | Clipboard access was blocked. Paste it here instead. (opens paste sheet) |
| Unsupported | error | This browser can't read the clipboard. Paste it here instead. (opens paste sheet) |
| Not focused | error | Tap w/copy again. |
| Write failed | error | Couldn't write to the clipboard. Try again. |
| Piece deleted | info | Piece deleted. (Undo) |
| Stack deleted | info | Stack deleted. (Undo) |
| Imported | success | Imported "Name". (Undo) |
| Saved data unreadable | error | Saved data couldn't be read. Started fresh. |

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
  file under `src/` except `probe.*`, including `/app/` and `/`.
  Cache name includes `VERSION`. Install caches all; activate deletes other
  caches and claims clients; fetch is cache-first for precached URLs and
  network-only otherwise. `VERSION` is the literal `'dev'` in source and the
  deploy workflow replaces it with the commit SHA before upload. That is a
  string substitution, not a build.
- `main.js` registers the service worker after first render, listens for an
  updated worker, and toasts "Update ready" with a Reload action.

---

## 11. Deploy

`.github/workflows/pages.yml`: on push to `main` and on manual dispatch. Steps:
checkout, run `npm test` (no install step; there are no dependencies), stamp
`VERSION` in `src/sw.js` with the SHA using `sed`, upload `src/` as the Pages
artifact, deploy. Permissions `pages: write`, `contents: read`,
`id-token: write`. The product owner enables Pages with source "GitHub
Actions" and sets the custom domain; DNS steps are in
`docs/setup/github-pages-dns.md`.

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

UI behaviour is verified against `docs/tasks/manual-checklist.md` until a
browser test strategy is chosen.
