// ui/drag.js — pointer-driven drag-to-reorder for the piece list (spec §4.7).
//
// `enableReorder(listEl, { handleSelector, itemSelector, onReorder })` wires
// Pointer Events on `listEl` (the one delegated-listener exception the app
// makes for a non-`main.js` module — see CLAUDE.md) plus a keyboard
// alternative. It is safe to call on every structural render: a `listEl` is
// only ever bound once (tracked in `registry`), and later calls just refresh
// the callbacks/selectors in place, so `stack-view.js` can call it
// unconditionally after every rebuild without double-attaching listeners.
//
// The whole drag is done with `transform` only, on the compositor:
//   - The lifted card gets `.wc-piece--dragging` and follows the pointer via
//     a `--wc-drag-y` custom property (a CSSOM property write through
//     `style.setProperty`, not a stylesheet or a `style` attribute — the
//     page's CSP `style-src` does not govern it, verified against a
//     `securitypolicyviolation` listener during manual testing).
//   - Every other card keeps its layout box exactly where it is; crossing a
//     sibling's midpoint just toggles `.wc-piece--shift-up` /
//     `--shift-down`, which (per the note in the task brief) shifts it by
//     the *dragged* card's own height/gap — measured once at drag start into
//     `--wc-shift-h` on the list — rather than its own. `.wc-piece` already
//     transitions `transform` (app.css), so the shift animates for free, and
//     already goes instant under `prefers-reduced-motion` because
//     `tokens.css` zeroes `--dur` there.
//   - On drop, every class/custom-property this module added is stripped
//     synchronously, in the same tick as the `onReorder` call that triggers
//     the structural re-render — nothing is ever painted in between, so the
//     transformed drag position and the freshly-rendered rest position are
//     never visibly different frames.

const registry = new WeakMap();

const AUTOSCROLL_EDGE = 72; // px from the viewport edge that starts scrolling
const AUTOSCROLL_MAX_SPEED = 18; // px per animation frame at the very edge

function ensureLiveRegion() {
  let el = document.querySelector('.wc-visually-hidden[data-role="reorder-live"]');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'wc-visually-hidden';
  el.dataset.role = 'reorder-live';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  return el;
}

function announceMove(itemEl, toIndex, total) {
  const label = (itemEl.querySelector('.wc-kind') || {}).textContent || 'Piece';
  const el = ensureLiveRegion();
  el.textContent = `${label} moved to position ${toIndex + 1} of ${total}.`;
}

function readGap(listEl) {
  const style = getComputedStyle(listEl);
  const raw = style.rowGap || style.gap || '0';
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/** Adds/removes the two shift classes on every non-dragged item per the current drop index. */
function applyShiftClasses(drag) {
  for (const other of drag.others) {
    const wasBefore = other.originalIndex < drag.fromIndex;
    const isBefore = other.originalIndex < drag.currentTo;
    other.el.classList.remove('wc-piece--shift-up', 'wc-piece--shift-down');
    if (wasBefore && !isBefore) {
      other.el.classList.add('wc-piece--shift-down');
    } else if (!wasBefore && isBefore) {
      other.el.classList.add('wc-piece--shift-up');
    }
  }
}

function computeDropIndex(drag, draggedCenter) {
  let index = 0;
  for (const other of drag.others) {
    if (draggedCenter > other.top + other.height / 2) index += 1;
  }
  return index;
}

function updateDragPosition(drag, pageY) {
  const dy = pageY - drag.startPageY;
  drag.itemEl.style.setProperty('--wc-drag-y', `${dy}px`);
  const draggedCenter = drag.draggedTop + drag.draggedHeight / 2 + dy;
  const nextIndex = computeDropIndex(drag, draggedCenter);
  if (nextIndex !== drag.currentTo) {
    drag.currentTo = nextIndex;
    applyShiftClasses(drag);
  }
}

function stepAutoScroll(entry) {
  const drag = entry.drag;
  if (!drag) return;
  if (drag.scrollSpeed !== 0) {
    window.scrollBy(0, drag.scrollSpeed);
    // Reading the fresh scroll position right after causing it ourselves is
    // the one read this module accepts as part of the auto-scroll cost the
    // task brief exempts from the "no layout" requirement.
    drag.scrollY = window.scrollY;
    updateDragPosition(drag, drag.lastClientY + drag.scrollY);
    drag.scrollRaf = requestAnimationFrame(() => stepAutoScroll(entry));
  } else {
    drag.scrollRaf = null;
  }
}

function updateAutoScroll(entry, clientY) {
  const drag = entry.drag;
  // Cached at drag start rather than read here as `window.innerHeight` —
  // see the comment on `beginDrag`'s geometry reads.
  const vh = drag.viewportHeight;
  let speed = 0;
  if (clientY < AUTOSCROLL_EDGE) {
    speed = -AUTOSCROLL_MAX_SPEED * (1 - clientY / AUTOSCROLL_EDGE);
  } else if (clientY > vh - AUTOSCROLL_EDGE) {
    speed = AUTOSCROLL_MAX_SPEED * (1 - (vh - clientY) / AUTOSCROLL_EDGE);
  }
  drag.scrollSpeed = speed;
  if (speed !== 0 && drag.scrollRaf === null) {
    drag.scrollRaf = requestAnimationFrame(() => stepAutoScroll(entry));
  }
}

function cleanupDrag(drag) {
  if (drag.scrollRaf !== null) cancelAnimationFrame(drag.scrollRaf);
  window.removeEventListener('scroll', drag.onScroll);
  try {
    drag.handle.releasePointerCapture(drag.pointerId);
  } catch {
    // Already released (e.g. the pointer left the window) — harmless.
  }
  drag.itemEl.classList.remove('wc-piece--dragging');
  drag.itemEl.style.removeProperty('--wc-drag-y');
  for (const other of drag.others) {
    other.el.classList.remove('wc-piece--shift-up', 'wc-piece--shift-down');
  }
  drag.listEl.style.removeProperty('--wc-shift-h');
}

function beginDrag(entry, listEl, handle, itemEl, event) {
  const allItems = Array.from(listEl.querySelectorAll(entry.options.itemSelector));
  const fromIndex = allItems.indexOf(itemEl);
  if (fromIndex === -1) return;

  // Every geometry read for this drag happens here, up front, before any of
  // the writes below — a one-time layout cost to start the lift, not a
  // per-frame one. `scrollY` and `innerHeight` are cached on the drag state
  // rather than re-read on every pointermove for the same reason (see
  // `updateAutoScroll` and the `scroll` listener below).
  const scrollY = window.scrollY;
  const viewportHeight = window.innerHeight;
  const rects = allItems.map((el) => {
    const rect = el.getBoundingClientRect();
    return { el, top: rect.top + scrollY, height: rect.height };
  });
  const draggedRect = rects[fromIndex];
  const shiftHeight = draggedRect.height + readGap(listEl);
  const others = rects
    .map((r, index) => ({ ...r, originalIndex: index }))
    .filter((_, index) => index !== fromIndex);

  listEl.style.setProperty('--wc-shift-h', `${shiftHeight}px`);
  handle.setPointerCapture(event.pointerId);
  itemEl.classList.add('wc-piece--dragging');

  const drag = {
    listEl,
    handle,
    itemEl,
    pointerId: event.pointerId,
    fromIndex,
    currentTo: fromIndex,
    startPageY: event.clientY + scrollY,
    draggedTop: draggedRect.top,
    draggedHeight: draggedRect.height,
    others,
    lastClientY: event.clientY,
    scrollSpeed: 0,
    scrollRaf: null,
    viewportHeight,
    scrollY,
    onScroll: null,
  };
  // Kept fresh by an actual `scroll` event rather than read from
  // `window.scrollY` on every pointermove, which would force a synchronous
  // layout flush of the `--wc-drag-y` write that same move just made (the
  // classic write-then-read layout-thrashing pattern) — confirmed with a
  // trace under disabled-by-default-devtools.timeline.invalidationTracking
  // during manual verification.
  drag.onScroll = () => {
    drag.scrollY = window.scrollY;
  };
  window.addEventListener('scroll', drag.onScroll, { passive: true });

  entry.drag = drag;
}

function bindListEl(listEl, entry) {
  listEl.addEventListener('pointerdown', (event) => {
    if (entry.drag) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const handle = event.target.closest(entry.options.handleSelector);
    if (!handle) return;
    const itemEl = handle.closest(entry.options.itemSelector);
    if (!itemEl) return;
    event.preventDefault();
    beginDrag(entry, listEl, handle, itemEl, event);
  });

  listEl.addEventListener('pointermove', (event) => {
    const drag = entry.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.lastClientY = event.clientY;
    updateDragPosition(drag, event.clientY + drag.scrollY);
    updateAutoScroll(entry, event.clientY);
  });

  function endDrag(event, commit) {
    const drag = entry.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { fromIndex, currentTo } = drag;
    cleanupDrag(drag);
    entry.drag = null;
    if (commit && currentTo !== fromIndex) {
      entry.options.onReorder(fromIndex, currentTo);
    }
  }

  listEl.addEventListener('pointerup', (event) => endDrag(event, true));
  listEl.addEventListener('pointercancel', (event) => endDrag(event, false));
  // Defensive: if capture is ever revoked without an up/cancel (e.g. the
  // system interrupts it), don't leave the card stuck mid-drag.
  listEl.addEventListener('lostpointercapture', (event) => endDrag(event, false));

  listEl.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const handle = event.target.closest(entry.options.handleSelector);
    if (!handle) return;
    const itemEl = handle.closest(entry.options.itemSelector);
    if (!itemEl) return;

    const allItems = Array.from(listEl.querySelectorAll(entry.options.itemSelector));
    const fromIndex = allItems.indexOf(itemEl);
    if (fromIndex === -1) return;
    const toIndex = event.key === 'ArrowUp' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= allItems.length) return;

    event.preventDefault();
    const pieceId = itemEl.dataset.id;
    entry.options.onReorder(fromIndex, toIndex);

    // `onReorder` runs synchronously through `store.commit`'s subscribers,
    // so the list has already been rebuilt by the time this line runs.
    const newItemEl = pieceId
      ? listEl.querySelector(`[data-id="${CSS.escape(pieceId)}"]`)
      : null;
    const newHandle = newItemEl && newItemEl.querySelector(entry.options.handleSelector);
    if (newHandle) {
      newHandle.focus();
      announceMove(newItemEl, toIndex, allItems.length);
    }
  });
}

/**
 * Enables drag-to-reorder (pointer + keyboard) on `listEl`. Safe to call
 * after every structural render: the first call binds the listeners, every
 * later call for the same `listEl` just updates `handleSelector`,
 * `itemSelector`, and `onReorder` in place.
 * @param {Element} listEl
 * @param {{handleSelector: string, itemSelector: string, onReorder: (fromIndex: number, toIndex: number) => void}} options
 */
export function enableReorder(listEl, options) {
  if (!listEl) return;
  const existing = registry.get(listEl);
  if (existing) {
    Object.assign(existing.options, options);
    return;
  }
  const entry = { options: { ...options }, drag: null };
  registry.set(listEl, entry);
  bindListEl(listEl, entry);
}
