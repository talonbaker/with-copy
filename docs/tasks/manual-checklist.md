# Manual checklist

Walk the rows relevant to your brief in Chrome before you report. Serve with
`python3 -m http.server -d src 8000` and open `http://localhost:8000/app/`. For the
narrow layout use DevTools device emulation at 390×844 (iPhone). Agents can
use Playwright's bundled Chromium (`/opt/pw-browsers/chromium`) for
screenshots; that is a dev-side tool, not a dependency, and nothing from it
is committed.

## Shell and theme
- [ ] Page loads with no console errors and no CSP violations.
- [ ] Light and dark follow the OS setting; the Settings override wins over it in both directions.
- [ ] Compact density visibly tightens spacing; comfortable restores it.
- [ ] Accent color changes across the top bar, switches, and action button when the stack changes.
- [ ] The w/copy button is the single most colorful element on screen.
- [ ] Narrow (390px) and wide (1280px) layouts both read as one vertical stack of cards.

## Pieces
- [ ] Typing in a card never loses focus or cursor position.
- [ ] Textarea grows with content.
- [ ] Toggling a piece off dims it and excludes it from the output.
- [ ] Tapping the label reveals the variants list; tapping again hides it.
- [ ] Selecting a variant makes it active and updates the card text and label.
- [ ] Adding a variant, renaming a variant, deleting a variant (with Undo) all work.
- [ ] Fill-screen editor opens with the same text, edits round-trip, closes with Escape and the close button.
- [ ] Deleting a piece removes it immediately and Undo restores it in the same position.
- [ ] Add piece appends a new piece of the chosen kind and focuses its text.

## Action path
- [ ] With text on the clipboard, pressing w/copy writes header + clipboard + footer and toasts "Wrapped with copy".
- [ ] Pressing again without copying anything new toasts "Already wrapped" and the clipboard is unchanged.
- [ ] With an empty clipboard, pressing toasts the empty-clipboard error.
- [ ] With the clipboard piece disabled, pressing writes header + footer without reading the clipboard (no permission prompt on a fresh profile).
- [ ] With every piece disabled, pressing toasts the nothing-to-copy error.
- [ ] Denying the read permission shows the paste sheet; pasting into it produces the wrapped output on the clipboard.

## Stacks
- [ ] Panel opens from the left, lists stacks, marks the active one, closes on backdrop tap and Escape.
- [ ] New stack is created from the template, becomes active, and gets a distinct accent.
- [ ] Renaming a stack updates the top bar.
- [ ] Deleting a stack is immediate with Undo; deleting the last stack is not possible.
- [ ] Reload reopens the last-used stack.

## Settings, export, import
- [ ] Export copies valid JSON; Download saves a `.json` file.
- [ ] Importing that JSON restores the same state; toast offers Undo.
- [ ] Importing malformed JSON lists path and message for every error and changes nothing.

## Reorder
- [ ] Dragging by the handle reorders on mouse and on touch emulation; other cards animate into place.
- [ ] Handle focused + Arrow Up/Down reorders with the keyboard.
- [ ] Order persists across reload.

## Share link
- [ ] Copy link produces a URL with `#s=`; opening it in a fresh profile imports the stack with a new id and clears the fragment.
- [ ] QR renders and scans to the same URL.

## PWA and offline
- [ ] Manifest and icons validate in DevTools → Application.
- [ ] After first load, going offline and reloading still opens the app.
- [ ] A new deploy triggers the "Update ready" toast; Reload picks it up.
