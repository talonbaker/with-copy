// ui/undo.js — Gmail-style delete/undo, built on the single toast slot.
//
// There is exactly one undo opportunity at a time: showToast already allows
// only one visible toast, so calling `undoable` again before the previous
// one's window elapses replaces it outright — the earlier action's undo
// button is gone the moment the new toast appears, and that earlier action
// is simply left applied. Callers must apply the mutation immediately and
// pass `undo` as the way to reverse it; nothing here defers the mutation
// itself.

import { showToast } from './toast.js';

/**
 * @param {{message: string, undo: () => void, duration?: number}} opts
 * @returns {{dismiss: () => void}}
 */
export function undoable({ message, undo, duration = 6000 } = {}) {
  return showToast({
    message,
    tone: 'info',
    duration,
    action: {
      label: 'Undo',
      onClick: () => {
        if (typeof undo === 'function') undo();
      },
    },
  });
}
