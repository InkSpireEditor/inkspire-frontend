import { describe, it, expect } from 'vitest'
import { allTags, MAX_TAG_LENGTH, normaliseTag, withoutTag, withTag } from './tags'
import type { TreeApiResponse } from './filesManager'

describe('normaliseTag', () => {
  it('trims and lowercases', () => {
    expect(normaliseTag('  Perso ')).toBe('perso')
  })

  it('allows digits, dashes and underscores', () => {
    expect(normaliseTag('to-revise_2')).toBe('to-revise_2')
  })

  it.each(['', '   ', 'two words', 'perso!', 'café', 'a,b'])('refuses %j', (value) => {
    expect(normaliseTag(value)).toBeNull()
  })

  it('allows exactly the longest length and refuses one more', () => {
    expect(normaliseTag('x'.repeat(MAX_TAG_LENGTH))).toBe('x'.repeat(MAX_TAG_LENGTH))
    expect(normaliseTag('x'.repeat(MAX_TAG_LENGTH + 1))).toBeNull()
  })
})

describe('withTag and withoutTag', () => {
  it('adds at the end and leaves the original alone', () => {
    const tags = ['a']
    expect(withTag(tags, 'b')).toEqual(['a', 'b'])
    expect(tags).toEqual(['a'])
  })

  it('does not add a tag twice', () => {
    expect(withTag(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })

  it('removes one tag and keeps the order of the rest', () => {
    expect(withoutTag(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
    expect(withoutTag(['a'], 'z')).toEqual(['a'])
  })
})

describe('allTags', () => {
  const stories: TreeApiResponse = {
    dirs: [
      {
        id: 'd1',
        name: 'Foo',
        summary: '',
        files: [
          { id: 'f1', name: 'One', status: '', tags: ['perso', 'priority'] },
          { id: 'f2', name: 'Two', status: '' }
        ]
      }
    ],
    files: [{ id: 'f3', name: 'Solo', status: '', tags: ['priority'] }]
  } as TreeApiResponse
  const notes: TreeApiResponse = {
    dirs: [],
    files: [{ id: 'n1', name: 'Bar', status: '', tags: ['idea', 'perso'] }]
  } as TreeApiResponse

  it('lists each tag once, alphabetically, across files, directories and trees', () => {
    expect(allTags(stories, notes)).toEqual(['idea', 'perso', 'priority'])
  })

  it('lists none for trees whose files carry none, or for no tree', () => {
    expect(allTags({ dirs: [], files: [{ id: 'x', name: 'X', status: '' }] } as TreeApiResponse)).toEqual([])
    expect(allTags()).toEqual([])
  })
})
