import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeQR } from '../js/qr.js';

// `encodeQR('HELLO')` is this suite's fixed reference point. Its module
// bitmap was independently verified during development by rendering it to a
// synthetic bitmap and decoding it with jsQR (a widely used, independently
// written QR decoder, https://github.com/cozmo/jsQR) in a throwaway script
// (not part of this repo, per the brief) — the decode round-tripped to the
// exact string "HELLO". The sha256 below pins that verified bitmap so a
// future change to this module that alters the output gets caught here
// rather than only by an eyeballed screenshot.
const HELLO_SHA256 = 'c146ca5f3a6231aa52ce0b5ffae585061a00723f8c39732d530774c38b2bb784';

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

describe('encodeQR', () => {
  test('a known short string produces the expected version size and a stable, verified bitmap', () => {
    const { size, modules } = encodeQR('HELLO');
    assert.equal(size, 21); // version 1 (byte mode + level M easily fits 5 bytes)
    assert.equal(modules.length, size * size);
    assert.equal(sha256(modules), HELLO_SHA256);
  });

  test('finder patterns are in place at all three corners', () => {
    const { size, modules } = encodeQR('HELLO');
    const at = (row, col) => modules[row * size + col];

    // Each finder pattern is a 7x7 concentric-square eye: a solid outer
    // border, a white ring, a solid 3x3 core. Check that shape at all three
    // corners (top-left, top-right, bottom-left) by Chebyshev distance from
    // each pattern's center, exactly as qr.js itself computes it.
    const centers = [
      [3, 3], // top-left
      [3, size - 4], // top-right
      [size - 4, 3], // bottom-left
    ];
    for (const [cr, cc] of centers) {
      for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          const expectDark = dist !== 2; // dist 0,1,3 dark; dist 2 the white ring
          assert.equal(
            at(cr + dr, cc + dc),
            expectDark ? 1 : 0,
            `finder pattern at (${cr},${cc}), offset (${dr},${dc})`,
          );
        }
      }
      // The one-module white separator ring just outside the 7x7 pattern.
      for (const [dr, dc] of [
        [-4, 0], [4, 0], [0, -4], [0, 4], [-4, -4], [-4, 4], [4, -4], [4, 4],
      ]) {
        const row = cr + dr;
        const col = cc + dc;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        assert.equal(at(row, col), 0, `separator at (${cr},${cc}), offset (${dr},${dc})`);
      }
    }
  });

  test('a fourth corner (bottom-right) has no finder pattern', () => {
    const { size, modules } = encodeQR('HELLO');
    // The bottom-right 7x7 corner is ordinary data/mask territory, not a
    // finder pattern, so it must NOT match the same solid-border shape.
    let matchesFinderShape = true;
    for (let dr = -3; dr <= 3 && matchesFinderShape; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const dist = Math.max(Math.abs(dr), Math.abs(dc));
        const expectDark = dist !== 2;
        const row = size - 4 + dr;
        const col = size - 4 + dc;
        if (modules[row * size + col] !== (expectDark ? 1 : 0)) {
          matchesFinderShape = false;
          break;
        }
      }
    }
    assert.equal(matchesFinderShape, false);
  });

  test('long input selects a higher version (larger symbol) than a short one', () => {
    const short = encodeQR('HELLO');
    const long = encodeQR('x'.repeat(500));
    assert.ok(long.size > short.size, `expected ${long.size} > ${short.size}`);
  });

  test('version grows monotonically with input length across several sizes', () => {
    const sizes = [10, 100, 500, 1500].map((len) => encodeQR('x'.repeat(len)).size);
    for (let i = 1; i < sizes.length; i++) {
      assert.ok(sizes[i] >= sizes[i - 1], `sizes should be non-decreasing: ${sizes}`);
    }
  });

  test('throws when the input is too long even for version 40 at level M', () => {
    assert.throws(() => encodeQR('x'.repeat(3000)));
  });

  test('an empty string still encodes (a valid, if pointless, QR code)', () => {
    const { size, modules } = encodeQR('');
    assert.equal(size, 21);
    assert.equal(modules.length, 441);
  });
});
