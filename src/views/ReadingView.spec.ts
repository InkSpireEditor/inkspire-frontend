import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ReadingView from './ReadingView.vue'

async function routerAt(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/story/:id/read', name: 'read', component: ReadingView }],
  })
  await router.push({ name: 'read', params: { id: storyId } })
  return router
}

describe('ReadingView.vue', () => {
  it('reads the story id from the route', async () => {
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(ReadingView, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('a1b2c3d4e5f60718')
  })
})
