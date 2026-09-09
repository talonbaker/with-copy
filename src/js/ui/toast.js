// ui/toast.js — the single [data-role="toast"] element, per spec §4.6.
//
// One toast is visible at a time. Position (top under 640px, bottom above)
// is pure CSS (see app.css); this module only ever toggles classes and
// text content, never inline layout. No innerHTML is used anywhere here —
// message text may be caller-supplied and must never be parsed as markup.

const TONES = ['success', 'error', 'info'];

let toastEl = null;
let messageEl = null;
let actionEl = null;
let closeEl = null;

let generation = 0;
let autoHideTimer = null;
let removeTimer = null;

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function buildCloseIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'wc-icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#icon-close');
  svg.appendChild(use);
  return svg;
}

function ensureEl() {
  if (toastEl) return toastEl;
  const el = document.querySelector('[data-role="toast"]');
  if (!el) return null;

  const body = document.createElement('div');
  body.className = 'wc-toast__body';

  messageEl = document.createElement('span');
  messageEl.className = 'wc-toast__message';

  actionEl = document.createElement('button');
  actionEl.type = 'button';
  actionEl.className = 'wc-toast__action';
  actionEl.hidden = true;

  closeEl = document.createElement('button');
  closeEl.type = 'button';
  closeEl.className = 'wc-toast__close';
  closeEl.setAttribute('aria-label', 'Dismiss');
  closeEl.appendChild(buildCloseIcon());
  closeEl.addEventListener('click', () => hide(generation));

  body.append(messageEl, actionEl, closeEl);
  el.appendChild(body);
  toastEl = el;
  return toastEl;
}

function hide(id) {
  if (id !== generation) return; // a newer toast has already replaced this one
  const el = toastEl;
  if (!el) return;
  clearTimeout(autoHideTimer);
  clearTimeout(removeTimer);
  el.classList.remove('wc-toast--visible');
  const delay = prefersReducedMotion() ? 0 : 220;
  removeTimer = setTimeout(() => {
    if (id === generation) el.hidden = true;
  }, delay);
}

/**
 * Show a toast, replacing whichever one is currently visible.
 * @param {{message: string, tone?: 'success'|'error'|'info', action?: {label?: string, onClick: () => void}, duration?: number}} opts
 * @returns {{dismiss: () => void}}
 */
export function showToast({ message = '', tone = 'info', action = null, duration = 4000 } = {}) {
  const el = ensureEl();
  if (!el) return { dismiss() {} };

  generation += 1;
  const id = generation;
  clearTimeout(autoHideTimer);
  clearTimeout(removeTimer);

  el.hidden = false;
  for (const t of TONES) el.classList.remove(`wc-toast--${t}`);
  el.classList.add(`wc-toast--${TONES.includes(tone) ? tone : 'info'}`);
  messageEl.textContent = message;

  if (action && typeof action.onClick === 'function') {
    actionEl.textContent = action.label || 'Undo';
    actionEl.hidden = false;
    actionEl.onclick = () => {
      hide(id);
      action.onClick();
    };
  } else {
    actionEl.hidden = true;
    actionEl.onclick = null;
  }

  // Restart the enter transition even if a toast is already on screen.
  el.classList.remove('wc-toast--visible');
  void el.offsetWidth; // force reflow so the class re-triggers the transition
  requestAnimationFrame(() => {
    if (id === generation) el.classList.add('wc-toast--visible');
  });

  if (duration > 0) {
    autoHideTimer = setTimeout(() => hide(id), duration);
  }

  return { dismiss: () => hide(id) };
}
