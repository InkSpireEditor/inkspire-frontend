import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from './App.vue'

type Listener = (event: MediaQueryListEvent) => void

/** A `window.matchMedia` that answers `matches` and lets a test resize the window. */
function stubWidth(narrow: boolean) {
  const listeners = new Set<Listener>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: narrow,
      addEventListener: (_: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
    })),
  )
  return {
    resize: (now: boolean) =>
      listeners.forEach((listener) => listener({ matches: now } as MediaQueryListEvent)),
  }
}

async function mountApp() {
  const view = { template: '<p>page</p>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: view },
      { path: '/other', name: 'other', component: view },
    ],
  })
  await router.push('/')
  const wrapper = mount(App, {
    global: { plugins: [router], stubs: { Tree: true, Login: true } },
  })
  await flushPromises()
  return { wrapper, router }
}

const sidebarIsOpen = (wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper']) =>
  !wrapper.find('aside').classes().includes('collapsed')

describe('App.vue sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    document.cookie = 'auth_status=1'
  })

  afterEach(() => {
    document.cookie = 'auth_status=; Max-Age=0'
    // Not unstubAllGlobals: vitest.setup.ts stubs localStorage the same way.
    vi.stubGlobal('matchMedia', undefined)
  })

  describe('at phone width', () => {
    it('starts closed, whatever the desktop left stored', async () => {
      stubWidth(true)
      localStorage.setItem('sidebarOpen', 'true')

      const { wrapper } = await mountApp()

      expect(sidebarIsOpen(wrapper)).toBe(false)
      expect(wrapper.find('[data-testid="sidebar-backdrop"]').exists()).toBe(false)
    })

    it('opens over the page with a backdrop that closes it', async () => {
      stubWidth(true)
      const { wrapper } = await mountApp()

      await wrapper.find('button.sidebar-toggle').trigger('click')
      expect(sidebarIsOpen(wrapper)).toBe(true)

      await wrapper.find('[data-testid="sidebar-backdrop"]').trigger('click')
      expect(sidebarIsOpen(wrapper)).toBe(false)
    })

    it('closes when a page is opened from it', async () => {
      stubWidth(true)
      const { wrapper, router } = await mountApp()
      await wrapper.find('button.sidebar-toggle').trigger('click')

      await router.push('/other')
      await flushPromises()

      expect(sidebarIsOpen(wrapper)).toBe(false)
    })

    it('does not change what the desktop stored', async () => {
      stubWidth(true)
      localStorage.setItem('sidebarOpen', 'false')
      const { wrapper } = await mountApp()

      await wrapper.find('button.sidebar-toggle').trigger('click')

      expect(localStorage.getItem('sidebarOpen')).toBe('false')
    })

    it('closes when the window becomes narrow with it open, and goes back to the stored choice when it is wide again', async () => {
      const width = stubWidth(false)
      const { wrapper } = await mountApp()
      expect(sidebarIsOpen(wrapper)).toBe(true)

      width.resize(true)
      await flushPromises()
      expect(sidebarIsOpen(wrapper)).toBe(false)

      width.resize(false)
      await flushPromises()
      expect(sidebarIsOpen(wrapper)).toBe(true)
    })
  })

  describe('on a wide screen', () => {
    it('starts open, and shows no backdrop', async () => {
      stubWidth(false)

      const { wrapper } = await mountApp()

      expect(sidebarIsOpen(wrapper)).toBe(true)
      expect(wrapper.find('[data-testid="sidebar-backdrop"]').exists()).toBe(false)
    })

    it('restores the stored choice, and stores a new one', async () => {
      stubWidth(false)
      localStorage.setItem('sidebarOpen', 'false')

      const { wrapper } = await mountApp()
      expect(sidebarIsOpen(wrapper)).toBe(false)

      await wrapper.find('button.sidebar-toggle').trigger('click')
      expect(sidebarIsOpen(wrapper)).toBe(true)
      expect(localStorage.getItem('sidebarOpen')).toBe('true')
    })

    it('stays open when a page is opened', async () => {
      stubWidth(false)
      const { wrapper, router } = await mountApp()

      await router.push('/other')
      await flushPromises()

      expect(sidebarIsOpen(wrapper)).toBe(true)
    })
  })
})
