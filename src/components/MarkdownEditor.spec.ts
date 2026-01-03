import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MarkdownEditor from './MarkdownEditor.vue'

describe('MarkdownEditor.vue', () => {
  it('renders content prop', () => {
    const content = '# Hello World'
    const wrapper = mount(MarkdownEditor, {
      props: { content }
    })
    expect(wrapper.find('textarea').element.value).toBe(content)
  })

  it('emits contentChange on input', async () => {
    const wrapper = mount(MarkdownEditor, {
      props: { content: '' }
    })
    const textarea = wrapper.find('textarea')
    await textarea.setValue('new content')
    
    expect(wrapper.emitted()).toHaveProperty('contentChange')
    expect(wrapper.emitted('contentChange')![0]).toEqual(['new content'])
  })
})
