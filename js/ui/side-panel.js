// ui/side-panel.js — the stacks list inside the left slide-out panel, plus
// stack switching, creation, deletion, and the top bar's inline rename
// (spec §7.1, §7.2 design handoff §2, §4). See docs/tasks/w2b-stacks-and-settings.md.
//
// Rendering clones `tpl-stack-row` per stack, exactly like piece-card.js and
// variants.js clone their templates. `renderStackList` is called from
// main.js's root `render(state)` on every store commit (spec §5: "updates
// the header ... side panel, and settings"), so it always reflects the
// current stack list without needing its own subscribe.

import { createStack, ACCENTS } from '../schema.js';

/** Rebuilds the `<ul data-role="stack-list">` from `state.stacks`. */
export function renderStackList(state, ctx) {
  const listEl = document.querySelector('[data-role="stack-list"]');
  const tpl = document.getElementById('tpl-stack-row');
  if (!listEl || !tpl) return;

  listEl.textContent = '';
  const canDelete = state.stacks.length > 1;

  for (const stack of state.stacks) {
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.dataset.id = stack.id;
    row.dataset.accent = stack.accent;
    const isActive = stack.id === state.activeStackId;
    row.dataset.active = String(isActive);

    const nameEl = row.querySelector('[data-role="stack-row-name"]');
    if (nameEl) nameEl.textContent = stack.name;

    const deleteBtn = row.querySelector('[data-action="delete-stack"]');
    if (deleteBtn && !canDelete) deleteBtn.remove();

    listEl.appendChild(row);
  }
}

/** Row tap (or Enter/Space on it) → commit the new active stack. */
export function switchStack(stackId, ctx) {
  ctx.store.commit((state) => {
    if (state.stacks.some((s) => s.id === stackId)) {
      state.activeStackId = stackId;
    }
  });
}

/** The first accent (in §7.3 order) not already used by another stack, wrapping if all are taken. */
function nextUnusedAccent(stacks) {
  const used = new Set(stacks.map((s) => s.accent));
  const free = ACCENTS.find((a) => !used.has(a));
  if (free) return free;
  return ACCENTS[stacks.length % ACCENTS.length];
}

/**
 * "New stack" → commit a fresh header/clipboard/footer stack named "Untitled
 * stack" with the next unused accent, make it active. Returns the new
 * stack's id so the caller can focus its name for editing.
 */
export function createNewStack(ctx) {
  let newId = null;
  ctx.store.commit((state) => {
    const accent = nextUnusedAccent(state.stacks);
    const stack = createStack({ name: 'Untitled stack', accent });
    state.stacks.push(stack);
    state.activeStackId = stack.id;
    newId = stack.id;
  });
  return newId;
}

/**
 * Delete → commit removal (hidden in the UI when only one stack exists, but
 * guarded here too), reassigning `activeStackId` if the deleted stack was
 * active, then an undoable that reinserts at the same index and restores the
 * prior active id.
 */
export function deleteStack(stackId, ctx) {
  let removed = null;
  let removedIndex = -1;
  let priorActiveId = null;

  ctx.store.commit((state) => {
    if (state.stacks.length <= 1) return;
    const idx = state.stacks.findIndex((s) => s.id === stackId);
    if (idx === -1) return;
    removedIndex = idx;
    const wasActive = state.activeStackId === stackId;
    [removed] = state.stacks.splice(idx, 1);
    if (wasActive) {
      priorActiveId = stackId;
      const fallback = state.stacks[Math.min(idx, state.stacks.length - 1)];
      state.activeStackId = fallback.id;
    }
  });
  if (!removed) return;

  ctx.undoable({
    message: 'Stack deleted.',
    undo: () => {
      ctx.store.commit((state) => {
        const idx = Math.min(removedIndex, state.stacks.length);
        state.stacks.splice(idx, 0, removed);
        if (priorActiveId) state.activeStackId = priorActiveId;
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Top bar inline rename (click the stack name to edit it, Enter/blur to
// commit) — same swap-a-span-for-an-input pattern as variants.js's
// beginRenameVariant/commitRenameVariant/cancelRenameVariant, except the top
// bar title is never rebuilt wholesale by a structural render (only its text
// content is set), so the input has to be cleaned up explicitly here rather
// than being discarded by a re-render.
// ---------------------------------------------------------------------------

function stackNameHost() {
  return document.querySelector('.wc-stackname');
}

/** Click (or Enter/Space) on the top bar title → swap it for an editable input. */
export function beginRenameStackName() {
  const host = stackNameHost();
  if (!host || host.querySelector('[data-role="stack-name-input"]')) return;
  const span = host.querySelector('[data-role="stack-name"]');
  if (!span) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'wc-stackname__input';
  input.dataset.role = 'stack-name-input';
  input.value = span.textContent;
  input.setAttribute('aria-label', 'Stack name');

  span.hidden = true;
  host.classList.add('wc-stackname--renaming');
  span.after(input);
  input.focus();
  input.select();
}

function cleanupRenameStackName(input) {
  const host = input.closest('.wc-stackname');
  const span = host && host.querySelector('[data-role="stack-name"]');
  input.remove();
  if (span) span.hidden = false;
  if (host) host.classList.remove('wc-stackname--renaming');
}

/** Enter or blur → commit the input's value as the active stack's new name. */
export function commitRenameStackName(input, ctx) {
  const name = input.value.trim() || 'Untitled stack';
  ctx.store.commit((state) => {
    const stack = ctx.getActiveStack(state);
    if (stack) stack.name = name;
  });
  cleanupRenameStackName(input);
}

/** Escape while renaming → discard the edit and restore the title. */
export function cancelRenameStackName(input) {
  cleanupRenameStackName(input);
}
