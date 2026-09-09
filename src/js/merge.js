// Pure assembly of the output text from a stack and the current clipboard
// text. No DOM access, no globals beyond plain JavaScript.
// See docs/spec/2026-09-09-w-copy-technical-spec.md §4.2.

/**
 * Reports whether a stack needs the current clipboard content to assemble
 * its output, i.e. whether its clipboard piece is enabled. Takes a `stack`
 * object and returns a boolean. Never throws for a well-formed stack.
 */
export function needsClipboard(stack) {
  const clipboardPiece = stack.pieces.find((piece) => piece.kind === 'clipboard');
  return Boolean(clipboardPiece && clipboardPiece.enabled);
}

/**
 * Assembles the output text for a stack, per spec §4.2's algorithm: enabled
 * pieces are taken in order; the clipboard piece contributes `clipboardText`
 * unchanged; every other piece contributes its active variant's text with
 * trailing whitespace stripped (leading whitespace kept); segments that are
 * empty after trimming are dropped, except that an enabled clipboard piece
 * whose text is empty or whitespace-only immediately fails the whole
 * assembly; segments are joined with `stack.separator`. Takes the `stack`
 * object and the `clipboardText` string, and returns `{ ok: true, text }` on
 * success or `{ ok: false, reason }` with `reason` one of `'EMPTY_STACK'`
 * (no segments remained) or `'EMPTY_CLIPBOARD'` (the clipboard piece is
 * enabled but empty). Pure and synchronous; never throws for a well-formed
 * stack.
 */
export function assemble(stack, clipboardText) {
  const segments = [];

  for (const piece of stack.pieces) {
    if (!piece.enabled) continue;

    if (piece.kind === 'clipboard') {
      if (clipboardText.trim() === '') {
        return { ok: false, reason: 'EMPTY_CLIPBOARD' };
      }
      segments.push(clipboardText);
      continue;
    }

    const variant = piece.variants.find((v) => v.id === piece.activeVariantId);
    const text = (variant ? variant.text : '').replace(/\s+$/, '');
    if (text === '') continue;
    segments.push(text);
  }

  if (segments.length === 0) {
    return { ok: false, reason: 'EMPTY_STACK' };
  }

  return { ok: true, text: segments.join(stack.separator) };
}

/**
 * Implements the growth-edge-case guard from the design handoff §2: reports
 * whether `clipboardText` is exactly the string the app last wrote to the
 * clipboard, meaning nothing new was copied since the last w/copy press and
 * the action should be skipped rather than re-wrapping the app's own prior
 * output. Takes the current `clipboardText` and the `lastOutput` string (or
 * `null` when nothing has been written yet) and returns a boolean; always
 * `false` when `lastOutput` is `null`. Uses exact string equality only, per
 * the handoff's explicit rejection of content-pattern heuristics. Never
 * throws.
 */
export function shouldSkip(clipboardText, lastOutput) {
  if (lastOutput === null) return false;
  return clipboardText === lastOutput;
}
