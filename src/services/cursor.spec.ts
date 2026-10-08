import { describe, it, expect } from 'vitest'
import { cursorFromOffset, rangeFromOffsets } from './cursor'

describe('cursorFromOffset', () => {
  const body = 'One.\n\nTwo.\n'

  it('resolves an offset inside a paragraph', () => {
    expect(cursorFromOffset(body, 0)).toEqual({ para: 0, offset: 0 })
    expect(cursorFromOffset(body, 3)).toEqual({ para: 0, offset: 3 })
  })

  it('resolves an offset exactly at the end of a paragraph', () => {
    expect(cursorFromOffset(body, 4)).toEqual({ para: 0, offset: 4 })
  })

  it('resolves an offset inside the separator to the end of the paragraph before it', () => {
    // Offset 5 sits inside the blank line between "One." and "Two.".
    expect(cursorFromOffset(body, 5)).toEqual({ para: 0, offset: 4 })
  })

  it('resolves an offset exactly at the start of the next paragraph', () => {
    expect(cursorFromOffset(body, 6)).toEqual({ para: 1, offset: 0 })
  })

  it('resolves an offset past the end to the end of the last paragraph', () => {
    expect(cursorFromOffset(body, 1000)).toEqual({ para: 1, offset: 4 })
  })

  it('resolves an offset before the first paragraph to the very start', () => {
    expect(cursorFromOffset('\n\nOne.\n', 1)).toEqual({ para: 0, offset: 0 })
  })

  it('resolves on a blank-only body to the origin', () => {
    expect(cursorFromOffset('\n\n\n', 1)).toEqual({ para: 0, offset: 0 })
  })

  it('resolves a negative offset the same as zero', () => {
    expect(cursorFromOffset(body, -5)).toEqual({ para: 0, offset: 0 })
  })
})

describe('rangeFromOffsets', () => {
  const body = 'One.\n\nTwo.\n\nThree.\n'

  it('resolves both ends', () => {
    expect(rangeFromOffsets(body, 6, 10)).toEqual({
      start: { para: 1, offset: 0 },
      end: { para: 1, offset: 4 },
    })
  })

  it('normalises a pair dragged from its end back to its start', () => {
    expect(rangeFromOffsets(body, 10, 6)).toEqual({
      start: { para: 1, offset: 0 },
      end: { para: 1, offset: 4 },
    })
  })

  it('collapses equal offsets to one cursor used twice', () => {
    const range = rangeFromOffsets(body, 2, 2)
    expect(range.start).toEqual(range.end)
    expect(range.start).toEqual({ para: 0, offset: 2 })
  })

  it('resolves a span sitting entirely inside a separator, each end on its own', () => {
    // Offsets 4 and 6 sit either side of the blank line between "One." and "Two.".
    // Nothing collapses here -- that degeneration (a whitespace-only selection
    // behaving as a caret) is `inkspire_api/prompt.py`'s `_resolve_sides`, not this
    // function, which only resolves each end against the paragraph split.
    expect(rangeFromOffsets(body, 4, 6)).toEqual({
      start: { para: 0, offset: 4 },
      end: { para: 1, offset: 0 },
    })
  })
})
