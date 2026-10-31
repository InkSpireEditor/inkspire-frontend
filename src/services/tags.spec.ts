import { describe, it, expect } from 'vitest'
import {
  allTags,
  filterNodes,
  hasAllTags,
  MAX_TAG_LENGTH,
  normaliseTag,
  refusalMessage,
  refusedBy,
  tagsOfNodes,
  withoutTag,
  withTag
} from './tags'
import type { FileSystemNode, TreeApiResponse } from './filesManager'

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

describe('hasAllTags', () => {
  it('needs every wanted tag', () => {
    expect(hasAllTags(['a', 'b', 'c'], ['a', 'c'])).toBe(true)
    expect(hasAllTags(['a', 'b'], ['a', 'c'])).toBe(false)
  })

  it('is satisfied by anything when nothing is wanted, and by nothing without tags otherwise', () => {
    expect(hasAllTags(undefined, [])).toBe(true)
    expect(hasAllTags(undefined, ['a'])).toBe(false)
    expect(hasAllTags([], ['a'])).toBe(false)
  })
})

describe('tags of a tree and filtering it', () => {
  const file = (id: string, tags?: string[]): FileSystemNode => ({ id, name: id, type: 'F', tags })
  const story = (id: string, children: FileSystemNode[]): FileSystemNode => ({
    id,
    name: id,
    type: 'D',
    children
  })
  const nodes: FileSystemNode[] = [
    story('s1', [file('a', ['perso', 'idea']), file('b', ['idea']), file('c')]),
    story('s2', [file('d')]),
    story('s3', []),
    file('solo', ['perso'])
  ]

  it('lists the tags of every file, in a directory or at the root, once and in order', () => {
    expect(tagsOfNodes(nodes)).toEqual(['idea', 'perso'])
  })

  it('lists none for a tree with no tag', () => {
    expect(tagsOfNodes([story('s', [file('a')])])).toEqual([])
    expect(tagsOfNodes([])).toEqual([])
  })

  it('keeps everything when no tag is wanted', () => {
    expect(filterNodes(nodes, [])).toEqual(nodes)
  })

  it('keeps the files with the tag, and only the directories that hold one', () => {
    const kept = filterNodes(nodes, ['idea'])
    expect(kept.map((node) => node.id)).toEqual(['s1'])
    expect(kept[0]!.children!.map((child) => child.id)).toEqual(['a', 'b'])
  })

  it('needs all of several tags on one file', () => {
    const kept = filterNodes(nodes, ['perso', 'idea'])
    expect(kept.map((node) => node.id)).toEqual(['s1'])
    expect(kept[0]!.children!.map((child) => child.id)).toEqual(['a'])
  })

  it('keeps a file at the root that has the tag', () => {
    expect(filterNodes(nodes, ['perso']).map((node) => node.id)).toEqual(['s1', 'solo'])
  })

  it('leaves nothing for a tag no file has', () => {
    expect(filterNodes(nodes, ['absent'])).toEqual([])
  })

  it('does not change the tree it is given', () => {
    const before = JSON.stringify(nodes)
    filterNodes(nodes, ['idea'])
    expect(JSON.stringify(nodes)).toBe(before)
  })
})

describe('refusedBy', () => {
  it('answers the first tag of the file that the provider refuses', () => {
    expect(refusedBy(['perso', 'draft'], ['idea', 'draft', 'perso'])).toBe('draft')
  })

  it('answers null when none is refused, or nothing is', () => {
    expect(refusedBy(['perso'], ['idea'])).toBeNull()
    expect(refusedBy([], ['perso'])).toBeNull()
    expect(refusedBy(['perso'], [])).toBeNull()
  })
})

describe('refusalMessage', () => {
  it("is the API's sentence, naming the provider and the tag", () => {
    expect(refusalMessage('hosted/big', 'perso')).toBe('"hosted" is not used for files tagged "perso".')
  })
})
