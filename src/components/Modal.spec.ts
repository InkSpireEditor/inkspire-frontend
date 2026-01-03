import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Modal from './Modal.vue'

describe('Modal.vue', () => {
  const defaultProps = {
    show: true,
    title: 'Test Modal',
    confirmText: 'Confirm',
    cancelText: 'Cancel'
  }

  it('renders title when show is true', () => {
    const wrapper = mount(Modal, {
      props: defaultProps,
      global: {
        stubs: { teleport: true }
      }
    })
    expect(wrapper.find('h3').text()).toBe('Test Modal')
  })

  it('does not render when show is false', () => {
    const wrapper = mount(Modal, {
      props: { ...defaultProps, show: false },
      global: {
        stubs: { teleport: true }
      }
    })
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
  })

  it('renders slot content', () => {
    const wrapper = mount(Modal, {
      props: defaultProps,
      slots: {
        default: '<div class="test-slot">Slot Content</div>'
      },
      global: {
        stubs: { teleport: true }
      }
    })
    expect(wrapper.find('.test-slot').exists()).toBe(true)
    expect(wrapper.find('.test-slot').text()).toBe('Slot Content')
  })

  it('emits close when cancel button is clicked', async () => {
    const wrapper = mount(Modal, {
      props: defaultProps,
      global: {
        stubs: { teleport: true }
      }
    })
    const cancelButton = wrapper.findAll('button')[0]
    expect(cancelButton).toBeDefined()
    await cancelButton?.trigger('click')
    expect(wrapper.emitted()).toHaveProperty('close')
  })

  it('emits confirm when confirm button is clicked', async () => {
    const wrapper = mount(Modal, {
      props: defaultProps,
      global: {
        stubs: { teleport: true }
      }
    })
    const confirmButton = wrapper.findAll('button')[1]
    expect(confirmButton).toBeDefined()
    await confirmButton?.trigger('click')
    expect(wrapper.emitted()).toHaveProperty('confirm')
  })

  it('emits close when overlay is clicked (click.self)', async () => {
    const wrapper = mount(Modal, {
      props: defaultProps,
      global: {
        stubs: { teleport: true }
      }
    })
    const overlay = wrapper.find('.modal-overlay')
    await overlay.trigger('click')
    expect(wrapper.emitted()).toHaveProperty('close')
  })

  it('applies danger class to confirm button when isDanger is true', () => {
    const wrapper = mount(Modal, {
      props: { ...defaultProps, isDanger: true },
      global: {
        stubs: { teleport: true }
      }
    })
    const confirmButton = wrapper.findAll('button')[1]
    expect(confirmButton).toBeDefined()
    expect(confirmButton?.classes()).toContain('danger')
  })

  it('disables buttons when loading is true', () => {
    const wrapper = mount(Modal, {
      props: { ...defaultProps, loading: true },
      global: {
        stubs: { teleport: true }
      }
    })
    const buttons = wrapper.findAll('button')
    expect(buttons[0]).toBeDefined()
    expect(buttons[1]).toBeDefined()
    expect((buttons[0]?.element as HTMLButtonElement).disabled).toBe(true)
    expect((buttons[1]?.element as HTMLButtonElement).disabled).toBe(true)
    expect(buttons[1]?.text()).toBe('...')
  })
})
