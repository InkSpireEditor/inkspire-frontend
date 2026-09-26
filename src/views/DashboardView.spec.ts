import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import DashboardView from './DashboardView.vue'
import { filesManagerService, HoldsError } from '../services/filesManager'
import { useSharedFiles } from '../services/sharedFiles'

vi.mock('../services/filesManager', async () => {
  const actual = await vi.importActual<typeof import('../services/filesManager')>(
    '../services/filesManager'
  )
  return {
    ...actual,
    filesManagerService: {
      getDirContent: vi.fn(),
      getFileContent: vi.fn(),
      delDir: vi.fn(),
      reorderChapters: vi.fn()
    }
  }
})

// The real singleton would call the real gitService and reach a real network
// request; only its refresh() is needed here, and it is never asserted on.
const mockRefreshGitStatus = vi.fn().mockResolvedValue(undefined)
vi.mock('../services/sharedGit', () => ({
  useSharedGit: () => ({ refresh: mockRefreshGitStatus })
}))

const Stub = { template: '<div />' }

/** The one button, of any modal, carrying this exact text. */
function clickButton(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('button').find((b) => b.text() === label)?.trigger('click')
}

async function routerAt(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Stub },
      { path: '/story/:id', name: 'dashboard', component: DashboardView },
      { path: '/story/:id/write/:fileId', name: 'write', component: Stub },
      { path: '/story/:id/read', name: 'read', component: Stub }
    ]
  })
  await router.push({ name: 'dashboard', params: { id: storyId } })
  return router
}

describe('DashboardView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSharedFiles().clearSelectedFile()
  })

  it('shows the synopsis and the chapters in order, with their status', async () => {
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
      id: 'a1b2c3d4e5f60718',
      name: 'Example Story',
      summary: 'In one line.',
      timeline: false,
      lorebook: false,
      files: [
        { id: 'c1c1c1c1c1c1c1c1', name: 'First Chapter', status: 'draft' },
        { id: 'c2c2c2c2c2c2c2c2', name: 'Second Chapter', status: '' }
      ]
    })
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
    await flushPromises()

    expect(filesManagerService.getDirContent).toHaveBeenCalledWith(
      'stories',
      'a1b2c3d4e5f60718'
    )
    expect(wrapper.find('h1').text()).toBe('Example Story')
    expect(wrapper.text()).toContain('In one line.')

    const chapters = wrapper.findAll('.chapter')
    expect(chapters).toHaveLength(2)
    expect(chapters[0]?.text()).toContain('First Chapter')
    expect(chapters[0]?.text()).toContain('draft')
  })

  it('shows a word count per chapter, computed from its fetched prose', async () => {
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
      id: 'a1b2c3d4e5f60718',
      name: 'Example Story',
      summary: '',
      files: [
        { id: 'c1c1c1c1c1c1c1c1', name: 'First Chapter', status: '' },
        { id: 'c2c2c2c2c2c2c2c2', name: 'Second Chapter', status: '' }
      ]
    })
    vi.mocked(filesManagerService.getFileContent).mockImplementation(async (_space, id) =>
      id === 'c1c1c1c1c1c1c1c1' ? 'One two three.' : 'Just two.'
    )
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
    await flushPromises()

    const chapters = wrapper.findAll('.chapter')
    expect(chapters[0]?.text()).toContain('3 words')
    expect(chapters[1]?.text()).toContain('2 words')
  })

  it('leaves the count off a chapter whose prose failed to load', async () => {
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
      id: 'a1b2c3d4e5f60718',
      name: 'Example Story',
      summary: '',
      files: [{ id: 'c1c1c1c1c1c1c1c1', name: 'First Chapter', status: '' }]
    })
    vi.mocked(filesManagerService.getFileContent).mockRejectedValue(new Error('boom'))
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
    await flushPromises()

    expect(wrapper.find('.word-count').exists()).toBe(false)
  })

  it('says so when a story has no chapters yet', async () => {
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
      id: 'a1b2c3d4e5f60718',
      name: 'Bare Story',
      summary: '',
      files: []
    })
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
    await flushPromises()

    expect(wrapper.text()).toContain('No chapters yet.')
  })

  it('shows an error when the story fails to load', async () => {
    vi.mocked(filesManagerService.getDirContent).mockRejectedValue(new Error('boom'))
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
    await flushPromises()

    expect(wrapper.find('.error').text()).toBe('boom')
  })

  it('reloads when the route moves to a different story without remounting', async () => {
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
      id: 'a1b2c3d4e5f60718',
      name: 'Example Story',
      summary: '',
      files: []
    })
    const router = await routerAt('a1b2c3d4e5f60718')
    mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
    await flushPromises()

    await router.push({ name: 'dashboard', params: { id: 'other000000000018' } })
    await flushPromises()

    expect(filesManagerService.getDirContent).toHaveBeenCalledWith(
      'stories',
      'other000000000018'
    )
  })

  describe('reacting to a sidebar change while open', () => {
    it('reloads when Tree.vue names this story', async () => {
      vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
        id: 'a1b2c3d4e5f60718',
        name: 'Example Story',
        summary: '',
        files: []
      })
      const router = await routerAt('a1b2c3d4e5f60718')
      mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
      await flushPromises()
      vi.mocked(filesManagerService.getDirContent).mockClear()

      window.dispatchEvent(
        new CustomEvent('stories:changed', { detail: { storyId: 'a1b2c3d4e5f60718' } })
      )
      await flushPromises()

      expect(filesManagerService.getDirContent).toHaveBeenCalledWith(
        'stories',
        'a1b2c3d4e5f60718'
      )
    })

    it('ignores the event when it names a different story', async () => {
      vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
        id: 'a1b2c3d4e5f60718',
        name: 'Example Story',
        summary: '',
        files: []
      })
      const router = await routerAt('a1b2c3d4e5f60718')
      mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
      await flushPromises()
      vi.mocked(filesManagerService.getDirContent).mockClear()

      window.dispatchEvent(
        new CustomEvent('stories:changed', { detail: { storyId: 'unrelated0000000' } })
      )
      await flushPromises()

      expect(filesManagerService.getDirContent).not.toHaveBeenCalled()
    })

    it('ignores the plain, detail-less event dispatched after a delete', async () => {
      vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
        id: 'a1b2c3d4e5f60718',
        name: 'Example Story',
        summary: '',
        files: []
      })
      const router = await routerAt('a1b2c3d4e5f60718')
      mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
      await flushPromises()
      vi.mocked(filesManagerService.getDirContent).mockClear()

      window.dispatchEvent(new Event('stories:changed'))
      await flushPromises()

      expect(filesManagerService.getDirContent).not.toHaveBeenCalled()
    })
  })

  describe('dragging to reorder chapters', () => {
    const threeChapters = {
      id: 'a1b2c3d4e5f60718',
      name: 'Example Story',
      summary: '',
      files: [
        { id: 'c1c1c1c1c1c1c1c1', name: 'First Chapter', status: '' },
        { id: 'c2c2c2c2c2c2c2c2', name: 'Second Chapter', status: '' },
        { id: 'c3c3c3c3c3c3c3c3', name: 'Third Chapter', status: '' }
      ]
    }

    it('drags a chapter onto another and sends the resulting order', async () => {
      vi.mocked(filesManagerService.getDirContent).mockResolvedValue(threeChapters)
      vi.mocked(filesManagerService.reorderChapters).mockResolvedValue({
        ...threeChapters,
        files: [threeChapters.files[1]!, threeChapters.files[0]!, threeChapters.files[2]!]
      })
      const router = await routerAt('a1b2c3d4e5f60718')
      const wrapper = mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
      await flushPromises()

      const chapters = wrapper.findAll('.chapter')
      await chapters[0]!.trigger('dragstart')
      await chapters[1]!.trigger('drop')
      await flushPromises()

      expect(filesManagerService.reorderChapters).toHaveBeenCalledWith('a1b2c3d4e5f60718', [
        'c2c2c2c2c2c2c2c2',
        'c1c1c1c1c1c1c1c1',
        'c3c3c3c3c3c3c3c3'
      ])
      const namesInOrder = wrapper.findAll('.chapter a').map((a) => a.text())
      expect(namesInOrder).toEqual(['Second Chapter', 'First Chapter', 'Third Chapter'])
    })

    it('shows an error and leaves the list alone when the write fails', async () => {
      vi.mocked(filesManagerService.getDirContent).mockResolvedValue(threeChapters)
      vi.mocked(filesManagerService.reorderChapters).mockRejectedValue(new Error('Network error'))
      const router = await routerAt('a1b2c3d4e5f60718')
      const wrapper = mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
      await flushPromises()

      const chapters = wrapper.findAll('.chapter')
      await chapters[0]!.trigger('dragstart')
      await chapters[1]!.trigger('drop')
      await flushPromises()

      expect(wrapper.text()).toContain('Network error')
      const namesInOrder = wrapper.findAll('.chapter a').map((a) => a.text())
      expect(namesInOrder).toEqual(['First Chapter', 'Second Chapter', 'Third Chapter'])
    })

    it('does nothing when a chapter is dropped onto its own row', async () => {
      vi.mocked(filesManagerService.getDirContent).mockResolvedValue(threeChapters)
      const router = await routerAt('a1b2c3d4e5f60718')
      const wrapper = mount(DashboardView, { global: { plugins: [router], stubs: { teleport: true } } })
      await flushPromises()

      const chapters = wrapper.findAll('.chapter')
      await chapters[0]!.trigger('dragstart')
      await chapters[0]!.trigger('drop')
      await flushPromises()

      expect(filesManagerService.reorderChapters).not.toHaveBeenCalled()
    })
  })

  describe('deleting the story', () => {
    async function mountLoaded() {
      vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
        id: 'a1b2c3d4e5f60718',
        name: 'Example Story',
        summary: '',
        files: []
      })
      const router = await routerAt('a1b2c3d4e5f60718')
      const wrapper = mount(DashboardView, {
        global: { plugins: [router], stubs: { teleport: true } }
      })
      await flushPromises()
      return { wrapper, router }
    }

    it('deletes a clean story in one confirm', async () => {
      vi.mocked(filesManagerService.delDir).mockResolvedValue(null)
      const { wrapper, router } = await mountLoaded()

      await clickButton(wrapper, 'Delete story')
      await clickButton(wrapper, 'Delete')
      await flushPromises()

      expect(filesManagerService.delDir).toHaveBeenCalledWith('stories', 'a1b2c3d4e5f60718')
      expect(router.currentRoute.value.name).toBe('home')
    })

    it('tells the sidebar the tree changed, and refreshes the git panel', async () => {
      vi.mocked(filesManagerService.delDir).mockResolvedValue(null)
      const listener = vi.fn()
      window.addEventListener('stories:changed', listener)
      const { wrapper } = await mountLoaded()

      await clickButton(wrapper, 'Delete story')
      await clickButton(wrapper, 'Delete')
      await flushPromises()

      expect(listener).toHaveBeenCalledTimes(1)
      expect(mockRefreshGitStatus).toHaveBeenCalled()
      window.removeEventListener('stories:changed', listener)
    })

    it('clears the shared selection if it pointed at one of this story\'s own chapters', async () => {
      vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
        id: 'a1b2c3d4e5f60718',
        name: 'Example Story',
        summary: '',
        files: [{ id: 'c1c1c1c1c1c1c1c1', name: 'First Chapter', status: '' }]
      })
      vi.mocked(filesManagerService.delDir).mockResolvedValue(null)
      const router = await routerAt('a1b2c3d4e5f60718')
      const wrapper = mount(DashboardView, {
        global: { plugins: [router], stubs: { teleport: true } }
      })
      await flushPromises()
      useSharedFiles().setSelectedFile('stories', 'c1c1c1c1c1c1c1c1')

      await clickButton(wrapper, 'Delete story')
      await clickButton(wrapper, 'Delete')
      await flushPromises()

      expect(useSharedFiles().selectedFile.value).toBeNull()
    })

    it('leaves an unrelated selection alone', async () => {
      vi.mocked(filesManagerService.delDir).mockResolvedValue(null)
      const { wrapper } = await mountLoaded()
      useSharedFiles().setSelectedFile('stories', 'unrelated0000000')

      await clickButton(wrapper, 'Delete story')
      await clickButton(wrapper, 'Delete')
      await flushPromises()

      expect(useSharedFiles().selectedFile.value).toEqual({
        space: 'stories',
        id: 'unrelated0000000'
      })
    })

    it('lists what is in the way, and refuses until the name is typed correctly', async () => {
      vi.mocked(filesManagerService.delDir).mockRejectedValueOnce(
        new HoldsError('also holds lorebook', ['lorebook'])
      )
      const { wrapper, router } = await mountLoaded()

      await clickButton(wrapper, 'Delete story')
      await clickButton(wrapper, 'Delete')
      await flushPromises()

      expect(wrapper.text()).toContain('lorebook')
      const anyway = () =>
        wrapper.findAll('button').find((b) => b.text() === 'Delete anyway')
      expect((anyway()?.element as HTMLButtonElement).disabled).toBe(true)

      await wrapper.find('input').setValue('the wrong name')
      await flushPromises()
      expect((anyway()?.element as HTMLButtonElement).disabled).toBe(true)

      vi.mocked(filesManagerService.delDir).mockResolvedValueOnce(null)
      await wrapper.find('input').setValue('Example Story')
      await flushPromises()
      expect((anyway()?.element as HTMLButtonElement).disabled).toBe(false)

      await anyway()?.trigger('click')
      await flushPromises()

      expect(filesManagerService.delDir).toHaveBeenCalledWith('stories', 'a1b2c3d4e5f60718', {
        force: true
      })
      expect(router.currentRoute.value.name).toBe('home')
    })

    it('shows a plain failure in the error dialog, not the holds dialog', async () => {
      vi.mocked(filesManagerService.delDir).mockRejectedValueOnce(new Error('Network error'))
      const { wrapper } = await mountLoaded()

      await clickButton(wrapper, 'Delete story')
      await clickButton(wrapper, 'Delete')
      await flushPromises()

      expect(wrapper.text()).toContain('Network error')
      expect(wrapper.text()).not.toContain('Delete anyway')
    })
  })
})
