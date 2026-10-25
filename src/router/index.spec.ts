/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

describe('docs/routes.md', () => {
  // Vitest runs from the project root (vitest.config.ts sets `root`).
  const doc = readFileSync(resolve(process.cwd(), 'docs/routes.md'), 'utf8')

  /** A route's path as the document writes it: without the pattern that restricts a parameter. */
  const written = (path: string) => path.replace(/\((?:[^()]|\([^()]*\))*\)/g, '')

  const documentedPaths = [...doc.matchAll(/^\| `(\/[^`]*)` \|/gm)].map((m) => m[1]!)

  it('has a row for every route', () => {
    for (const route of router.getRoutes()) {
      expect(documentedPaths, `${route.path} is missing from the table`).toContain(
        written(route.path)
      )
    }
  })

  it('has no row for a route that does not exist', () => {
    const paths = router.getRoutes().map((route) => written(route.path))
    for (const documented of documentedPaths) {
      expect(paths, `${documented} is in the table but is not a route`).toContain(documented)
    }
  })

  it('gives the name of each named route', () => {
    for (const route of router.getRoutes()) {
      if (typeof route.name === 'string') {
        expect(doc).toContain(`| \`${route.name}\` |`)
      }
    }
  })
})
