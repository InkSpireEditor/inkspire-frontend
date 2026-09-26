import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import LoreView from './LoreView.vue'

async function routerAt(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/story/:id/lore', name: 'lore', component: LoreView }],
  })
  await router.push({ name: 'lore', params: { id: storyId } })
  return router
}

describe('LoreView.vue', () => {
  it('resolves at its route and reads the story id from it', async () => {
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(LoreView, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('a1b2c3d4e5f60718')
  })
})
