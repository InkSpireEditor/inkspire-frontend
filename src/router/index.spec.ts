import { describe, it, expect } from 'vitest'
import { router } from './index'

const DIR = '1a2b3c4d5e6f7081'
const FILE = '9f8e7d6c5b4a3921'

const resolved = (path: string) => {
  const route = router.resolve(path)
  return { name: route.name, params: route.params }
}

describe('the routes', () => {
  it('gives a story and a notes folder a page of the same shape', () => {
    expect(resolved(`/stories/${DIR}`)).toEqual({
      name: 'dashboard',
      params: { space: 'stories', id: DIR }
    })
    expect(resolved(`/notes/${DIR}`)).toEqual({
      name: 'dashboard',
      params: { space: 'notes', id: DIR }
    })
  })

  it('gives a file in a directory the directory and the file, in either space', () => {
    expect(resolved(`/stories/${DIR}/write/${FILE}`)).toEqual({
      name: 'write',
      params: { space: 'stories', id: DIR, fileId: FILE }
    })
    expect(resolved(`/notes/${DIR}/write/${FILE}`)).toEqual({
      name: 'write',
      params: { space: 'notes', id: DIR, fileId: FILE }
    })
  })

  it('gives a file outside any directory the file alone, in either space', () => {
    expect(resolved(`/stories/write/${FILE}`)).toEqual({
      name: 'write-root',
      params: { space: 'stories', fileId: FILE }
    })
    expect(resolved(`/notes/write/${FILE}`)).toEqual({
      name: 'write-root',
      params: { space: 'notes', fileId: FILE }
    })
  })

  it('keeps the reading, timeline and lorebook views for stories only', () => {
    expect(resolved(`/stories/${DIR}/read`).name).toBe('read')
    expect(resolved(`/stories/${DIR}/timeline`).name).toBe('timeline')
    expect(resolved(`/stories/${DIR}/lore`).name).toBe('lore')
    expect(router.resolve(`/notes/${DIR}/read`).matched).toHaveLength(0)
  })

  it('does not read a word as an id, nor an id of the wrong length', () => {
    expect(router.resolve('/stories/write').matched).toHaveLength(0)
    expect(router.resolve('/stories/not-an-id').matched).toHaveLength(0)
    expect(router.resolve(`/stories/${DIR}0`).matched).toHaveLength(0)
  })

  it('knows no space besides the stories and the notes', () => {
    expect(router.resolve(`/files/${DIR}`).matched).toHaveLength(0)
  })

  it('sends a path from before the notes had routes to the stories path', async () => {
    await router.push(`/story/${DIR}/write/${FILE}?x=1`)

    expect(router.currentRoute.value.fullPath).toBe(`/stories/${DIR}/write/${FILE}?x=1`)
    expect(router.currentRoute.value.name).toBe('write')
  })

  it('sends the old story page and views too', async () => {
    await router.push(`/story/${DIR}`)
    expect(router.currentRoute.value.name).toBe('dashboard')

    await router.push(`/story/${DIR}/timeline`)
    expect(router.currentRoute.value.name).toBe('timeline')
  })
})
