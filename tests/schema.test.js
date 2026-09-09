import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  ACCENTS,
  KINDS,
  newId,
  createVariant,
  createPiece,
  createStack,
  createOnboardingStack,
  createDefaultState,
  validateState,
  validateStack,
  migrate,
} from '../src/js/schema.js';

describe('newId', () => {
  test('has the expected shape and prefix', () => {
    const id = newId('stk');
    assert.match(id, /^stk_[0-9a-z]{10}$/);
  });

  test('is different across calls', () => {
    const a = newId('pc');
    const b = newId('pc');
    assert.notEqual(a, b);
  });
});

describe('createPiece', () => {
  test('clipboard piece has no variants or activeVariantId', () => {
    const piece = createPiece('clipboard', 'ignored');
    assert.equal(piece.kind, 'clipboard');
    assert.equal(piece.enabled, true);
    assert.equal('variants' in piece, false);
    assert.equal('activeVariantId' in piece, false);
  });

  test('non-clipboard piece has one default variant', () => {
    const piece = createPiece('header', 'hello');
    assert.equal(piece.variants.length, 1);
    assert.equal(piece.variants[0].text, 'hello');
    assert.equal(piece.variants[0].label, 'Default');
    assert.equal(piece.activeVariantId, piece.variants[0].id);
  });
});

describe('createStack', () => {
  test('builds header + clipboard + footer template with empty texts', () => {
    const stack = createStack({ name: 'Claude', accent: 'blue' });
    assert.equal(stack.name, 'Claude');
    assert.equal(stack.accent, 'blue');
    assert.equal(stack.separator, '\n\n');
    assert.equal(stack.pieces.length, 3);
    assert.deepEqual(stack.pieces.map((p) => p.kind), ['header', 'clipboard', 'footer']);
    assert.equal(stack.pieces[0].variants[0].text, '');
    assert.equal(stack.pieces[2].variants[0].text, '');
  });
});

describe('createOnboardingStack / createDefaultState', () => {
  test('onboarding stack is named, green, and has explanatory text', () => {
    const stack = createOnboardingStack();
    assert.equal(stack.name, 'My first stack');
    assert.equal(stack.accent, 'green');
    assert.match(stack.pieces[0].variants[0].text, /w\/copy/);
    assert.notEqual(stack.pieces[2].variants[0].text, '');
  });

  test('default state validates and points at the onboarding stack', () => {
    const state = createDefaultState();
    const result = validateState(state);
    assert.equal(result.ok, true);
    assert.equal(state.activeStackId, state.stacks[0].id);
  });
});

describe('validateState: success', () => {
  test('a fresh default state is valid', () => {
    const result = validateState(createDefaultState());
    assert.equal(result.ok, true);
  });

  test('returns a deep copy, not the same reference', () => {
    const state = createDefaultState();
    const result = validateState(state);
    assert.notEqual(result.value, state);
    assert.notEqual(result.value.stacks, state.stacks);
    assert.notEqual(result.value.stacks[0], state.stacks[0]);
    result.value.settings.theme = 'dark';
    assert.equal(state.settings.theme, 'system');
  });
});

function findError(errors, path) {
  return errors.find((e) => e.path === path);
}

describe('validateState: failing cases from spec §3', () => {
  test('version must be the integer 1', () => {
    const state = createDefaultState();
    state.version = 2;
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'version'));
  });

  test('settings.theme must be one of system|light|dark', () => {
    const state = createDefaultState();
    state.settings.theme = 'purple';
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'settings.theme'));
  });

  test('settings.density must be one of comfortable|compact', () => {
    const state = createDefaultState();
    state.settings.density = 'roomy';
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'settings.density'));
  });

  test('stacks must be a non-empty array', () => {
    const state = createDefaultState();
    state.stacks = [];
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks'));
  });

  test('activeStackId must name one of the stacks', () => {
    const state = createDefaultState();
    state.activeStackId = 'stk_doesnotexist';
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'activeStackId'));
  });

  test('stack.accent must be one of the eight accent names', () => {
    const state = createDefaultState();
    state.stacks[0].accent = 'chartreuse';
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[0].accent'));
  });

  test('stack.separator must be a string', () => {
    const state = createDefaultState();
    state.stacks[0].separator = 42;
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[0].separator'));
  });

  test('piece.kind must be one of header|footer|text|clipboard', () => {
    const state = createDefaultState();
    state.stacks[0].pieces[0].kind = 'banner';
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[0].pieces[0].kind'));
  });

  test('exactly one piece per stack must have kind clipboard (zero)', () => {
    const state = createDefaultState();
    state.stacks[0].pieces = state.stacks[0].pieces.filter((p) => p.kind !== 'clipboard');
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[0].pieces'));
  });

  test('exactly one piece per stack must have kind clipboard (two)', () => {
    const state = createDefaultState();
    const clip = state.stacks[0].pieces.find((p) => p.kind === 'clipboard');
    state.stacks[0].pieces.push({ ...clip, id: 'pc_extraclip01' });
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[0].pieces'));
  });

  test('the clipboard piece must have no variants and no activeVariantId', () => {
    const state = createDefaultState();
    const clip = state.stacks[0].pieces.find((p) => p.kind === 'clipboard');
    clip.variants = [];
    clip.activeVariantId = 'var_bogus0001';
    const result = validateState(state);
    assert.equal(result.ok, false);
    const clipIndex = state.stacks[0].pieces.indexOf(clip);
    assert.ok(findError(result.errors, `stacks[0].pieces[${clipIndex}].variants`));
    assert.ok(findError(result.errors, `stacks[0].pieces[${clipIndex}].activeVariantId`));
  });

  test('every non-clipboard piece needs a non-empty variants array', () => {
    const state = createDefaultState();
    state.stacks[0].pieces[0].variants = [];
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[0].pieces[0].variants'));
  });

  test('activeVariantId must name one of the piece variants', () => {
    const state = createDefaultState();
    state.stacks[0].pieces[0].activeVariantId = 'var_doesnotexist';
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[0].pieces[0].activeVariantId'));
  });

  test('ids must be unique within their scope (stacks)', () => {
    const state = createDefaultState();
    const clone = JSON.parse(JSON.stringify(state.stacks[0]));
    clone.name = 'Duplicate';
    state.stacks.push(clone);
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[1].id'));
  });

  test('ids must be unique within their scope (pieces)', () => {
    const state = createDefaultState();
    state.stacks[0].pieces[0].id = state.stacks[0].pieces[2].id;
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[0].pieces[2].id'));
  });

  test('ids must be unique within their scope (variants)', () => {
    const state = createDefaultState();
    const header = state.stacks[0].pieces[0];
    header.variants.push({ id: header.variants[0].id, label: 'Alt', text: 'x' });
    header.activeVariantId = header.variants[0].id;
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'stacks[0].pieces[0].variants[1].id'));
  });

  test('unknown extra keys are rejected at every level', () => {
    const state = createDefaultState();
    state.bogus = true;
    state.settings.bogus = true;
    state.stacks[0].bogus = true;
    state.stacks[0].pieces[0].bogus = true;
    state.stacks[0].pieces[0].variants[0].bogus = true;
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'bogus'));
    assert.ok(findError(result.errors, 'settings.bogus'));
    assert.ok(findError(result.errors, 'stacks[0].bogus'));
    assert.ok(findError(result.errors, 'stacks[0].pieces[0].bogus'));
    assert.ok(findError(result.errors, 'stacks[0].pieces[0].variants[0].bogus'));
  });

  test('collects every error, not just the first', () => {
    const state = createDefaultState();
    state.version = 99;
    state.settings.theme = 'nope';
    state.stacks[0].accent = 'nope';
    const result = validateState(state);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length >= 3);
  });
});

describe('validateStack', () => {
  test('a bare valid stack validates and rejects unknown keys', () => {
    const stack = createStack({ name: 'Instagram', accent: 'pink' });
    const ok = validateStack(stack);
    assert.equal(ok.ok, true);

    const bad = { ...structuredClone(stack), extra: true };
    const result = validateStack(bad);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'extra'));
  });

  test('paths are rooted at the stack itself', () => {
    const stack = createStack({ name: 'Instagram', accent: 'pink' });
    stack.pieces[0].activeVariantId = 'var_missing0001';
    const result = validateStack(stack);
    assert.equal(result.ok, false);
    assert.ok(findError(result.errors, 'pieces[0].activeVariantId'));
  });
});

describe('migrate', () => {
  test('round-trips a valid version-1 state', () => {
    const state = createDefaultState();
    const migrated = migrate(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(migrated, state);
  });

  test('throws with .errors on an invalid version-1 state', () => {
    const state = createDefaultState();
    state.settings.theme = 'nope';
    assert.throws(
      () => migrate(state),
      (err) => Array.isArray(err.errors) && err.errors.length > 0,
    );
  });

  test('throws with .errors on an unsupported version', () => {
    assert.throws(
      () => migrate({ version: 99 }),
      (err) => Array.isArray(err.errors) && findError(err.errors, 'version') !== undefined,
    );
  });

  test('throws on non-object input', () => {
    assert.throws(() => migrate(null), (err) => Array.isArray(err.errors));
  });
});

test('exported constants match the spec', () => {
  assert.equal(SCHEMA_VERSION, 1);
  assert.deepEqual(ACCENTS, ['green', 'orange', 'blue', 'purple', 'pink', 'teal', 'red', 'yellow']);
  assert.deepEqual(KINDS, ['header', 'footer', 'text', 'clipboard']);
  assert.ok(createVariant('x', 'y').id.startsWith('var_'));
});
