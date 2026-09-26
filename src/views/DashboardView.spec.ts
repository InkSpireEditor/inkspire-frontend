import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import DashboardView from './DashboardView.vue'

async function routerAt(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/story/:id', name: 'dashboard', component: DashboardView }],
  })
  await router.push({ name: 'dashboard', params: { id: storyId } })
  return router
}

describe('DashboardView.vue', () => {
  it('reads the story id from the route', async () => {
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(DashboardView, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('a1b2c3d4e5f60718')
  })
})
