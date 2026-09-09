// qr.js — a dependency-free QR Code encoder, written directly from
// ISO/IEC 18004. Byte mode only, error correction level M, automatic
// version selection (1-40), standard data masking with penalty scoring.
// See docs/spec/2026-09-09-w-copy-technical-spec.md §4.5, §7.4, §12 (this
// draws to a <canvas>, never a data: image or inline script, per the CSP).
//
// The file is laid out in the order the standard builds a symbol:
//   1. GF(256) arithmetic and Reed-Solomon error correction
//   2. Per-version capacity tables (level M only — the one level this app uses)
//   3. Bit-stream / codeword assembly (mode, count, data, padding)
//   4. Version selection
//   5. Matrix construction: function patterns (finder/timing/alignment/etc.)
//   6. Data placement (the "zigzag" scan)
//   7. Masking and penalty scoring
//   8. Format/version information
//   9. Public API: encodeQR, drawQR
//
// Throughout, a module's position is (row, col), 0-indexed from the top
// left, matching how the output `modules` bitmap is laid out (row-major).

// ---------------------------------------------------------------------------
// 1. GF(256) arithmetic and Reed-Solomon error correction
//
// QR's error correction codewords are Reed-Solomon parity bytes computed
// over GF(2^8) with the primitive polynomial x^8+x^4+x^3+x^2+1 (0x11D) and
// primitive element 2. `GF_EXP[i]` is 2^i in that field; `GF_LOG` is its
// inverse. Multiplication reduces to a table lookup: a*b = exp[log(a)+log(b)].
// ---------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512); // doubled so gfMul can index without a modulo
const GF_LOG = new Uint8Array(256);

(function buildGaloisTables() {
  let value = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d; // reduce mod the primitive polynomial
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Multiplies two polynomials (coefficient arrays, highest degree first) over GF(256). */
function polyMultiply(a, b) {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] ^= gfMul(a[i], b[j]);
    }
  }
  return result;
}

/**
 * Builds the Reed-Solomon generator polynomial of the given degree (the
 * number of error correction codewords a block needs): the product of
 * (x + 2^i) for i in [0, degree), per spec Annex A.
 */
function generatorPolynomial(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    poly = polyMultiply(poly, [1, GF_EXP[i]]);
  }
  return poly;
}

/**
 * Computes the Reed-Solomon remainder (the error correction codewords) for
 * one block of data codewords, by polynomial long division of the message
 * (shifted up by the generator's degree, i.e. padded with that many zero
 * coefficients) by the generator polynomial, entirely in GF(256). This is
 * the standard LFSR-style division: `result` holds the running remainder,
 * one input codeword is folded in at a time.
 */
function reedSolomonRemainder(dataCodewords, generator) {
  const numEc = generator.length - 1;
  const result = new Uint8Array(numEc);
  for (const codeword of dataCodewords) {
    const factor = codeword ^ result[0];
    result.copyWithin(0, 1);
    result[numEc - 1] = 0;
    for (let i = 0; i < numEc; i++) {
      result[i] ^= gfMul(generator[i + 1], factor);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 2. Capacity tables — error correction level M only
//
// For each version, the block structure used to split data codewords for
// interleaving (spec §Table 9 restricted to level M, this app's only
// level): the number of error correction codewords per block, and up to two
// groups of blocks (a symbol's blocks are not always equal-sized — the
// second group, when present, carries one extra data codeword per block).
// Verified internally consistent: for every row, ecPerBlock * totalBlocks +
// (g1Count*g1Len + g2Count*g2Len) equals the version's total codeword count.
// ---------------------------------------------------------------------------

// [ecCodewordsPerBlock, g1Count, g1Len, g2Count, g2Len], index 0 unused.
const EC_BLOCKS_M = [
  null,
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51],
  [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41],
  [24, 5, 41, 5, 42],
  [28, 7, 45, 3, 46],
  [28, 10, 46, 1, 47],
  [26, 9, 43, 4, 44],
  [26, 3, 44, 11, 45],
  [26, 3, 41, 13, 42],
  [26, 17, 42, 0, 0],
  [28, 17, 46, 0, 0],
  [28, 4, 47, 14, 48],
  [28, 6, 45, 14, 46],
  [28, 8, 47, 13, 48],
  [28, 19, 46, 4, 47],
  [28, 22, 45, 3, 46],
  [28, 3, 45, 23, 46],
  [28, 21, 45, 7, 46],
  [28, 19, 47, 10, 48],
  [28, 2, 46, 29, 47],
  [28, 10, 46, 23, 47],
  [28, 14, 46, 21, 47],
  [28, 14, 46, 23, 47],
  [28, 12, 47, 26, 48],
  [28, 6, 47, 34, 48],
  [28, 29, 46, 14, 47],
  [28, 13, 46, 32, 47],
  [28, 40, 47, 7, 48],
  [28, 18, 47, 31, 48],
];

function ecBlockInfo(version) {
  const [ecPerBlock, g1Count, g1Len, g2Count, g2Len] = EC_BLOCKS_M[version];
  return { ecPerBlock, g1Count, g1Len, g2Count, g2Len };
}

function dataCodewordCount(version) {
  const { g1Count, g1Len, g2Count, g2Len } = ecBlockInfo(version);
  return g1Count * g1Len + g2Count * g2Len;
}

/** Byte mode's character-count indicator is 8 bits through version 9, 16 above. */
function charCountBits(version) {
  return version <= 9 ? 8 : 16;
}

function symbolSize(version) {
  return version * 4 + 17;
}

// ---------------------------------------------------------------------------
// 3. Bit-stream / codeword assembly
// ---------------------------------------------------------------------------

class BitWriter {
  constructor() {
    this.bits = [];
  }
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }
  get length() {
    return this.bits.length;
  }
}

/**
 * Encodes `dataBytes` (the UTF-8 bytes of the share URL) as a byte-mode
 * segment, terminates and pads it out to exactly `dataCodewordCount(version)`
 * codewords, per spec §8.4: mode indicator, character count, data, a
 * terminator (up to four 0 bits), padding to a byte boundary, then the
 * standard alternating 0xEC/0x11 pad codewords.
 */
function buildDataCodewords(version, dataBytes) {
  const writer = new BitWriter();
  writer.push(0b0100, 4); // byte mode indicator
  writer.push(dataBytes.length, charCountBits(version));
  for (const byte of dataBytes) writer.push(byte, 8);

  const capacityBits = dataCodewordCount(version) * 8;
  const terminatorLength = Math.max(0, Math.min(4, capacityBits - writer.length));
  writer.push(0, terminatorLength);
  while (writer.length % 8 !== 0) writer.push(0, 1);

  const codewords = [];
  for (let i = 0; i < writer.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | writer.bits[i + j];
    codewords.push(byte);
  }

  let usePadA = true;
  while (codewords.length < dataCodewordCount(version)) {
    codewords.push(usePadA ? 0xec : 0x11);
    usePadA = !usePadA;
  }
  return codewords;
}

/**
 * Splits the data codewords into their blocks, computes each block's
 * Reed-Solomon error correction codewords, and interleaves both per spec
 * §8.6: data codewords round-robin across blocks (group 1 then group 2, in
 * order — the shorter group simply runs out first), then every block's
 * error correction codewords round-robin the same way.
 */
function interleaveWithErrorCorrection(version, dataCodewords) {
  const { ecPerBlock, g1Count, g1Len, g2Count, g2Len } = ecBlockInfo(version);
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < g1Count; i++, offset += g1Len) {
    blocks.push(dataCodewords.slice(offset, offset + g1Len));
  }
  for (let i = 0; i < g2Count; i++, offset += g2Len) {
    blocks.push(dataCodewords.slice(offset, offset + g2Len));
  }

  const generator = generatorPolynomial(ecPerBlock);
  const ecBlocks = blocks.map((block) => reedSolomonRemainder(block, generator));

  const result = [];
  const maxDataLen = Math.max(g1Len, g2Len);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of blocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const ec of ecBlocks) result.push(ec[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 4. Version selection
// ---------------------------------------------------------------------------

/**
 * The smallest version (1-40) whose level-M byte-mode capacity holds
 * `dataBytes`, including the mode indicator and that version's character
 * count width. Throws if even version 40 is too small.
 */
function chooseVersion(dataBytes) {
  for (let version = 1; version <= 40; version++) {
    const capacityBits = dataCodewordCount(version) * 8;
    const requiredBits = 4 + charCountBits(version) + dataBytes.length * 8;
    if (requiredBits <= capacityBits) return version;
  }
  throw new Error('qr: data too long to fit in a version 40 QR code at error correction level M');
}

// ---------------------------------------------------------------------------
// 5. Matrix construction — function patterns
//
// A `Matrix` tracks two parallel grids: the module values (dark/light) and
// which modules are "function modules" — finder/timing/alignment/format/
// version/dark-module cells that data placement and masking must never
// touch. Both are flat Uint8Arrays indexed by `row * size + col`.
// ---------------------------------------------------------------------------

class Matrix {
  constructor(size) {
    this.size = size;
    this.modules = new Uint8Array(size * size);
    this.isFunction = new Uint8Array(size * size);
  }
  idx(row, col) {
    return row * this.size + col;
  }
  get(row, col) {
    return this.modules[this.idx(row, col)];
  }
  /** Sets a module's value and marks it as a function module. */
  setFunction(row, col, dark) {
    const i = this.idx(row, col);
    this.modules[i] = dark ? 1 : 0;
    this.isFunction[i] = 1;
  }
  /** Sets a data module's value (never marks it as a function module). */
  setData(row, col, dark) {
    this.modules[this.idx(row, col)] = dark ? 1 : 0;
  }
  inBounds(row, col) {
    return row >= 0 && row < this.size && col >= 0 && col < this.size;
  }
}

/**
 * Draws one finder pattern (the concentric-square eye) plus its one-module
 * white separator, centered at (centerRow, centerCol) — i.e. 3 modules in
 * from the symbol's corner. Chebyshev ("chessboard") distance from the
 * center classifies each of the surrounding 9x9 modules: the 3x3 core and
 * the outer 7x7 border are dark (distance 0-1 and 3), the ring between them
 * and the separator are light (distance 2 and 4) — see spec §6.3.3/6.3.4.
 */
function drawFinderPattern(matrix, centerRow, centerCol) {
  for (let dr = -4; dr <= 4; dr++) {
    for (let dc = -4; dc <= 4; dc++) {
      const row = centerRow + dr;
      const col = centerCol + dc;
      if (!matrix.inBounds(row, col)) continue;
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      matrix.setFunction(row, col, dist !== 2 && dist !== 4);
    }
  }
}

/**
 * Draws one alignment pattern (a smaller concentric square) centered at
 * (centerRow, centerCol): dark center dot, light ring, dark outer ring —
 * spec §6.3.6.
 */
function drawAlignmentPattern(matrix, centerRow, centerCol) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      matrix.setFunction(centerRow + dr, centerCol + dc, dist !== 1);
    }
  }
}

/**
 * The row/column coordinates alignment pattern centers may fall on, per the
 * placement algorithm of spec Annex E: `numAlign` evenly-spaced-ish
 * positions from 6 to `size - 7`, computed rather than looked up from a
 * table (the same result the standard's own worked table gives, verified
 * for versions 2, 3, 4, 5, 6, 7, 14, and the version-32 special case against
 * the published table during development).
 */
function alignmentPatternPositions(version) {
  if (version === 1) return [];
  const size = symbolSize(version);
  const numAlign = Math.floor(version / 7) + 2;
  // Spacing between consecutive alignment centers, evenly dividing the
  // distance from the first (fixed at 6) to the last (fixed at size - 7) —
  // version 32 is the one documented exception, given its own fixed step.
  const step =
    version === 32 ? 26 : Math.floor((version * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2;
  const positions = new Array(numAlign);
  positions[0] = 6;
  let pos = size - 7;
  for (let i = numAlign - 1; i >= 1; i--) {
    positions[i] = pos;
    pos -= step;
  }
  return positions;
}

function drawAlignmentPatterns(matrix, version) {
  const positions = alignmentPatternPositions(version);
  const first = positions[0];
  const last = positions[positions.length - 1];
  for (const row of positions) {
    for (const col of positions) {
      // Skip the three combinations that would overlap a finder pattern.
      const overlapsFinder =
        (row === first && col === first) ||
        (row === first && col === last) ||
        (row === last && col === first);
      if (!overlapsFinder) drawAlignmentPattern(matrix, row, col);
    }
  }
}

function drawTimingPatterns(matrix) {
  const size = matrix.size;
  for (let i = 8; i < size - 8; i++) {
    matrix.setFunction(6, i, i % 2 === 0);
    matrix.setFunction(i, 6, i % 2 === 0);
  }
}

// ---------------------------------------------------------------------------
// 8. Format and version information (declared here, used while building the
// matrix — format info is written twice: once as a placeholder before data
// placement so those modules are reserved, once for real once the mask is
// chosen).
// ---------------------------------------------------------------------------

/**
 * The 15-bit format information string: 2 bits for the error correction
 * level (M = `00`) + 3 bits for the mask pattern, protected by a (15,5) BCH
 * code and XORed with the fixed mask 0x5412, per spec §8.9 / Annex C.
 */
function formatBits(maskPattern) {
  const ECC_M = 0b00;
  const data = (ECC_M << 3) | maskPattern;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return (((data << 10) | rem) ^ 0x5412) & 0x7fff;
}

/**
 * The 18-bit version information string for versions 7-40: 6 bits of
 * version number protected by a (18,6) BCH code, per spec §8.10 / Annex D.
 */
function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return ((version << 12) | rem) & 0x3ffff;
}

function drawFormatInfo(matrix, bits) {
  const size = matrix.size;
  const bit = (i) => (bits >>> i) & 1;

  for (let i = 0; i <= 5; i++) matrix.setFunction(i, 8, bit(i));
  matrix.setFunction(7, 8, bit(6));
  matrix.setFunction(8, 8, bit(7));
  matrix.setFunction(8, 7, bit(8));
  for (let i = 9; i < 15; i++) matrix.setFunction(8, 14 - i, bit(i));

  for (let i = 0; i < 8; i++) matrix.setFunction(8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) matrix.setFunction(size - 15 + i, 8, bit(i));

  matrix.setFunction(size - 8, 8, true); // the single always-dark module
}

function drawVersionInfo(matrix, version) {
  if (version < 7) return;
  const size = matrix.size;
  const bits = versionBits(version);
  const bit = (i) => (bits >>> i) & 1;
  for (let i = 0; i < 18; i++) {
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    matrix.setFunction(b, a, bit(i)); // top-right block
    matrix.setFunction(a, b, bit(i)); // bottom-left block (transposed)
  }
}

// ---------------------------------------------------------------------------
// 6. Data placement — the "zigzag" scan
//
// Codewords are placed as a single bitstream into every module the function
// patterns didn't already claim, sweeping two-module-wide columns from the
// bottom-right corner, alternating upward/downward per pair of columns, and
// skipping the vertical timing pattern's column entirely — spec §8.7.3.
// ---------------------------------------------------------------------------

function placeDataBits(matrix, bits) {
  const size = matrix.size;
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // never start a column pair on the timing column
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (matrix.isFunction[matrix.idx(row, col)] === 0) {
          const bit = bitIndex < bits.length ? bits[bitIndex] : 0; // remainder bits: 0
          matrix.setData(row, col, bit === 1);
          bitIndex++;
        }
      }
    }
  }
}

function codewordsToBits(codewords) {
  const bits = new Array(codewords.length * 8);
  let i = 0;
  for (const byte of codewords) {
    for (let b = 7; b >= 0; b--) bits[i++] = (byte >>> b) & 1;
  }
  return bits;
}

// ---------------------------------------------------------------------------
// 7. Masking and penalty scoring — spec §8.8
//
// XORing a data-dependent pattern over the symbol avoids large blank areas
// or sequences that could be mistaken for a finder pattern. All 8 standard
// mask formulas are tried; the four penalty rules score each candidate, and
// the lowest-scoring mask wins.
// ---------------------------------------------------------------------------

const MASK_FORMULAS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Applies mask `maskPattern` to a copy of `matrix`'s data modules and returns it. */
function applyMask(matrix, maskPattern) {
  const masked = new Matrix(matrix.size);
  masked.isFunction.set(matrix.isFunction);
  const formula = MASK_FORMULAS[maskPattern];
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      const i = matrix.idx(row, col);
      const value = matrix.modules[i];
      masked.modules[i] = matrix.isFunction[i] === 1 ? value : value ^ (formula(row, col) ? 1 : 0);
    }
  }
  return masked;
}

/** Penalty rule 1: runs of 5+ same-color modules in a row or column. */
function penaltyRuns(matrix) {
  const size = matrix.size;
  let total = 0;
  const scoreLine = (getValue) => {
    let runColor = -1;
    let runLen = 0;
    for (let i = 0; i < size; i++) {
      const v = getValue(i);
      if (v === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) total += 3 + (runLen - 5);
        runColor = v;
        runLen = 1;
      }
    }
    if (runLen >= 5) total += 3 + (runLen - 5);
  };
  for (let row = 0; row < size; row++) scoreLine((col) => matrix.get(row, col));
  for (let col = 0; col < size; col++) scoreLine((row) => matrix.get(row, col));
  return total;
}

/** Penalty rule 2: each 2x2 block of same-color modules. */
function penaltyBlocks(matrix) {
  const size = matrix.size;
  let total = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const v = matrix.get(row, col);
      if (
        v === matrix.get(row + 1, col) &&
        v === matrix.get(row, col + 1) &&
        v === matrix.get(row + 1, col + 1)
      ) {
        total += 3;
      }
    }
  }
  return total;
}

// The finder-pattern-like ratio 1:1:3:1:1, padded with 4 light modules on
// one side, in either direction (dark=1, light=0).
const FINDER_LIKE_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
const FINDER_LIKE_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

function matchesAt(getValue, start, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (getValue(start + i) !== pattern[i]) return false;
  }
  return true;
}

/** Penalty rule 3: a finder-pattern-like run appearing in a row or column. */
function penaltyFinderLike(matrix) {
  const size = matrix.size;
  let total = 0;
  const scoreLine = (getValue) => {
    for (let start = 0; start <= size - FINDER_LIKE_A.length; start++) {
      if (matchesAt(getValue, start, FINDER_LIKE_A)) total += 40;
      if (matchesAt(getValue, start, FINDER_LIKE_B)) total += 40;
    }
  };
  for (let row = 0; row < size; row++) scoreLine((col) => matrix.get(row, col));
  for (let col = 0; col < size; col++) scoreLine((row) => matrix.get(row, col));
  return total;
}

/** Penalty rule 4: how far the proportion of dark modules sits from 50%. */
function penaltyDarkRatio(matrix) {
  const total = matrix.size * matrix.size;
  let dark = 0;
  for (let i = 0; i < matrix.modules.length; i++) dark += matrix.modules[i];
  const percent = (dark * 100) / total;
  const below = Math.floor(percent / 5) * 5;
  const above = below + 5;
  const distance = Math.min(Math.abs(below - 50), Math.abs(above - 50)) / 5;
  return distance * 10;
}

function totalPenalty(matrix) {
  return penaltyRuns(matrix) + penaltyBlocks(matrix) + penaltyFinderLike(matrix) + penaltyDarkRatio(matrix);
}

/** Tries all 8 masks and returns `{ matrix, maskPattern }` for the lowest-penalty one. */
function chooseBestMask(matrix) {
  let best = null;
  for (let maskPattern = 0; maskPattern < 8; maskPattern++) {
    const candidate = applyMask(matrix, maskPattern);
    const penalty = totalPenalty(candidate);
    if (!best || penalty < best.penalty) {
      best = { matrix: candidate, maskPattern, penalty };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 9. Public API
// ---------------------------------------------------------------------------

/**
 * Encodes `text` as a QR Code: byte mode, error correction level M, the
 * smallest version (1-40) that fits, standard masking chosen by penalty
 * score. Takes the `text` string and returns `{ size, modules }`, where
 * `size` is the symbol's width/height in modules and `modules` is a
 * row-major `Uint8Array` of length `size * size` (1 = dark, 0 = light).
 * Throws if `text`'s UTF-8 encoding is too long even for version 40.
 */
export function encodeQR(text) {
  const dataBytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(dataBytes);
  const size = symbolSize(version);

  const dataCodewords = buildDataCodewords(version, dataBytes);
  const finalCodewords = interleaveWithErrorCorrection(version, dataCodewords);
  const dataBits = codewordsToBits(finalCodewords);

  const matrix = new Matrix(size);
  drawFinderPattern(matrix, 3, 3);
  drawFinderPattern(matrix, 3, size - 4);
  drawFinderPattern(matrix, size - 4, 3);
  drawTimingPatterns(matrix);
  drawAlignmentPatterns(matrix, version);
  drawVersionInfo(matrix, version);
  drawFormatInfo(matrix, formatBits(0)); // placeholder: reserves the cells

  placeDataBits(matrix, dataBits);

  const best = chooseBestMask(matrix);
  drawFormatInfo(best.matrix, formatBits(best.maskPattern)); // the real value

  return { size, modules: best.matrix.modules };
}

/**
 * Renders `text` as a QR Code onto `canvas` (a `<canvas>` element), drawing
 * with 2D canvas fills only — no `data:` image, no external resource, so
 * this satisfies the app's `img-src 'self' data:` CSP with room to spare (it
 * needs no image source at all). `scale` is the pixel size of one module
 * (default 8); `margin` is the quiet zone width in modules on every side
 * (default 4, the minimum the standard requires).
 */
export function drawQR(canvas, text, { scale = 8, margin = 4 } = {}) {
  const { size, modules } = encodeQR(text);
  const pixels = (size + margin * 2) * scale;
  canvas.width = pixels;
  canvas.height = pixels;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pixels, pixels);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (modules[row * size + col] === 1) {
        ctx.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
      }
    }
  }
  return { size, modules };
}
