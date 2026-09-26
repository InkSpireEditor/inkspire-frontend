import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import DashboardView from './DashboardView.vue'
import { filesManagerService } from '../services/filesManager'

vi.mock('../services/filesManager', () => ({
  filesManagerService: { getDirContent: vi.fn() }
}))

const Stub = { template: '<div />' }

async function routerAt(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
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

    const wrapper = mount(DashboardView, { global: { plugins: [router] } })
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

  it('says so when a story has no chapters yet', async () => {
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
      id: 'a1b2c3d4e5f60718',
      name: 'Bare Story',
      summary: '',
      files: []
    })
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(DashboardView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('No chapters yet.')
  })

  it('shows an error when the story fails to load', async () => {
    vi.mocked(filesManagerService.getDirContent).mockRejectedValue(new Error('boom'))
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(DashboardView, { global: { plugins: [router] } })
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
    mount(DashboardView, { global: { plugins: [router] } })
    await flushPromises()

    await router.push({ name: 'dashboard', params: { id: 'other000000000018' } })
    await flushPromises()

    expect(filesManagerService.getDirContent).toHaveBeenCalledWith(
      'stories',
      'other000000000018'
    )
  })
})
