// Ids, defaults, validation, and migration for the w/copy data model.
//
// This module must never touch the DOM. It only relies on `crypto`, which
// exists as a global in both Node 18+ and every browser this app targets.
// See docs/spec/2026-09-09-w-copy-technical-spec.md §3 and §4.1.

/** The only schema version this build understands. */
export const SCHEMA_VERSION = 1;

/** The eight stack accent names, per spec §7.3. */
export const ACCENTS = [
  'green',
  'orange',
  'blue',
  'purple',
  'pink',
  'teal',
  'red',
  'yellow',
];

/** The four piece kinds a piece object may have. */
export const KINDS = ['header', 'footer', 'text', 'clipboard'];

const THEMES = ['system', 'light', 'dark'];
const DENSITIES = ['comfortable', 'compact'];

const BASE36_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_RANDOM_CHARS = 10;

const STATE_KEYS = ['version', 'activeStackId', 'settings', 'stacks'];
const SETTINGS_KEYS = ['theme', 'density'];
const STACK_KEYS = ['id', 'name', 'accent', 'separator', 'pieces'];
const NON_CLIPBOARD_PIECE_KEYS = [
  'id',
  'kind',
  'enabled',
  'activeVariantId',
  'variants',
];
const CLIPBOARD_PIECE_KEYS = ['id', 'kind', 'enabled'];
const VARIANT_KEYS = ['id', 'label', 'text'];

/**
 * Generates a short random id string of the form `<prefix>_<10 base36 chars>`,
 * where the random characters come from `crypto.getRandomValues`. Takes the
 * id prefix (conventionally `'stk'`, `'pc'`, or `'var'`) and returns the
 * composed id string. Never throws under normal operation; relies on the
 * `crypto` global being present, which is guaranteed on every supported
 * runtime (Node 18+, and all browsers this app targets).
 */
export function newId(prefix) {
  const bytes = new Uint8Array(ID_RANDOM_CHARS);
  crypto.getRandomValues(bytes);
  let random = '';
  for (let i = 0; i < bytes.length; i += 1) {
    random += BASE36_ALPHABET[bytes[i] % BASE36_ALPHABET.length];
  }
  return `${prefix}_${random}`;
}

/**
 * Creates a variant object: a labeled piece of text a piece can switch
 * between. Takes the initial `text` (default `''`) and `label` (default
 * `''`) and returns `{ id, label, text }` with a freshly generated id. Never
 * throws.
 */
export function createVariant(text = '', label = '') {
  return { id: newId('var'), label, text };
}

/**
 * Creates a piece object of the given `kind`. For `kind === 'clipboard'` the
 * `text` argument is ignored and the returned piece has no `variants` and no
 * `activeVariantId`, per spec §3. For every other kind, the piece is created
 * with exactly one variant (label `'Default'`, the given `text`, default
 * `''`) and `activeVariantId` pointing at it. Returns the new piece object.
 * Never throws; `kind` is not validated here (use `validateStack` for that).
 */
export function createPiece(kind, text = '') {
  if (kind === 'clipboard') {
    return { id: newId('pc'), kind, enabled: true };
  }
  const variant = createVariant(text, 'Default');
  return {
    id: newId('pc'),
    kind,
    enabled: true,
    activeVariantId: variant.id,
    variants: [variant],
  };
}

/**
 * Creates a new stack from the standard header/clipboard/footer template
 * with empty piece texts, per spec §3 and the design handoff §2 ("a new
 * stack starts pre-filled with the standard header/clipboard/footer shape").
 * Takes `{ name, accent }` and returns the stack object, with a fresh id and
 * the default separator `'\n\n'`. Never throws.
 */
export function createStack({ name, accent }) {
  return {
    id: newId('stk'),
    name,
    accent,
    separator: '\n\n',
    pieces: [
      createPiece('header', ''),
      createPiece('clipboard'),
      createPiece('footer', ''),
    ],
  };
}

/**
 * Creates the self-explaining onboarding stack described in spec §8: a
 * stack named "My first stack" with the green accent, whose header and
 * footer text explain the header/clipboard/footer mechanic using the
 * clipboard content itself. Takes no arguments and returns the stack
 * object. Never throws.
 */
export function createOnboardingStack() {
  const stack = createStack({ name: 'My first stack', accent: 'green' });
  const [header, , footer] = stack.pieces;
  header.variants[0].text =
    'Hi, this is w/copy. Everything below this line was on your clipboard when you pressed the button.';
  footer.variants[0].text =
    'Everything above this line was your clipboard. Edit these pieces, add your own, and press w/copy again.';
  return stack;
}

/**
 * Creates the default application state used for a first run or as the
 * fallback when stored data cannot be read: one onboarding stack (see
 * `createOnboardingStack`) made active, with default settings
 * (`theme: 'system'`, `density: 'comfortable'`). Takes no arguments and
 * returns the state object. Never throws.
 */
export function createDefaultState() {
  const stack = createOnboardingStack();
  return {
    version: SCHEMA_VERSION,
    activeStackId: stack.id,
    settings: { theme: 'system', density: 'comfortable' },
    stacks: [stack],
  };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinPath(base, key) {
  return base === '' ? key : `${base}.${key}`;
}

function checkUnknownKeys(obj, allowedKeys, path, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      errors.push({ path: joinPath(path, key), message: `unknown key "${key}"` });
    }
  }
}

function validateNonEmptyString(value, path, errors) {
  if (typeof value !== 'string' || value === '') {
    errors.push({ path, message: 'must be a non-empty string' });
    return false;
  }
  return true;
}

function validateVariantShape(variant, path, errors, variantIds) {
  if (!isPlainObject(variant)) {
    errors.push({ path, message: 'must be an object' });
    return;
  }
  checkUnknownKeys(variant, VARIANT_KEYS, path, errors);

  const idPath = joinPath(path, 'id');
  if (validateNonEmptyString(variant.id, idPath, errors)) {
    if (variantIds.has(variant.id)) {
      errors.push({ path: idPath, message: `duplicate id "${variant.id}"` });
    }
    variantIds.add(variant.id);
  }

  if (typeof variant.label !== 'string') {
    errors.push({ path: joinPath(path, 'label'), message: 'must be a string' });
  }
  if (typeof variant.text !== 'string') {
    errors.push({ path: joinPath(path, 'text'), message: 'must be a string' });
  }
}

function validatePieceShape(piece, path, errors, pieceIds) {
  if (!isPlainObject(piece)) {
    errors.push({ path, message: 'must be an object' });
    return;
  }

  const kind = piece.kind;
  const isClipboard = kind === 'clipboard';
  checkUnknownKeys(
    piece,
    isClipboard ? CLIPBOARD_PIECE_KEYS : NON_CLIPBOARD_PIECE_KEYS,
    path,
    errors,
  );

  const idPath = joinPath(path, 'id');
  if (validateNonEmptyString(piece.id, idPath, errors)) {
    if (pieceIds.has(piece.id)) {
      errors.push({ path: idPath, message: `duplicate id "${piece.id}"` });
    }
    pieceIds.add(piece.id);
  }

  if (!KINDS.includes(kind)) {
    errors.push({
      path: joinPath(path, 'kind'),
      message: `must be one of ${KINDS.join(', ')}`,
    });
  }

  if (typeof piece.enabled !== 'boolean') {
    errors.push({ path: joinPath(path, 'enabled'), message: 'must be a boolean' });
  }

  if (isClipboard) {
    if (Object.prototype.hasOwnProperty.call(piece, 'variants')) {
      errors.push({
        path: joinPath(path, 'variants'),
        message: 'a clipboard piece must not have variants',
      });
    }
    if (Object.prototype.hasOwnProperty.call(piece, 'activeVariantId')) {
      errors.push({
        path: joinPath(path, 'activeVariantId'),
        message: 'a clipboard piece must not have activeVariantId',
      });
    }
    return;
  }

  const variantsPath = joinPath(path, 'variants');
  const activeVariantIdPath = joinPath(path, 'activeVariantId');
  const activeIsString =
    typeof piece.activeVariantId === 'string' && piece.activeVariantId !== '';
  if (!activeIsString) {
    errors.push({ path: activeVariantIdPath, message: 'must be a non-empty string' });
  }

  if (!Array.isArray(piece.variants) || piece.variants.length === 0) {
    errors.push({ path: variantsPath, message: 'must be a non-empty array' });
    return;
  }

  const variantIds = new Set();
  piece.variants.forEach((variant, i) => {
    validateVariantShape(variant, `${variantsPath}[${i}]`, errors, variantIds);
  });

  if (activeIsString && !variantIds.has(piece.activeVariantId)) {
    errors.push({
      path: activeVariantIdPath,
      message: "must name one of this piece's variants",
    });
  }
}

function validateStackShape(stack, path, errors) {
  if (!isPlainObject(stack)) {
    errors.push({ path, message: 'must be an object' });
    return;
  }
  checkUnknownKeys(stack, STACK_KEYS, path, errors);

  validateNonEmptyString(stack.id, joinPath(path, 'id'), errors);
  validateNonEmptyString(stack.name, joinPath(path, 'name'), errors);

  if (!ACCENTS.includes(stack.accent)) {
    errors.push({
      path: joinPath(path, 'accent'),
      message: `must be one of ${ACCENTS.join(', ')}`,
    });
  }

  if (typeof stack.separator !== 'string') {
    errors.push({ path: joinPath(path, 'separator'), message: 'must be a string' });
  }

  const piecesPath = joinPath(path, 'pieces');
  if (!Array.isArray(stack.pieces) || stack.pieces.length === 0) {
    errors.push({ path: piecesPath, message: 'must be a non-empty array' });
    return;
  }

  const pieceIds = new Set();
  let clipboardCount = 0;
  stack.pieces.forEach((piece, i) => {
    validatePieceShape(piece, `${piecesPath}[${i}]`, errors, pieceIds);
    if (isPlainObject(piece) && piece.kind === 'clipboard') {
      clipboardCount += 1;
    }
  });

  if (clipboardCount !== 1) {
    errors.push({
      path: piecesPath,
      message: `exactly one piece must have kind "clipboard" (found ${clipboardCount})`,
    });
  }
}

function deepClone(value) {
  return structuredClone(value);
}

/**
 * Validates a full application state object against every rule in spec §3:
 * schema version, settings shape, non-empty stacks with a matching
 * `activeStackId`, and every stack/piece/variant rule (see `validateStack`
 * for the per-stack rules). Unknown keys are rejected at every level. Takes
 * the candidate `input` (of unknown shape) and returns
 * `{ ok: true, value }` with `value` a deep copy of `input` on success, or
 * `{ ok: false, errors }` with every violation found (not just the first) as
 * `{ path, message }` objects using dotted/bracket path notation (e.g.
 * `stacks[0].pieces[2].activeVariantId`). Never throws.
 */
export function validateState(input) {
  const errors = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ path: '', message: 'must be an object' }] };
  }

  checkUnknownKeys(input, STATE_KEYS, '', errors);

  if (input.version !== SCHEMA_VERSION) {
    errors.push({ path: 'version', message: `must be ${SCHEMA_VERSION}` });
  }

  if (!isPlainObject(input.settings)) {
    errors.push({ path: 'settings', message: 'must be an object' });
  } else {
    checkUnknownKeys(input.settings, SETTINGS_KEYS, 'settings', errors);
    if (!THEMES.includes(input.settings.theme)) {
      errors.push({
        path: 'settings.theme',
        message: `must be one of ${THEMES.join(', ')}`,
      });
    }
    if (!DENSITIES.includes(input.settings.density)) {
      errors.push({
        path: 'settings.density',
        message: `must be one of ${DENSITIES.join(', ')}`,
      });
    }
  }

  const stackIds = new Set();
  if (!Array.isArray(input.stacks) || input.stacks.length === 0) {
    errors.push({ path: 'stacks', message: 'must be a non-empty array' });
  } else {
    input.stacks.forEach((stack, i) => {
      const path = `stacks[${i}]`;
      validateStackShape(stack, path, errors);
      if (isPlainObject(stack) && typeof stack.id === 'string' && stack.id !== '') {
        if (stackIds.has(stack.id)) {
          errors.push({ path: joinPath(path, 'id'), message: `duplicate id "${stack.id}"` });
        }
        stackIds.add(stack.id);
      }
    });
  }

  if (typeof input.activeStackId !== 'string' || input.activeStackId === '') {
    errors.push({ path: 'activeStackId', message: 'must be a non-empty string' });
  } else if (stackIds.size > 0 && !stackIds.has(input.activeStackId)) {
    errors.push({ path: 'activeStackId', message: 'must name one of the stacks' });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: deepClone(input) };
}

/**
 * Validates a bare stack object (the shape used by the share-link import,
 * wrapped as `{ version: 1, stack }`) against the stack rules in spec §3:
 * required fields, a valid accent, exactly one clipboard piece with no
 * variants, every other piece with a non-empty variants array and a matching
 * `activeVariantId`, and unique ids throughout. Unknown keys are rejected at
 * every level. Takes the candidate `input` and returns `{ ok: true, value }`
 * with `value` a deep copy of `input` on success, or `{ ok: false, errors }`
 * with every violation found, using the same path notation as
 * `validateState` but rooted at the stack itself (e.g.
 * `pieces[2].activeVariantId`). Never throws.
 */
export function validateStack(input) {
  const errors = [];
  validateStackShape(input, '', errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: deepClone(input) };
}

/**
 * Migrates a stored state object of any known schema version up to
 * `SCHEMA_VERSION`, validating the result. Takes the raw `input` (typically
 * `JSON.parse` of the stored string) and returns a validated state object at
 * the current schema version. Only version `1` exists today, so a version-1
 * input is simply validated and returned; a future version 2 is meant to be
 * added as one more `switch` branch that upgrades the object's shape before
 * falling into (or repeating) the version-1 validation, not a rewrite of
 * this function. Throws an `Error` with an `.errors` array (same shape as
 * `validateState`'s failure case) when `input` is not an object, its version
 * is unrecognized, or it fails validation.
 */
export function migrate(input) {
  if (!isPlainObject(input)) {
    const error = new Error('Cannot migrate: input is not an object');
    error.errors = [{ path: '', message: 'must be an object' }];
    throw error;
  }

  switch (input.version) {
    case 1: {
      const result = validateState(input);
      if (!result.ok) {
        const error = new Error('Cannot migrate: version 1 data failed validation');
        error.errors = result.errors;
        throw error;
      }
      return result.value;
    }
    default: {
      const error = new Error(`Cannot migrate: unsupported version ${input.version}`);
      error.errors = [
        { path: 'version', message: `unsupported version ${input.version}` },
      ];
      throw error;
    }
  }
}
