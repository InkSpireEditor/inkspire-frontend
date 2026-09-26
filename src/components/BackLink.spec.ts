import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import BackLink from './BackLink.vue'

const Stub = { template: '<div />' }

async function mounted(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/story/:id', name: 'dashboard', component: Stub },
      { path: '/story/:id/lore', name: 'lore', component: Stub },
    ],
  })
  await router.push({ name: 'lore', params: { id: storyId } })
  const wrapper = mount(BackLink, { props: { storyId }, global: { plugins: [router] } })
  return { wrapper, router }
}

describe('BackLink.vue', () => {
  it("points at the story's own dashboard", async () => {
    const { wrapper } = await mounted('a1b2c3d4e5f60718')

    expect(wrapper.find('a').attributes('href')).toBe('/story/a1b2c3d4e5f60718')
  })

  it('navigates to the dashboard when clicked', async () => {
    const { wrapper, router } = await mounted('a1b2c3d4e5f60718')

    await wrapper.find('a').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('dashboard')
    expect(router.currentRoute.value.params.id).toBe('a1b2c3d4e5f60718')
  })
})
