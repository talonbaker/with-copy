# Manual checklist

Walk the rows relevant to your brief in Chrome before you report. Serve with
`python3 -m http.server 8000` from the repository root and open
`http://localhost:8000/app/`. For the
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
- [ ] Denying the read permission demotes silently to paste strategy — no error toast, no dialog — and relabels both w/copy and i/copy to their "Paste to..." labels.

## i/copy and the pile (W6)
- [ ] With text on the clipboard, pressing i/copy appends it to the pile, writes the joined pile to the clipboard, updates the pile strip's count, and toasts "Stacked. N piece(s)."
- [ ] Pressing i/copy again without copying anything new toasts "Already stacked" and the pile is unchanged.
- [ ] With an empty clipboard, pressing i/copy toasts the empty-clipboard error and the pile is unchanged.
- [ ] Copy, i/copy, copy, i/copy, then w/copy: w/copy wraps the two-piece pile (the growth guard does not mistake the pile's last output for its own last wrap), and pressing w/copy never clears the pile.
- [ ] The pile preview opens on tapping the strip and lists one truncated line per chunk, in order.
- [ ] Clear empties the pile immediately (strip disappears) with Undo restoring it.

## Paste strategy (both buttons)
- [ ] On a device/profile demoted to paste strategy (or with clipboard-read denied), tapping w/copy focuses the control without writing anything; a real paste into it produces the wrapped output and toasts "Wrapped with copy".
- [ ] Same device, tapping i/copy focuses the control; a real paste into it appends to the pile, updates the pile strip, and toasts "Stacked. N piece(s)."
- [ ] Neither control ever shows a native keyboard (inputmode="none"), retains a caret, or keeps any typed/dropped/IME text — both are cleared and blurred after every paste, success or failure.
- [ ] Keyboard-only: Tab to each control, Enter/Space activates it in read strategy; in paste strategy, Enter/Space focuses it and a paste keystroke (Ctrl+V) completes the action.
- [ ] The full journey — copy, stack (i/copy), copy, stack (i/copy), then wrap (w/copy) — works entirely through real pastes in paste strategy, with the same outcome as the read-strategy version above.
- [ ] With the active stack's clipboard piece disabled, w/copy shows its plain "w/copy" label even in paste strategy (it never needs a paste); i/copy still shows "Paste to pile" regardless of that toggle.

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
