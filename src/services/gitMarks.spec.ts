import { describe, it, expect } from 'vitest'
import type { GitChange, GitStatus } from './git'
import { changesById, marksOf, resettable, selectChanges, stageable, unstageable } from './gitMarks'

const change = (over: Partial<GitChange>): GitChange => ({
  path: 'stories/example/chapters/one.ink',
  state: 'modified',
  staged: false,
  unstaged: true,
  id: 'f1',
  dir: 's1',
  committable: true,
  ...over,
})

const status = (...changes: GitChange[]): GitStatus => ({
  branch: 'main', upstream: null, ahead: null, behind: null, fetched: false,
  clean: changes.length === 0, changes,
})

describe('marksOf', () => {
  it('marks nothing without a status or a change', () => {
    expect(marksOf(null).size).toBe(0)
    expect(marksOf(status()).size).toBe(0)
  })

  it('marks a file changed when it is not staged, and staged when nothing of it is left', () => {
    const marks = marksOf(
      status(
        change({}),
        change({ id: 'f2', path: 'stories/example/chapters/two.ink', staged: true, unstaged: false }),
      ),
    )
    expect(marks.get('f1')).toBe('changed')
    expect(marks.get('f2')).toBe('staged')
  })

  it('shows a staged file edited again as changed', () => {
    expect(marksOf(status(change({ staged: true, unstaged: true }))).get('f1')).toBe('changed')
  })

  it('marks the story changed when any change inside it is, staged only when all are', () => {
    const staged = change({ id: 'f2', staged: true, unstaged: false })
    expect(marksOf(status(staged)).get('s1')).toBe('staged')
    expect(marksOf(status(staged, change({}))).get('s1')).toBe('changed')
    expect(marksOf(status(change({}), staged)).get('s1')).toBe('changed')
  })

  it("marks a story for a change to its story.yaml, which has no row of its own", () => {
    const marks = marksOf(status(change({ path: 'stories/example/story.yaml', id: null })))
    expect(marks.get('s1')).toBe('changed')
    expect(marks.size).toBe(1)
  })

  it('ignores a path that is not committable', () => {
    expect(marksOf(status(change({ committable: false }))).size).toBe(0)
  })
})

describe('changesById', () => {
  it('has the committable changes that are files, by id', () => {
    const one = change({})
    const byId = changesById(
      status(one, change({ id: null, path: 'stories/example/story.yaml' }), change({ id: 'f3', committable: false })),
    )
    expect([...byId.keys()]).toEqual(['f1'])
    expect(byId.get('f1')).toBe(one)
  })
})

describe('selectChanges', () => {
  const all = status(
    change({}),
    change({ id: 'f2', path: 'stories/example/chapters/two.ink' }),
    change({ id: 'f3', dir: 's2', path: 'stories/other/chapters/three.ink' }),
    change({ id: 'f4', dir: 's2', committable: false }),
  )

  it('names every committable change when it selects nothing', () => {
    expect(selectChanges(all, {}).map((c) => c.id)).toEqual(['f1', 'f2', 'f3'])
  })

  it('selects files by id and a story by its id', () => {
    expect(selectChanges(all, { files: ['f2'] }).map((c) => c.id)).toEqual(['f2'])
    expect(selectChanges(all, { dir: 's2' }).map((c) => c.id)).toEqual(['f3'])
    expect(selectChanges(all, { files: ['f1'], dir: 's2' }).map((c) => c.id)).toEqual(['f1', 'f3'])
  })

  it('selects nothing for an id that has not changed', () => {
    expect(selectChanges(all, { files: ['nope'] })).toEqual([])
  })
})

describe('what a change allows', () => {
  it('stages what is unstaged, unstages what is staged, resets what the last commit has', () => {
    expect(stageable(change({}))).toBe(true)
    expect(stageable(change({ staged: true, unstaged: false }))).toBe(false)
    expect(unstageable(change({ staged: true, unstaged: false }))).toBe(true)
    expect(unstageable(change({}))).toBe(false)
    expect(resettable(change({ state: 'modified' }))).toBe(true)
    expect(resettable(change({ state: 'deleted' }))).toBe(true)
    expect(resettable(change({ state: 'untracked' }))).toBe(false)
    expect(resettable(change({ state: 'added' }))).toBe(false)
    expect(resettable(change({ state: 'renamed' }))).toBe(false)
  })
})
