import { describe, it, expect } from 'vitest'
import { countEntries, foldTail, NO_STATUS, resolveRecent, statusBars, sumBars, wordBars } from './homeStats'
import type { DirEntry, FileEntry, TreeApiResponse } from './filesManager'

const file = (id: string, status = ''): FileEntry => ({ id, name: id, status })
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

describe('statusBars', () => {
  it('counts the chapters and one-shots under each status, the most common first', () => {
    const stories = tree(
      [dir('s1', [file('a', 'draft'), file('b', 'done'), file('c', 'draft')])],
      [file('o', 'draft')]
    )
    expect(statusBars(stories)).toEqual([
      { label: 'draft', value: 3 },
      { label: 'done', value: 1 }
    ])
  })

  it('counts a file with no status under a label of its own', () => {
    const bars = statusBars(tree([dir('s1', [file('a'), file('b', '  '), file('c', 'done')])]))
    expect(bars).toContainEqual({ label: NO_STATUS, value: 2 })
  })

  it('breaks a tie by name', () => {
    const bars = statusBars(tree([dir('s1', [file('a', 'revised'), file('b', 'done')])]))
    expect(bars.map((bar) => bar.label)).toEqual(['done', 'revised'])
  })

  it('is empty for a tree with no files', () => {
    expect(statusBars(tree([dir('s1', [])]))).toEqual([])
  })
})

describe('wordBars', () => {
  const words = { a: 100, b: 50, c: 300, o: 20 }

  it('sums the words of a story\'s chapters, the story with the most first', () => {
    const bars = wordBars(tree([dir('s1', [file('a'), file('b')]), dir('s2', [file('c')])]), words)
    expect(bars).toEqual([
      { label: 's2', value: 300, detail: '1 chapter' },
      { label: 's1', value: 150, detail: '2 chapters' }
    ])
  })

  it('gives a one-shot a bar of its own', () => {
    const bars = wordBars(tree([], [file('o')]), words)
    expect(bars).toEqual([{ label: 'o', value: 20, detail: 'One-shot' }])
  })

  it('counts a chapter whose prose could not be fetched as nothing', () => {
    const bars = wordBars(tree([dir('s1', [file('a'), file('missing')])]), words)
    expect(bars[0]?.value).toBe(100)
  })
})

describe('foldTail', () => {
  const bars = [10, 8, 6, 4, 2].map((value, i) => ({ label: `b${i}`, value }))

  it('leaves a short list alone', () => {
    expect(foldTail(bars, 5, 'Other')).toEqual(bars)
  })

  it('folds everything past the limit into one bar that makes the limit', () => {
    const folded = foldTail(bars, 3, 'Other')
    expect(folded).toHaveLength(3)
    expect(folded[2]).toEqual({ label: 'Other', value: 12, detail: '3 more' })
  })

  it('keeps the total', () => {
    expect(sumBars(foldTail(bars, 3, 'Other'))).toBe(sumBars(bars))
  })
})
