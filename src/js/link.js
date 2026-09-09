// Stack <-> URL fragment codec, for the cross-device share link.
// See docs/spec/2026-09-09-w-copy-technical-spec.md §4.5.
//
// Encoding: JSON.stringify({ version: 1, stack }) -> UTF-8 bytes ->
// CompressionStream('deflate') -> base64url (no padding). Both
// CompressionStream and DecompressionStream, and btoa/atob, are global in
// Node 18+ and in every targeted browser, so this module needs no imports
// beyond schema.js for validation.

import { validateStack } from './schema.js';

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function readStreamToBytes(readable) {
  const reader = readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// A CompressionStream/DecompressionStream's writable side can reject its
// own write()/close() promises with the same error that also rejects the
// readable side's read(). We surface the error once, via the readable side
// in readStreamToBytes; the writable side's promises are otherwise left
// unhandled, so every write()/close() here is given a no-op `catch` to
// avoid an unhandledRejection.

async function compress(bytes) {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  return readStreamToBytes(stream.readable);
}

async function decompress(bytes) {
  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  return readStreamToBytes(stream.readable);
}

function invalidShareLinkError(message, errors) {
  const error = new Error(message);
  error.errors = errors;
  return error;
}

/**
 * Encodes a single stack object into a compact, URL-safe string suitable for
 * a share link: `JSON.stringify({ version: 1, stack })`, UTF-8 encoded,
 * compressed with `CompressionStream('deflate')`, then base64url-encoded
 * with no `+`, `/`, or `=` characters. Takes the `stack` object and returns
 * a `Promise` resolving to the encoded string. Does not validate `stack`;
 * callers should only encode stacks that already passed `validateStack`.
 */
export async function encodeStack(stack) {
  const json = JSON.stringify({ version: 1, stack });
  const bytes = new TextEncoder().encode(json);
  const compressed = await compress(bytes);
  return bytesToBase64Url(compressed);
}

/**
 * Decodes a string produced by `encodeStack` back into a validated stack
 * object: reverses the base64url encoding, decompresses with
 * `DecompressionStream('deflate')`, parses the resulting JSON, checks its
 * `version` is `1`, and runs `validateStack` on the wrapped stack. Takes the
 * encoded `str` and returns a `Promise` resolving to the validated stack
 * object. Throws an `Error` with an `.errors` array (`{ path, message }`
 * entries, the same shape `validateStack` produces) when the string is not
 * valid base64url, does not decompress, is not valid JSON, has an
 * unsupported version, or contains a stack that fails validation.
 */
export async function decodeStack(str) {
  let compressed;
  try {
    compressed = base64UrlToBytes(str);
  } catch {
    throw invalidShareLinkError('Invalid share link: could not decode', [
      { path: '', message: 'not a valid base64url string' },
    ]);
  }

  let jsonText;
  try {
    const decompressed = await decompress(compressed);
    jsonText = new TextDecoder().decode(decompressed);
  } catch {
    throw invalidShareLinkError('Invalid share link: could not decompress', [
      { path: '', message: 'not valid deflate-compressed data' },
    ]);
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw invalidShareLinkError('Invalid share link: not valid JSON', [
      { path: '', message: 'decompressed content is not valid JSON' },
    ]);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalidShareLinkError('Invalid share link: malformed payload', [
      { path: '', message: 'must be an object' },
    ]);
  }

  if (parsed.version !== 1) {
    throw invalidShareLinkError('Invalid share link: unsupported version', [
      { path: 'version', message: 'must be 1' },
    ]);
  }

  const result = validateStack(parsed.stack);
  if (!result.ok) {
    throw invalidShareLinkError(
      'Invalid share link: stack failed validation',
      result.errors,
    );
  }

  return result.value;
}

/**
 * Builds the full share URL for an already-encoded stack string. Takes the
 * `encoded` string and an `origin` (defaulting to `location.origin`, so
 * callers running outside a browser, such as tests, should pass one
 * explicitly) and returns `` `${origin}/#s=${encoded}` ``. Never throws.
 */
export function buildShareUrl(encoded, origin = location.origin) {
  return `${origin}/#s=${encoded}`;
}

/**
 * Extracts the encoded stack string from a URL fragment, e.g. `location.hash`
 * of the form `#s=<encoded>`. Takes the `hash` string (with or without its
 * leading `#`) and returns the value of its `s` parameter, or `null` if
 * `hash` is not a string or carries no `s` parameter. Never throws.
 */
export function parseShareFragment(hash) {
  if (typeof hash !== 'string') return null;
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(withoutHash);
  const value = params.get('s');
  return value && value.length > 0 ? value : null;
}
