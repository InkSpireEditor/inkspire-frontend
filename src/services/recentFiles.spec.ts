import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { MAX_RECENT, loadRecent, remember, saveRecent, trackRecentFiles } from './recentFiles'
import { useSharedFiles } from './sharedFiles'

const file = (id: string, space: 'stories' | 'notes' = 'stories') => ({ space, id })

describe('remember', () => {
  it('puts the newest file first', () => {
    expect(remember([file('a')], file('b'))).toEqual([file('b'), file('a')])
  })

  it('moves a file already in the list to the head instead of listing it twice', () => {
    expect(remember([file('a'), file('b'), file('c')], file('c'))).toEqual([
      file('c'),
      file('a'),
      file('b')
    ])
  })

  it('tells two files with the same id in different spaces apart', () => {
    expect(remember([file('a', 'notes')], file('a', 'stories'))).toHaveLength(2)
  })

  it('keeps no more than the limit, dropping the oldest', () => {
    const full = Array.from({ length: MAX_RECENT }, (_, i) => file(`f${i}`))
    const next = remember(full, file('new'))
    expect(next).toHaveLength(MAX_RECENT)
    expect(next[0]).toEqual(file('new'))
    expect(next).not.toContainEqual(file(`f${MAX_RECENT - 1}`))
  })
})

describe('the stored list', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('is empty when nothing is stored', () => {
    expect(loadRecent()).toEqual([])
  })

  it('comes back as it was saved', () => {
    saveRecent([file('a'), file('b', 'notes')])
    expect(loadRecent()).toEqual([file('a'), file('b', 'notes')])
  })

  it('ignores what is not a list of files', () => {
    localStorage.setItem('inkspire.recentFiles', '{"not":"a list"}')
    expect(loadRecent()).toEqual([])
    localStorage.setItem('inkspire.recentFiles', 'not json')
    expect(loadRecent()).toEqual([])
  })

  it('keeps only the entries that are a space and an id', () => {
    localStorage.setItem(
      'inkspire.recentFiles',
      JSON.stringify([file('a'), { space: 'elsewhere', id: 'b' }, { space: 'notes' }, null, 3])
    )
    expect(loadRecent()).toEqual([file('a')])
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(loadRecent()).toEqual([])
    expect(() => saveRecent([file('a')])).not.toThrow()
  })
})

describe('trackRecentFiles', () => {
  let stop: () => void

  beforeEach(() => {
    localStorage.clear()
    useSharedFiles().clearSelectedFile()
    stop = trackRecentFiles()
  })
  afterEach(() => stop())

  it('records each file the selection moves to, newest first', async () => {
    const { setSelectedFile } = useSharedFiles()

    setSelectedFile('stories', 'a')
    await nextTick()
    setSelectedFile('notes', 'b')
    await nextTick()

    expect(loadRecent()).toEqual([file('b', 'notes'), file('a')])
  })

  it('records nothing when the selection is cleared', async () => {
    useSharedFiles().setSelectedFile('stories', 'a')
    await nextTick()
    useSharedFiles().clearSelectedFile()
    await nextTick()

    expect(loadRecent()).toEqual([file('a')])
  })

  it('stops recording once stopped', async () => {
    stop()
    useSharedFiles().setSelectedFile('stories', 'a')
    await nextTick()

    expect(loadRecent()).toEqual([])
  })
})
