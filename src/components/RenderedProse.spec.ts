import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RenderedProse from './RenderedProse.vue'

describe('RenderedProse.vue', () => {
  it('renders Markdown paragraphs and headings', () => {
    const wrapper = mount(RenderedProse, {
      props: { text: '## First Chapter\n\nThe first line.\n\nThe second line.' }
    })

    expect(wrapper.find('h2').text()).toBe('First Chapter')
    expect(wrapper.findAll('p').map((p) => p.text())).toEqual([
      'The first line.',
      'The second line.'
    ])
  })

  it('renders inline formatting', () => {
    const wrapper = mount(RenderedProse, { props: { text: 'Some **bold** words.' } })

    expect(wrapper.html()).toContain('<strong>bold</strong>')
  })

  it('sanitises raw HTML instead of rendering it', () => {
    const wrapper = mount(RenderedProse, {
      props: { text: '<script>window.pwned = true</script>\n\nOrdinary text.' }
    })

    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('<script>')
    expect(wrapper.text()).toContain('Ordinary text.')
  })

  it('renders nothing visible for empty text', () => {
    const wrapper = mount(RenderedProse, { props: { text: '' } })

    expect(wrapper.text()).toBe('')
  })

  it('redraws when the text changes', async () => {
    const wrapper = mount(RenderedProse, { props: { text: 'Before.' } })

    await wrapper.setProps({ text: 'After.' })

    expect(wrapper.text()).toBe('After.')
  })

  it('passes a class from its parent to the column itself', () => {
    const wrapper = mount(RenderedProse, { props: { text: 'Text.' }, attrs: { class: 'mine' } })

    expect(wrapper.classes()).toContain('mine')
    expect(wrapper.classes()).toContain('prose')
  })
})
