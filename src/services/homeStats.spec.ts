import { describe, it, expect } from 'vitest'
import { countEntries } from './homeStats'
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
