// probe.js — drives probe.html. Temporary diagnostic page, removed before
// launch (spec §9). Exercises every clipboard.js code path and reports the
// outcome on screen and as copyable text.

import { readText, writeText, writeDeferred, readFromPasteEvent, ClipboardError } from './clipboard.js';

/** @type {Map<string, { label: string, outcome: 'success'|'error'|'pending', detail: string, errorName: string, errorMessage: string }>} */
const results = new Map();

const CASE_LABELS = {
  'write-alone': '1. writeText alone',
  'read-alone': '2. readText alone',
  'read-then-write': '3. await readText then await writeText',
  'write-deferred': '4. writeDeferred(readText().then(transform))',
  'paste-event': '5. Paste-event path',
  'foreign-read': '6. Foreign-clipboard read',
  'foreign-write-deferred': '7. Foreign-clipboard writeDeferred',
  'editable-paste': '8. Contenteditable paste target',
  'editable-one-tap': '9. Contenteditable paste target, one tap only',
};

/**
 * Manual, human-observed facts that no script can detect (whether a native
 * OS callout appeared, whether the keyboard stayed down). Each entry reads
 * one control live when the report is rendered, rather than being pushed
 * into `results` by an event handler, since there is no "outcome" event to
 * hook — the tester just answers by hand at their own pace.
 * @type {Array<{ caseId: string, describe: () => string }>}
 */
const MANUAL_ANSWERS = [
  {
    caseId: 'foreign-read',
    describe: () => `  Callout appeared: ${checkboxAnswer('foreign-read-callout')}`,
  },
  {
    caseId: 'foreign-write-deferred',
    describe: () => `  Callout appeared: ${checkboxAnswer('foreign-write-deferred-callout')}`,
  },
  {
    caseId: 'editable-paste',
    describe: () =>
      `  Keyboard stayed down: ${checkboxAnswer('editable-paste-keyboard-down')}\n` +
      `  Edit menu offered Paste: ${checkboxAnswer('editable-paste-menu-offered')}`,
  },
  {
    caseId: 'editable-one-tap',
    describe: () => `  Menu appeared: ${radioAnswer('one-tap-menu')}`,
  },
];

function checkboxAnswer(role) {
  const el = document.querySelector(`[data-role="${role}"]`);
  if (!el) return 'not answered';
  return el.checked ? 'yes' : 'not checked';
}

function radioAnswer(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : 'not answered';
}

function resultRow(caseId) {
  return document.querySelector(`[data-result="${caseId}"]`);
}

/**
 * @param {string} caseId
 * @param {{ outcome: 'success'|'error', detail: string, errorName?: string, errorMessage?: string }} info
 */
function reportResult(caseId, info) {
  results.set(caseId, {
    label: CASE_LABELS[caseId] || caseId,
    outcome: info.outcome,
    detail: info.detail || '',
    errorName: info.errorName || '',
    errorMessage: info.errorMessage || '',
  });

  const row = resultRow(caseId);
  if (row) {
    row.dataset.outcome = info.outcome;
    const line = info.outcome === 'success'
      ? `OK — ${info.detail}`
      : `FAILED — ${info.errorName}: ${info.errorMessage}`;
    row.textContent = line;
  }
  renderReport();
}

/** Normalize any thrown value into { name, message } for reporting. */
function describeError(err) {
  if (err instanceof ClipboardError) {
    return { name: `ClipboardError(${err.code})`, message: err.message };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { name: 'Unknown', message: String(err) };
}

function renderEnvironment() {
  const uaEl = document.querySelector('[data-role="ua"]');
  const standaloneEl = document.querySelector('[data-role="standalone"]');
  const secureEl = document.querySelector('[data-role="secure-context"]');

  if (uaEl) uaEl.textContent = navigator.userAgent;
  if (standaloneEl) {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    standaloneEl.textContent = standalone ? 'yes' : 'no';
  }
  if (secureEl) secureEl.textContent = String(window.isSecureContext);
}

function renderReport() {
  const reportEl = document.querySelector('[data-role="report"]');
  if (!reportEl) return;

  const lines = [];
  lines.push('w/copy clipboard probe report');
  lines.push(`User agent: ${navigator.userAgent}`);
  lines.push(`Standalone: ${window.matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no'}`);
  lines.push(`Secure context: ${window.isSecureContext}`);
  lines.push('');

  for (const id of Object.keys(CASE_LABELS)) {
    const r = results.get(id);
    lines.push(CASE_LABELS[id]);
    if (!r) {
      lines.push('  not run');
    } else if (r.outcome === 'success') {
      lines.push(`  OK — ${r.detail}`);
    } else {
      lines.push(`  FAILED — ${r.errorName}: ${r.errorMessage}`);
    }
    const manual = MANUAL_ANSWERS.find((m) => m.caseId === id);
    if (manual) lines.push(manual.describe());
    lines.push('');
  }

  reportEl.value = lines.join('\n').trimEnd() + '\n';
}

async function runWriteAlone() {
  try {
    const text = `w/copy probe: writeText alone @ ${new Date().toISOString()}`;
    await writeText(text);
    reportResult('write-alone', { outcome: 'success', detail: `wrote ${text.length} chars` });
  } catch (err) {
    const { name, message } = describeError(err);
    reportResult('write-alone', { outcome: 'error', errorName: name, errorMessage: message });
  }
}

async function runReadAlone() {
  try {
    const text = await readText();
    const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    reportResult('read-alone', { outcome: 'success', detail: `read ${text.length} chars: "${preview}"` });
  } catch (err) {
    const { name, message } = describeError(err);
    reportResult('read-alone', { outcome: 'error', errorName: name, errorMessage: message });
  }
}

async function runReadThenWrite() {
  try {
    const text = await readText();
    const transformed = `${text} [read-then-write]`;
    await writeText(transformed);
    reportResult('read-then-write', { outcome: 'success', detail: `wrote ${transformed.length} chars` });
  } catch (err) {
    const { name, message } = describeError(err);
    reportResult('read-then-write', { outcome: 'error', errorName: name, errorMessage: message });
  }
}

function runWriteDeferred() {
  // Must be called synchronously in the click handler, with no await before
  // it, so writeDeferred's own synchronous navigator.clipboard.write() call
  // still lands inside this gesture (see clipboard.js's WebKit comment).
  const textPromise = readText().then((text) => `${text} [wrapped]`);
  writeDeferred(textPromise)
    .then(() => {
      reportResult('write-deferred', { outcome: 'success', detail: 'writeDeferred resolved' });
    })
    .catch((err) => {
      const { name, message } = describeError(err);
      reportResult('write-deferred', { outcome: 'error', errorName: name, errorMessage: message });
    });
}

async function runForeignRead() {
  try {
    const text = await readText();
    const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    reportResult('foreign-read', { outcome: 'success', detail: `read ${text.length} chars: "${preview}"` });
  } catch (err) {
    const { name, message } = describeError(err);
    reportResult('foreign-read', { outcome: 'error', errorName: name, errorMessage: message });
  }
}

function runForeignWriteDeferred() {
  // Same shape as runWriteDeferred (case 4): writeDeferred is called
  // synchronously in the click handler, before any await, so its own
  // synchronous navigator.clipboard.write() call still lands inside this
  // gesture. The only difference from case 4 is the precondition — this one
  // is meant to be run against clipboard content copied from another app.
  const textPromise = readText().then((text) => `${text} [foreign-write-deferred]`);
  writeDeferred(textPromise)
    .then(() => {
      reportResult('foreign-write-deferred', { outcome: 'success', detail: 'writeDeferred resolved' });
    })
    .catch((err) => {
      const { name, message } = describeError(err);
      reportResult('foreign-write-deferred', { outcome: 'error', errorName: name, errorMessage: message });
    });
}

/**
 * Wires a contenteditable paste target for experiments 8 and 9: on `paste`,
 * prevent the browser from actually inserting the pasted text (the target
 * must never visibly hold it), pull the text from `event.clipboardData`,
 * transform it, and write the result back inside the same event — a user
 * gesture on every platform, WebKit included, so this `writeText` call needs
 * no permission of its own. Reports success/failure automatically; the
 * keyboard/menu/tap-count questions are answered by hand (see MANUAL_ANSWERS).
 * @param {string} caseId
 * @param {string} roleAttr
 * @param {string} restingLabel text to restore once the paste is handled
 */
function wireEditablePasteTarget(caseId, roleAttr, restingLabel) {
  const target = document.querySelector(`[data-role="${roleAttr}"]`);
  if (!target) return;

  target.addEventListener('beforeinput', (event) => event.preventDefault());

  const reset = () => {
    target.textContent = restingLabel;
    target.blur();
  };

  target.addEventListener('paste', (event) => {
    event.preventDefault();
    try {
      const text = readFromPasteEvent(event);
      const transformed = `${text} [${caseId}]`;
      writeText(transformed)
        .then(() => {
          reportResult(caseId, { outcome: 'success', detail: `wrote ${transformed.length} chars back` });
        })
        .catch((err) => {
          const { name, message } = describeError(err);
          reportResult(caseId, { outcome: 'error', errorName: name, errorMessage: message });
        })
        .finally(reset);
    } catch (err) {
      const { name, message } = describeError(err);
      reportResult(caseId, { outcome: 'error', errorName: name, errorMessage: message });
      reset();
    }
  });
}

function setUpPasteExperiment() {
  const target = document.querySelector('[data-role="paste-target"]');
  if (!target) return;

  target.addEventListener('paste', (event) => {
    event.preventDefault();
    try {
      const text = readFromPasteEvent(event);
      const transformed = `${text} [pasted+transformed]`;
      // writeText's internal navigator.clipboard.writeText(...) call is made
      // synchronously as part of this handler, so it is gesture-safe on
      // WebKit even though writeText itself is async.
      writeText(transformed)
        .then(() => {
          target.value = transformed;
          reportResult('paste-event', { outcome: 'success', detail: `wrote ${transformed.length} chars back` });
        })
        .catch((err) => {
          const { name, message } = describeError(err);
          reportResult('paste-event', { outcome: 'error', errorName: name, errorMessage: message });
        });
    } catch (err) {
      const { name, message } = describeError(err);
      reportResult('paste-event', { outcome: 'error', errorName: name, errorMessage: message });
    }
  });
}

async function runCopyResults() {
  const row = resultRow('copy-results');
  try {
    renderReport();
    const reportEl = document.querySelector('[data-role="report"]');
    await writeText(reportEl.value);
    if (row) {
      row.dataset.outcome = 'success';
      row.textContent = 'OK — report copied to clipboard.';
    }
  } catch (err) {
    const { name, message } = describeError(err);
    if (row) {
      row.dataset.outcome = 'error';
      row.textContent = `FAILED — ${name}: ${message}`;
    }
  }
}

function wireButtons() {
  document.querySelectorAll('[data-action="run"]').forEach((button) => {
    const caseId = button.dataset.case;
    button.addEventListener('click', () => {
      if (caseId === 'write-alone') runWriteAlone();
      else if (caseId === 'read-alone') runReadAlone();
      else if (caseId === 'read-then-write') runReadThenWrite();
      else if (caseId === 'write-deferred') runWriteDeferred();
      else if (caseId === 'foreign-read') runForeignRead();
      else if (caseId === 'foreign-write-deferred') runForeignWriteDeferred();
    });
  });

  const copyButton = document.querySelector('[data-action="copy-results"]');
  if (copyButton) copyButton.addEventListener('click', runCopyResults);
}

/** Re-renders the report live as the tester answers the manual questions. */
function wireManualInputs() {
  document.querySelectorAll('.probe-manual input').forEach((input) => {
    input.addEventListener('change', renderReport);
  });
}

renderEnvironment();
setUpPasteExperiment();
wireEditablePasteTarget('editable-paste', 'editable-paste-target', 'Tap, then Paste');
wireEditablePasteTarget('editable-one-tap', 'editable-one-tap-target', 'Tap once, then wait');
wireButtons();
wireManualInputs();
renderReport();
