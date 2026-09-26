import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TimelineView from './TimelineView.vue'

async function routerAt(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/story/:id/timeline', name: 'timeline', component: TimelineView }],
  })
  await router.push({ name: 'timeline', params: { id: storyId } })
  return router
}

describe('TimelineView.vue', () => {
  it('resolves at its route and reads the story id from it', async () => {
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('a1b2c3d4e5f60718')
  })
})
