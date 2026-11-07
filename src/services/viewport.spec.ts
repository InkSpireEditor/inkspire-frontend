/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { NARROW_QUERY, useNarrow } from './viewport'

type Listener = (event: MediaQueryListEvent) => void

/** A stand-in for `window.matchMedia` that answers `matches` and lets a test change it. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>()
  const queries: string[] = []
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      queries.push(query)
      return {
        matches,
        media: query,
        addEventListener: (_: string, listener: Listener) => listeners.add(listener),
        removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
      }
    }),
  )
  return {
    listeners,
    queries,
    change: (now: boolean) =>
      listeners.forEach((listener) => listener({ matches: now } as MediaQueryListEvent)),
  }
}

/** Mounts a component that calls `useNarrow` and hands back what it returned. */
function mountWith() {
  let narrow!: ReturnType<typeof useNarrow>
  const wrapper = mount(
    defineComponent({
      setup() {
        narrow = useNarrow()
        return () => null
      },
    }),
  )
  return { wrapper, narrow }
}

afterEach(() => {
  // Not unstubAllGlobals: vitest.setup.ts stubs localStorage the same way.
  vi.stubGlobal('matchMedia', undefined)
})

describe('useNarrow', () => {
  it('asks the browser the one query the stylesheets use', () => {
    const media = stubMatchMedia(true)
    mountWith()
    expect(media.queries).toEqual([NARROW_QUERY])
  })

  it('is narrow when the query matches and not when it does not', () => {
    stubMatchMedia(true)
    expect(mountWith().narrow.value).toBe(true)

    stubMatchMedia(false)
    expect(mountWith().narrow.value).toBe(false)
  })

  it('follows the window being resized', () => {
    const media = stubMatchMedia(false)
    const { narrow } = mountWith()

    media.change(true)
    expect(narrow.value).toBe(true)
    media.change(false)
    expect(narrow.value).toBe(false)
  })

  it('stops listening when the component is unmounted', () => {
    const media = stubMatchMedia(false)
    const { wrapper } = mountWith()
    expect(media.listeners.size).toBe(1)

    wrapper.unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('is never narrow where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(mountWith().narrow.value).toBe(false)
  })
})

describe('the stylesheets', () => {
  const sourceFiles = (dir = resolve(process.cwd(), 'src')): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return sourceFiles(path)
      return /\.(vue|css)$/.test(entry) ? [path] : []
    })

  it('change at one width only', () => {
    const widthQueries = sourceFiles().flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/@media\s*([^{]*\b(?:min|max)-width[^{]*)\{/g)].map(
        (match) => ({ path, query: `(${match[1]!.match(/\(([^)]*width[^)]*)\)/)![1]})` }),
      ),
    )

    expect(widthQueries.length).toBeGreaterThan(0)
    for (const { path, query } of widthQueries) {
      expect(query, path).toBe(NARROW_QUERY)
    }
  })
})
