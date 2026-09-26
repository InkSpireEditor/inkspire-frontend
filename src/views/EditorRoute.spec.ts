import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import EditorRoute from './EditorRoute.vue'
import { useSharedFiles } from '../services/sharedFiles'

/** A router already navigated to the write route for one chapter. */
async function routerAt(storyId: string, fileId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/story/:id/write/:fileId', name: 'write', component: EditorRoute }],
  })
  await router.push({ name: 'write', params: { id: storyId, fileId } })
  return router
}

describe('EditorRoute.vue', () => {
  beforeEach(() => {
    useSharedFiles().clearSelectedFile()
  })

  it('sets the shared file selection from the route params on mount', async () => {
    const router = await routerAt('a1b2c3d4e5f60718', 'c3d4e5f6a1b20718')

    mount(EditorRoute, { global: { plugins: [router] }, shallow: true })

    expect(useSharedFiles().selectedFile.value).toEqual({
      space: 'stories',
      id: 'c3d4e5f6a1b20718',
    })
  })

  it('follows the route to a different chapter without remounting', async () => {
    const router = await routerAt('a1b2c3d4e5f60718', 'c3d4e5f6a1b20718')
    mount(EditorRoute, { global: { plugins: [router] }, shallow: true })

    await router.push({ name: 'write', params: { id: 'a1b2c3d4e5f60718', fileId: 'other0718' } })

    expect(useSharedFiles().selectedFileId.value).toBe('other0718')
  })
})
