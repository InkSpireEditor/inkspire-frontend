/**
 * Where the caret is, as the API wants it: a paragraph index and an offset within it,
 * rather than one flat offset into the whole text.
 *
 * `MarkdownEditor.getCaretOffset()` answers a flat character offset, counted across
 * the whole rendered text -- separators between paragraphs included, since there is
 * nothing in the DOM to tell those apart from the paragraphs either side of them. The
 * API resolves a caret against its own paragraph split (`inkspire_api/prompt.py`'s
 * `cursor_from_offset`, used by its CLI for the same conversion), so this mirrors that
 * resolution rather than inventing a second one: a flat offset landing inside a
 * separator belongs to the end of the paragraph before it, and one before the first
 * paragraph belongs to the very start of the body.
 *
 * Kept here rather than inline in `Text.vue` for the reason `loreGraph.ts` is its own
 * file: this has no DOM in it, so it is unit-testable on its own.
 */
import { splitParagraphs } from './provenance'

/** A caret's position: the paragraph it is in, and the offset within it. */
export interface Cursor {
  para: number
  offset: number
}

/**
 * A selection's anchor: where it starts and where it ends.
 *
 * Named `CursorRange`, not `Selection` -- `Selection` is a DOM global, and shadowing
 * it in a module imported into components that also touch `window.getSelection()`
 * is a real footgun, not a stylistic one.
 */
export interface CursorRange {
  start: Cursor
  end: Cursor
}

/**
 * `offset`, a flat character position into `body`, as a `Cursor`.
 *
 * A body with no paragraphs at all -- empty, or nothing but blank lines -- has
 * nothing to address, and resolves to the origin; a generation against such a file
 * is refused before this is ever called (`Text.vue`'s own empty-file guard).
 */
export function cursorFromOffset(body: string, offset: number): Cursor {
  const { paras, seps } = splitParagraphs(body)
  if (paras.length === 0) {
    return { para: 0, offset: 0 }
  }

  const clamped = Math.max(0, Math.min(offset, body.length))
  let position = 0
  for (let i = 0; i < paras.length; i++) {
    // `seps` has one more entry than `paras` and `i` never reaches that one here, so
    // both of these are always within bounds.
    const start = position + seps[i]!.length
    const end = start + paras[i]!.length
    if (clamped < start) {
      // Inside the separator before paragraph i -- the end of the one before it, or
      // the very start of the body if there is no paragraph before it.
      return i === 0 ? { para: 0, offset: 0 } : { para: i - 1, offset: paras[i - 1]!.length }
    }
    if (clamped <= end) {
      return { para: i, offset: clamped - start }
    }
    position = end
  }

  // Past the end -- inside the body's own closing separator, or beyond it -- lands
  // at the end of the last paragraph.
  return { para: paras.length - 1, offset: paras[paras.length - 1]!.length }
}

/**
 * `start` and `end`, two flat character positions into `body`, as a `CursorRange`.
 *
 * Normalises an inverted pair -- a selection the writer dragged from its end back to
 * its start reports that way in the DOM -- so the API never sees one from this
 * client; it would otherwise reject it as `InvertedRange`.
 */
export function rangeFromOffsets(body: string, start: number, end: number): CursorRange {
  const [lo, hi] = start <= end ? [start, end] : [end, start]
  return { start: cursorFromOffset(body, lo), end: cursorFromOffset(body, hi) }
}
