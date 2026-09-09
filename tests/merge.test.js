import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPiece, createStack } from '../js/schema.js';
import { needsClipboard, assemble, shouldSkip } from '../js/merge.js';

function stackWith(pieces, overrides = {}) {
  const base = createStack({ name: 'Test', accent: 'blue' });
  return { ...base, pieces, ...overrides };
}

function textPiece(text, { enabled = true } = {}) {
  const piece = createPiece('text', text);
  piece.enabled = enabled;
  return piece;
}

function clipboardPiece({ enabled = true } = {}) {
  const piece = createPiece('clipboard');
  piece.enabled = enabled;
  return piece;
}

describe('needsClipboard', () => {
  test('true when the clipboard piece is enabled', () => {
    const stack = stackWith([textPiece('a'), clipboardPiece({ enabled: true })]);
    assert.equal(needsClipboard(stack), true);
  });

  test('false when the clipboard piece is disabled', () => {
    const stack = stackWith([textPiece('a'), clipboardPiece({ enabled: false })]);
    assert.equal(needsClipboard(stack), false);
  });
});

describe('assemble: ordering and whitespace', () => {
  test('joins enabled pieces in order with the separator', () => {
    const stack = stackWith(
      [textPiece('Header'), clipboardPiece(), textPiece('Footer')],
      { separator: '\n\n' },
    );
    const result = assemble(stack, 'middle');
    assert.equal(result.ok, true);
    assert.equal(result.text, 'Header\n\nmiddle\n\nFooter');
  });

  test('skips disabled pieces entirely', () => {
    const stack = stackWith([
      textPiece('Header', { enabled: false }),
      clipboardPiece(),
      textPiece('Footer'),
    ]);
    const result = assemble(stack, 'middle');
    assert.equal(result.ok, true);
    assert.equal(result.text, 'middle\n\nFooter');
  });

  test('trims trailing whitespace from non-clipboard segments but keeps leading', () => {
    const stack = stackWith([textPiece('  Header  \n\t'), clipboardPiece({ enabled: false })]);
    const result = assemble(stack, '');
    assert.equal(result.ok, true);
    assert.equal(result.text, '  Header');
  });

  test('clipboard segment is used unchanged, including its own whitespace', () => {
    const stack = stackWith([clipboardPiece()]);
    const result = assemble(stack, '  raw clipboard  ');
    assert.equal(result.ok, true);
    assert.equal(result.text, '  raw clipboard  ');
  });

  test('drops non-clipboard segments that are empty after trimming', () => {
    const stack = stackWith([
      textPiece('   '),
      clipboardPiece(),
      textPiece('Footer'),
    ]);
    const result = assemble(stack, 'middle');
    assert.equal(result.ok, true);
    assert.equal(result.text, 'middle\n\nFooter');
  });

  test('a custom separator is used to join segments', () => {
    const stack = stackWith(
      [textPiece('a'), textPiece('b'), clipboardPiece({ enabled: false })],
      { separator: ' | ' },
    );
    const result = assemble(stack, '');
    assert.equal(result.ok, true);
    assert.equal(result.text, 'a | b');
  });
});

describe('assemble: clipboard handling', () => {
  test('enabled clipboard piece with empty text -> EMPTY_CLIPBOARD', () => {
    const stack = stackWith([textPiece('Header'), clipboardPiece(), textPiece('Footer')]);
    const result = assemble(stack, '');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'EMPTY_CLIPBOARD');
  });

  test('enabled clipboard piece with whitespace-only text -> EMPTY_CLIPBOARD', () => {
    const stack = stackWith([clipboardPiece()]);
    const result = assemble(stack, '   \n  ');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'EMPTY_CLIPBOARD');
  });

  test('disabled clipboard piece never triggers EMPTY_CLIPBOARD', () => {
    const stack = stackWith([textPiece('Header'), clipboardPiece({ enabled: false })]);
    const result = assemble(stack, '');
    assert.equal(result.ok, true);
    assert.equal(result.text, 'Header');
  });
});

describe('assemble: empty stack', () => {
  test('no segments remain -> EMPTY_STACK', () => {
    const stack = stackWith([
      textPiece(''),
      clipboardPiece({ enabled: false }),
      textPiece('   '),
    ]);
    const result = assemble(stack, '');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'EMPTY_STACK');
  });

  test('all pieces disabled -> EMPTY_STACK', () => {
    const stack = stackWith([
      textPiece('Header', { enabled: false }),
      clipboardPiece({ enabled: false }),
    ]);
    const result = assemble(stack, 'anything');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'EMPTY_STACK');
  });
});

describe('shouldSkip', () => {
  test('true on exact match', () => {
    assert.equal(shouldSkip('same text', 'same text'), true);
  });

  test('false on a difference', () => {
    assert.equal(shouldSkip('new text', 'same text'), false);
  });

  test('false when lastOutput is null', () => {
    assert.equal(shouldSkip('anything', null), false);
  });
});
