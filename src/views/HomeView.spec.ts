import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import HomeView from './HomeView.vue'
import { filesManagerService } from '../services/filesManager'
import type { TreeApiResponse } from '../services/filesManager'

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
  const wrapper = mount(HomeView)
  mounted.push(wrapper)
  return wrapper
}

describe('HomeView.vue', () => {
  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  beforeEach(() => {
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
})
