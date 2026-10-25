import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import EditorRoute from './EditorRoute.vue'
import { useSharedFiles } from '../services/sharedFiles'

/** A router with both write routes, already navigated to one file in a directory. */
async function routerAt(space: string, id: string, fileId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:space/:id/write/:fileId', name: 'write', component: EditorRoute },
      { path: '/:space/write/:fileId', name: 'write-root', component: EditorRoute },
    ],
  })
  await router.push({ name: 'write', params: { space, id, fileId } })
  return router
}

describe('EditorRoute.vue', () => {
  beforeEach(() => {
    useSharedFiles().clearSelectedFile()
  })

  it('sets the shared file selection from the route params on mount', async () => {
    const router = await routerAt('stories', 'a1b2c3d4e5f60718', 'c3d4e5f6a1b20718')

    mount(EditorRoute, { global: { plugins: [router] }, shallow: true })

    expect(useSharedFiles().selectedFile.value).toEqual({
      space: 'stories',
      id: 'c3d4e5f6a1b20718',
    })
  })

  it('opens a note in the notes space, not the stories', async () => {
    const router = await routerAt('notes', 'a1b2c3d4e5f60718', 'c3d4e5f6a1b20718')

    mount(EditorRoute, { global: { plugins: [router] }, shallow: true })

    expect(useSharedFiles().selectedFile.value).toEqual({
      space: 'notes',
      id: 'c3d4e5f6a1b20718',
    })
  })

  it('follows the route to a different file without remounting', async () => {
    const router = await routerAt('stories', 'a1b2c3d4e5f60718', 'c3d4e5f6a1b20718')
    mount(EditorRoute, { global: { plugins: [router] }, shallow: true })

    await router.push({
      name: 'write',
      params: { space: 'stories', id: 'a1b2c3d4e5f60718', fileId: 'other0718' },
    })

    expect(useSharedFiles().selectedFileId.value).toBe('other0718')
  })

  it('serves a file outside any directory, such as a one-shot or a note at the root', async () => {
    const router = await routerAt('stories', 'a1b2c3d4e5f60718', 'c3d4e5f6a1b20718')
    mount(EditorRoute, { global: { plugins: [router] }, shallow: true })

    await router.push({ name: 'write-root', params: { space: 'notes', fileId: 'root0718' } })

    expect(useSharedFiles().selectedFile.value).toEqual({ space: 'notes', id: 'root0718' })
  })

  it('follows a change of space with the same file id', async () => {
    const router = await routerAt('stories', 'a1b2c3d4e5f60718', 'c3d4e5f6a1b20718')
    mount(EditorRoute, { global: { plugins: [router] }, shallow: true })

    await router.push({
      name: 'write',
      params: { space: 'notes', id: 'a1b2c3d4e5f60718', fileId: 'c3d4e5f6a1b20718' },
    })

    expect(useSharedFiles().selectedFile.value?.space).toBe('notes')
  })
})
