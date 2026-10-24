import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Icon from './Icon.vue'
import { ICONS } from '../icons'

describe('Icon.vue', () => {
  it("draws the named icon's outline in its own viewBox", () => {
    const wrapper = mount(Icon, { props: { name: 'save' } })

    const svg = wrapper.find('svg')
    expect(svg.attributes('viewBox')).toBe(ICONS.save.viewBox)
    expect(wrapper.find('path').attributes('d')).toBe(ICONS.save.d)
    expect(svg.attributes('data-icon')).toBe('save')
  })

  it('takes its colour from the text around it', () => {
    const wrapper = mount(Icon, { props: { name: 'gear' } })

    expect(wrapper.find('svg').attributes('fill')).toBe('currentColor')
  })

  it('is hidden from assistive technology, leaving the name to the button around it', () => {
    const wrapper = mount(Icon, { props: { name: 'close' } })

    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('svg').attributes('focusable')).toBe('false')
  })

  it('changes outline when the name changes', async () => {
    const wrapper = mount(Icon, { props: { name: 'sun' } })

    await wrapper.setProps({ name: 'moon' })

    expect(wrapper.find('path').attributes('d')).toBe(ICONS.moon.d)
  })
})
