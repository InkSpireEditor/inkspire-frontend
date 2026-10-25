import { describe, it, expect } from 'vitest'
import { countEntries, resolveRecent } from './homeStats'
import type { DirEntry, FileEntry, TreeApiResponse } from './filesManager'

const file = (id: string): FileEntry => ({ id, name: id, status: '' })
const dir = (id: string, files: FileEntry[]): DirEntry => ({ id, name: id, summary: '', files })
const tree = (dirs: DirEntry[], files: FileEntry[] = []): TreeApiResponse => ({ dirs, files })

describe('countEntries', () => {
  it('counts nothing in two empty trees', () => {
    expect(countEntries(tree([]), tree([]))).toEqual({
      stories: 0,
      chapters: 0,
      oneShots: 0,
      notesFolders: 0,
      notes: 0
    })
  })

  it('counts a story per directory and a chapter per file in one', () => {
    const stories = tree([dir('a', [file('1'), file('2')]), dir('b', [file('3')]), dir('c', [])])
    const counts = countEntries(stories, tree([]))
    expect(counts.stories).toBe(3)
    expect(counts.chapters).toBe(3)
  })

  it('counts a file at the root of the stories tree as a one-shot, not a chapter', () => {
    const stories = tree([dir('a', [file('1')])], [file('x'), file('y')])
    const counts = countEntries(stories, tree([]))
    expect(counts.oneShots).toBe(2)
    expect(counts.chapters).toBe(1)
  })

  it('counts notes in folders and at the root of the notes tree together', () => {
    const notes = tree([dir('f', [file('1'), file('2')]), dir('g', [])], [file('r')])
    const counts = countEntries(tree([]), notes)
    expect(counts.notesFolders).toBe(2)
    expect(counts.notes).toBe(3)
  })
})

describe('resolveRecent', () => {
  const stories = tree([dir('s1', [file('c1'), file('c2')])], [file('o1')])
  const notes = tree([dir('f1', [file('n1')])], [file('n2')])
  const trees = { stories, notes }

  it('finds a chapter with its story, and keeps the order recorded', () => {
    expect(
      resolveRecent(
        [
          { space: 'stories', id: 'c2' },
          { space: 'stories', id: 'c1' }
        ],
        trees
      ).map((one) => [one.id, one.dir?.id])
    ).toEqual([
      ['c2', 's1'],
      ['c1', 's1']
    ])
  })

  it('finds a one-shot and a note at the root with no directory', () => {
    const found = resolveRecent(
      [
        { space: 'stories', id: 'o1' },
        { space: 'notes', id: 'n2' }
      ],
      trees
    )
    expect(found.map((one) => one.dir)).toEqual([null, null])
  })

  it('finds a note in a folder with the folder', () => {
    const [found] = resolveRecent([{ space: 'notes', id: 'n1' }], trees)
    expect(found).toEqual({ space: 'notes', id: 'n1', name: 'n1', dir: { id: 'f1', name: 'f1' } })
  })

  it('leaves out a file that is no longer in its tree', () => {
    expect(resolveRecent([{ space: 'stories', id: 'gone' }], trees)).toEqual([])
  })

  it('looks only in the space the file was opened in', () => {
    expect(resolveRecent([{ space: 'notes', id: 'c1' }], trees)).toEqual([])
  })
})
