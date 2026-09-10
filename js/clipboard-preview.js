// clipboard-preview.js — pure helpers behind the opt-in clipboard preview
// (W7). See docs/tasks/w7-clipboard-preview.md and
// docs/spec/2026-09-09-w-copy-technical-spec.md §3, §7.2.
//
// No DOM, no `localStorage`, no clipboard access, no `Date.now()` of its
// own: main.js owns the actual preview state (the text last obtained, and
// when) in memory only, per the task's hard privacy rule — this module only
// turns plain values the caller already has into the strings the card
// shows, so `node:test` covers it directly, the same way schema.js/
// merge.js/pile.js do.

/**
 * Default truncation limits for the collapsed preview (design: "First 6
 * lines or 400 characters, whichever comes first"). Exported so main.js/
 * piece-card.js and this module's own tests share one source of truth for
 * the numbers.
 */
export const PREVIEW_MAX_LINES = 6;
export const PREVIEW_MAX_CHARS = 400;

/**
 * Truncates clipboard text for the collapsed preview: at most `maxLines`
 * lines, and separately at most `maxChars` characters, whichever limit is
 * reached first — handoff documents are enormous, and this never renders
 * the whole thing into the card by default. Neither limit is skipped when
 * the other already fired: a text with few long lines still gets
 * character-capped, and a text with many short lines still gets
 * line-capped, so the result never exceeds either bound at once. Takes the
 * raw `text` and an optional `{ maxLines, maxChars }` (defaulting to the
 * constants above) and returns `{ text, truncated }`: `text` is the
 * (possibly shortened) string to show, `truncated` is whether anything was
 * cut. Leading/trailing whitespace and blank lines are never trimmed —
 * only faithfully preserved and then possibly cut off — per the design's
 * "show leading and trailing whitespace faithfully rather than collapsing
 * it." A non-string `text` is treated as `''`. Pure and synchronous; never
 * throws.
 * @param {string} text
 * @param {{ maxLines?: number, maxChars?: number }} [options]
 * @returns {{ text: string, truncated: boolean }}
 */
export function truncatePreview(text, { maxLines = PREVIEW_MAX_LINES, maxChars = PREVIEW_MAX_CHARS } = {}) {
  const safe = typeof text === 'string' ? text : '';
  let shown = safe;
  let truncated = false;

  const lines = safe.split('\n');
  if (lines.length > maxLines) {
    shown = lines.slice(0, maxLines).join('\n');
    truncated = true;
  }

  if (shown.length > maxChars) {
    shown = shown.slice(0, maxChars);
    truncated = true;
  }

  return { text: shown, truncated };
}

/**
 * Formats a character count for the preview's quiet meta line, e.g.
 * "4,812 characters", "1 character", "0 characters". Takes the character
 * `count` and returns the formatted string; thousands are comma-grouped
 * (`toLocaleString('en-US')`) to stay readable for the large documents this
 * feature exists for. A non-finite, negative, or fractional `count` is
 * clamped to a non-negative integer (floored) rather than producing a
 * malformed string. Pure; never throws.
 * @param {number} count
 * @returns {string}
 */
export function formatCharCount(count) {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'character' : 'characters'}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Formats how long ago the clipboard was last checked, honestly — the
 * preview never claims to be current (D8), so this wording is what tells
 * the user their eyes are on a snapshot, not a live view. Takes `ageMs`,
 * the elapsed milliseconds since the check (`now - checkedAt`; the caller
 * supplies both ends so this stays pure and testable without faking the
 * clock), and returns "checked just now" under a minute, then "checked N
 * minute(s) ago", "checked N hour(s) ago", or "checked N day(s) ago" as it
 * ages, always with correct singular/plural wording. A non-finite or
 * negative `ageMs` (a clock that hasn't ticked forward, or ran backward) is
 * clamped to 0, i.e. "checked just now" — never a negative or garbled
 * duration. Pure; never throws.
 * @param {number} ageMs
 * @returns {string}
 */
export function formatCheckedAgo(ageMs) {
  const ms = Number.isFinite(ageMs) ? Math.max(0, ageMs) : 0;

  if (ms < MINUTE_MS) return 'checked just now';
  if (ms < HOUR_MS) {
    const n = Math.floor(ms / MINUTE_MS);
    return `checked ${n} ${n === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (ms < DAY_MS) {
    const n = Math.floor(ms / HOUR_MS);
    return `checked ${n} ${n === 1 ? 'hour' : 'hours'} ago`;
  }
  const n = Math.floor(ms / DAY_MS);
  return `checked ${n} ${n === 1 ? 'day' : 'days'} ago`;
}
