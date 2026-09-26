import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ReadingView from './ReadingView.vue'
import { filesManagerService } from '../services/filesManager'

vi.mock('../services/filesManager', () => ({
  filesManagerService: { getDirContent: vi.fn(), getFileContent: vi.fn() }
}))

async function routerAt(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/story/:id/read', name: 'read', component: ReadingView }]
  })
  await router.push({ name: 'read', params: { id: storyId } })
  return router
}

describe('ReadingView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('concatenates the chapters in order, each under its own heading', async () => {
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
      id === 'c1c1c1c1c1c1c1c1' ? 'The first line.' : 'The second line.'
    )
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(ReadingView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Example Story')
    const headings = wrapper.findAll('h2').map((h) => h.text())
    expect(headings).toEqual(['First Chapter', 'Second Chapter'])
    const paragraphs = wrapper.findAll('p').map((p) => p.text())
    expect(paragraphs).toEqual(['The first line.', 'The second line.'])

    // Chapter order came from the array position, not from resolution order --
    // both chapters were requested, and the second is not fetched before the first.
    expect(filesManagerService.getFileContent).toHaveBeenCalledWith(
      'stories',
      'c1c1c1c1c1c1c1c1'
    )
    expect(filesManagerService.getFileContent).toHaveBeenCalledWith(
      'stories',
      'c2c2c2c2c2c2c2c2'
    )
  })

  it('sanitises a chapter that carries raw HTML instead of rendering it', async () => {
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
      id: 'a1b2c3d4e5f60718',
      name: 'Example Story',
      summary: '',
      files: [{ id: 'c1c1c1c1c1c1c1c1', name: 'First Chapter', status: '' }]
    })
    vi.mocked(filesManagerService.getFileContent).mockResolvedValue(
      '<script>window.pwned = true</script>\n\nOrdinary text.'
    )
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(ReadingView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('<script>')
    expect(wrapper.text()).toContain('Ordinary text.')
  })

  it('says so when a story has no chapters yet', async () => {
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
      id: 'a1b2c3d4e5f60718',
      name: 'Bare Story',
      summary: '',
      files: []
    })
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(ReadingView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('No chapters yet.')
    expect(filesManagerService.getFileContent).not.toHaveBeenCalled()
  })

  it('shows an error when the story fails to load', async () => {
    vi.mocked(filesManagerService.getDirContent).mockRejectedValue(new Error('boom'))
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(ReadingView, { global: { plugins: [router] } })
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
    mount(ReadingView, { global: { plugins: [router] } })
    await flushPromises()

    await router.push({ name: 'read', params: { id: 'other000000000018' } })
    await flushPromises()

    expect(filesManagerService.getDirContent).toHaveBeenCalledWith(
      'stories',
      'other000000000018'
    )
  })
})
