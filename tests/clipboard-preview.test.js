import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREVIEW_MAX_LINES,
  PREVIEW_MAX_CHARS,
  truncatePreview,
  formatCharCount,
  formatCheckedAgo,
} from '../js/clipboard-preview.js';

describe('truncatePreview', () => {
  test('short text is returned unchanged, not truncated', () => {
    const result = truncatePreview('hello\nworld');
    assert.equal(result.text, 'hello\nworld');
    assert.equal(result.truncated, false);
  });

  test('cuts at maxLines when there are too many lines', () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const result = truncatePreview(text, { maxLines: 6, maxChars: 1000 });
    assert.equal(result.text, ['line 0', 'line 1', 'line 2', 'line 3', 'line 4', 'line 5'].join('\n'));
    assert.equal(result.truncated, true);
  });

  test('cuts at maxChars when a single line is too long', () => {
    const text = 'a'.repeat(1000);
    const result = truncatePreview(text, { maxLines: 6, maxChars: 400 });
    assert.equal(result.text.length, 400);
    assert.equal(result.truncated, true);
  });

  test('whichever limit is reached first applies (few long lines still char-capped)', () => {
    const text = ['a'.repeat(300), 'b'.repeat(300)].join('\n'); // 2 lines, 601 chars
    const result = truncatePreview(text, { maxLines: 6, maxChars: 400 });
    assert.equal(result.truncated, true);
    assert.ok(result.text.length <= 400);
  });

  test('applies both limits together: line-cut first, then char-cut on what remains', () => {
    const text = Array.from({ length: 20 }, () => 'x'.repeat(50)).join('\n'); // 20 lines of 50 chars
    const result = truncatePreview(text, { maxLines: 6, maxChars: 100 });
    assert.equal(result.truncated, true);
    assert.ok(result.text.length <= 100);
    assert.ok(result.text.split('\n').length <= 6);
  });

  test('default limits match the design constants', () => {
    assert.equal(PREVIEW_MAX_LINES, 6);
    assert.equal(PREVIEW_MAX_CHARS, 400);
    const text = Array.from({ length: 8 }, (_, i) => `l${i}`).join('\n');
    const result = truncatePreview(text);
    assert.equal(result.text.split('\n').length, 6);
  });

  test('preserves leading and trailing whitespace rather than collapsing it', () => {
    const text = '  leading and trailing   \n\n\nnext';
    const result = truncatePreview(text, { maxLines: 6, maxChars: 1000 });
    assert.equal(result.text, text);
  });

  test('empty string is not truncated', () => {
    const result = truncatePreview('');
    assert.equal(result.text, '');
    assert.equal(result.truncated, false);
  });

  test('non-string input is treated as empty', () => {
    // @ts-expect-error deliberate misuse
    const result = truncatePreview(undefined);
    assert.equal(result.text, '');
    assert.equal(result.truncated, false);
  });
});

describe('formatCharCount', () => {
  test('singular for exactly one character', () => {
    assert.equal(formatCharCount(1), '1 character');
  });

  test('plural for zero and for more than one', () => {
    assert.equal(formatCharCount(0), '0 characters');
    assert.equal(formatCharCount(2), '2 characters');
  });

  test('comma-groups thousands', () => {
    assert.equal(formatCharCount(4812), '4,812 characters');
    assert.equal(formatCharCount(1234567), '1,234,567 characters');
  });

  test('clamps negative, fractional, and non-finite input', () => {
    assert.equal(formatCharCount(-5), '0 characters');
    assert.equal(formatCharCount(3.9), '3 characters');
    assert.equal(formatCharCount(NaN), '0 characters');
    assert.equal(formatCharCount(Infinity), '0 characters');
  });
});

describe('formatCheckedAgo', () => {
  test('under a minute reads "just now"', () => {
    assert.equal(formatCheckedAgo(0), 'checked just now');
    assert.equal(formatCheckedAgo(59_000), 'checked just now');
  });

  test('minutes, with correct singular/plural', () => {
    assert.equal(formatCheckedAgo(60_000), 'checked 1 minute ago');
    assert.equal(formatCheckedAgo(2 * 60_000), 'checked 2 minutes ago');
    assert.equal(formatCheckedAgo(59 * 60_000), 'checked 59 minutes ago');
  });

  test('hours, with correct singular/plural', () => {
    assert.equal(formatCheckedAgo(60 * 60_000), 'checked 1 hour ago');
    assert.equal(formatCheckedAgo(5 * 60 * 60_000), 'checked 5 hours ago');
    assert.equal(formatCheckedAgo(23 * 60 * 60_000), 'checked 23 hours ago');
  });

  test('days, with correct singular/plural', () => {
    assert.equal(formatCheckedAgo(24 * 60 * 60_000), 'checked 1 day ago');
    assert.equal(formatCheckedAgo(3 * 24 * 60 * 60_000), 'checked 3 days ago');
  });

  test('clamps a negative or non-finite age to "just now"', () => {
    assert.equal(formatCheckedAgo(-1000), 'checked just now');
    assert.equal(formatCheckedAgo(NaN), 'checked just now');
  });
});
