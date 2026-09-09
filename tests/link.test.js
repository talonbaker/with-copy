import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStack } from '../src/js/schema.js';
import {
  encodeStack,
  decodeStack,
  buildShareUrl,
  parseShareFragment,
} from '../src/js/link.js';

describe('encodeStack / decodeStack', () => {
  test('round-trips a stack, assigning nothing (ids preserved by the codec itself)', async () => {
    const stack = createStack({ name: 'Claude', accent: 'purple' });
    stack.pieces[0].variants[0].text = 'Header text';
    stack.pieces[2].variants[0].text = 'Footer text';

    const encoded = await encodeStack(stack);
    const decoded = await decodeStack(encoded);

    assert.deepEqual(decoded, stack);
  });

  test('encoded string is base64url: no +, /, or =', async () => {
    // A stack with varied text likely to produce every base64 alphabet
    // symbol under plain base64, to make the check meaningful.
    const stack = createStack({ name: 'Base64 Probe ?? // ++ ==', accent: 'teal' });
    stack.pieces[0].variants[0].text = 'a'.repeat(200) + String.fromCharCode(0, 1, 2, 255, 254);
    stack.pieces[2].variants[0].text = 'Symbols: +/=? {}[]';

    const encoded = await encodeStack(stack);
    assert.doesNotMatch(encoded, /[+/=]/);
  });

  test('decodeStack rejects an invalid base64url string', async () => {
    await assert.rejects(
      () => decodeStack('not-valid-base64url-!!!***'),
      (err) => Array.isArray(err.errors) && err.errors.length > 0,
    );
  });

  test('decodeStack rejects garbage that decodes but does not decompress', async () => {
    const bogus = Buffer.from('this is not deflate data').toString('base64url');
    await assert.rejects(
      () => decodeStack(bogus),
      (err) => Array.isArray(err.errors) && err.errors.length > 0,
    );
  });

  test('decodeStack rejects a stack that fails validateStack', async () => {
    const stack = createStack({ name: 'Bad', accent: 'blue' });
    stack.accent = 'not-a-real-accent';
    const encoded = await encodeStack(stack);
    await assert.rejects(
      () => decodeStack(encoded),
      (err) => Array.isArray(err.errors) && err.errors.some((e) => e.path === 'accent'),
    );
  });

  test('decodeStack rejects an unsupported payload version', async () => {
    const json = JSON.stringify({ version: 2, stack: createStack({ name: 'X', accent: 'red' }) });
    const bytes = new TextEncoder().encode(json);
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const compressed = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const encoded = compressed.toString('base64url');
    await assert.rejects(
      () => decodeStack(encoded),
      (err) => Array.isArray(err.errors) && err.errors.some((e) => e.path === 'version'),
    );
  });
});

describe('buildShareUrl', () => {
  test('builds a fragment URL with the s= param', () => {
    const url = buildShareUrl('abc123', 'https://withcopy.app');
    assert.equal(url, 'https://withcopy.app/#s=abc123');
  });
});

describe('parseShareFragment', () => {
  test('extracts the s parameter from a hash with the leading #', () => {
    assert.equal(parseShareFragment('#s=abc123'), 'abc123');
  });

  test('extracts the s parameter from a hash without the leading #', () => {
    assert.equal(parseShareFragment('s=abc123'), 'abc123');
  });

  test('returns null when there is no s parameter', () => {
    assert.equal(parseShareFragment('#foo=bar'), null);
  });

  test('returns null for an empty hash', () => {
    assert.equal(parseShareFragment(''), null);
    assert.equal(parseShareFragment('#'), null);
  });

  test('returns null for non-string input', () => {
    assert.equal(parseShareFragment(undefined), null);
    assert.equal(parseShareFragment(null), null);
  });
});
