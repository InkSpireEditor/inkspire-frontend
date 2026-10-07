import { describe, it, expect } from 'vitest'
import { cursorFromOffset } from './cursor'

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
