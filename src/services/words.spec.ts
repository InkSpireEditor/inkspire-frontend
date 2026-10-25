import { describe, it, expect } from 'vitest'
import { countWords } from './words'

describe('countWords', () => {
  it('counts nothing in an empty text or one of whitespace', () => {
    expect(countWords('')).toBe(0)
    expect(countWords(' \n\t ')).toBe(0)
  })

  it('counts the runs between spaces, lines and tabs', () => {
    expect(countWords('one two\nthree\tfour')).toBe(4)
  })

  it('does not count the whitespace around a text or repeated inside it', () => {
    expect(countWords('  one   two \n\n three  ')).toBe(3)
  })
})
