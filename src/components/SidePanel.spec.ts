import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SidePanel from './SidePanel.vue'

describe('SidePanel.vue', () => {
  it('shows its title and slot content', () => {
    const wrapper = mount(SidePanel, {
      props: { title: 'Entity' },
      slots: { default: '<p>Steady.</p>' },
    })

    expect(wrapper.find('h2').text()).toBe('Entity')
    expect(wrapper.text()).toContain('Steady.')
  })

  it('emits close when the close button is clicked', async () => {
    const wrapper = mount(SidePanel, { props: { title: 'Entity' } })

    await wrapper.find('button.close').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('is open by default', () => {
    const wrapper = mount(SidePanel, { props: { title: 'Entity' } })

    expect(wrapper.classes()).not.toContain('collapsed')
  })

  it('slides shut, staying mounted, when open is false', async () => {
    const wrapper = mount(SidePanel, { props: { title: 'Entity', open: false } })

    expect(wrapper.classes()).toContain('collapsed')

    await wrapper.setProps({ open: true })
    expect(wrapper.classes()).not.toContain('collapsed')
  })
})
