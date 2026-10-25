import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import HomeView from './HomeView.vue'
import { filesManagerService } from '../services/filesManager'
import type { TreeApiResponse } from '../services/filesManager'
import { saveRecent, loadRecent } from '../services/recentFiles'

vi.mock('../services/filesManager', async () => {
  const actual = await vi.importActual<typeof import('../services/filesManager')>(
    '../services/filesManager'
  )
  return { ...actual, filesManagerService: { getTree: vi.fn() } }
})

const STORIES: TreeApiResponse = {
  dirs: [
    {
      id: 's1',
      name: 'Foo',
      summary: '',
      files: [
        { id: 'c1', name: 'One', status: 'draft' },
        { id: 'c2', name: 'Two', status: '' }
      ]
    }
  ],
  files: [{ id: 'o1', name: 'Solo', status: '' }]
}

const NOTES: TreeApiResponse = {
  dirs: [{ id: 'f1', name: 'Bar', summary: '', files: [{ id: 'n1', name: 'Note', status: '' }] }],
  files: [{ id: 'n2', name: 'Loose', status: '' }]
}

const countOf = (wrapper: ReturnType<typeof mount>, key: string) =>
  wrapper.find(`[data-count="${key}"] dd`).text()

// The view listens on `window`, so a wrapper left mounted would answer the next test's event.
const mounted: ReturnType<typeof mount>[] = []
const mountHome = () => {
  const wrapper = mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mounted.push(wrapper)
  return wrapper
}

describe('HomeView.vue', () => {
  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  beforeEach(() => {
    localStorage.clear()
    vi.mocked(filesManagerService.getTree).mockReset()
    vi.mocked(filesManagerService.getTree).mockImplementation(async (space) =>
      space === 'stories' ? STORIES : NOTES
    )
  })

  it('shows what is in both trees', async () => {
    const wrapper = mountHome()
    await flushPromises()

    expect(countOf(wrapper, 'stories')).toBe('1')
    expect(countOf(wrapper, 'chapters')).toBe('2')
    expect(countOf(wrapper, 'oneShots')).toBe('1')
    expect(countOf(wrapper, 'notesFolders')).toBe('1')
    expect(countOf(wrapper, 'notes')).toBe('2')
  })

  it('says so when a tree cannot be fetched', async () => {
    vi.mocked(filesManagerService.getTree).mockRejectedValue(new Error('Failed to fetch tree'))
    const wrapper = mountHome()
    await flushPromises()

    expect(wrapper.find('.error').text()).toBe('Failed to fetch tree')
    expect(wrapper.find('.counts').exists()).toBe(false)
  })

  it('reloads the numbers when the sidebar changes either tree', async () => {
    const wrapper = mountHome()
    await flushPromises()
    vi.mocked(filesManagerService.getTree).mockImplementation(async (space) =>
      space === 'stories' ? { dirs: [], files: [] } : NOTES
    )

    window.dispatchEvent(new Event('tree:changed'))
    await flushPromises()

    expect(countOf(wrapper, 'stories')).toBe('0')
    expect(countOf(wrapper, 'chapters')).toBe('0')
  })

  it('keeps the numbers on screen while it reloads', async () => {
    const wrapper = mountHome()
    await flushPromises()
    vi.mocked(filesManagerService.getTree).mockReturnValue(new Promise(() => {}))

    window.dispatchEvent(new Event('tree:changed'))
    await flushPromises()

    expect(wrapper.text()).not.toContain('Loading')
    expect(countOf(wrapper, 'stories')).toBe('1')
  })

  it('stops listening once unmounted', async () => {
    const wrapper = mountHome()
    await flushPromises()
    wrapper.unmount()
    vi.mocked(filesManagerService.getTree).mockClear()

    window.dispatchEvent(new Event('tree:changed'))
    await flushPromises()

    expect(filesManagerService.getTree).not.toHaveBeenCalled()
  })

  describe('recently opened', () => {
    const links = (wrapper: ReturnType<typeof mount>) => wrapper.findAllComponents(RouterLinkStub)

    it('lists nothing, and no heading, when nothing was opened', async () => {
      const wrapper = mountHome()
      await flushPromises()

      expect(wrapper.find('.recent').exists()).toBe(false)
    })

    it('links a chapter to its write route, with its story named beside it', async () => {
      saveRecent([{ space: 'stories', id: 'c1' }])
      const wrapper = mountHome()
      await flushPromises()

      expect(wrapper.find('.recent h2').text()).toBe('Recently opened')
      expect(links(wrapper)[0]?.props('to')).toEqual({
        name: 'write',
        params: { space: 'stories', id: 's1', fileId: 'c1' }
      })
      expect(wrapper.find('.recent li').text()).toContain('One')
      expect(wrapper.find('.recent .where').text()).toBe('Foo')
    })

    it('links a one-shot and a note at the root to the root write route', async () => {
      saveRecent([
        { space: 'stories', id: 'o1' },
        { space: 'notes', id: 'n2' }
      ])
      const wrapper = mountHome()
      await flushPromises()

      expect(links(wrapper).map((link) => link.props('to'))).toEqual([
        { name: 'write-root', params: { space: 'stories', fileId: 'o1' } },
        { name: 'write-root', params: { space: 'notes', fileId: 'n2' } }
      ])
      expect(wrapper.findAll('.recent .where').map((where) => where.text())).toEqual([
        'One-shot',
        'Note'
      ])
    })

    it('drops a file that is gone from the list and from storage', async () => {
      saveRecent([
        { space: 'stories', id: 'gone' },
        { space: 'stories', id: 'c1' }
      ])
      const wrapper = mountHome()
      await flushPromises()

      expect(links(wrapper)).toHaveLength(1)
      expect(loadRecent()).toEqual([{ space: 'stories', id: 'c1' }])
    })
  })
})
