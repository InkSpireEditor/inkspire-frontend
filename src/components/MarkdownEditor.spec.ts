/**
 * The editor body as a `contenteditable`.
 *
 * **Nothing here asserts anything about colour.** jsdom has neither `CSS.highlights` nor
 * `Highlight` (`ARCHITECTURE.md` §8.3), so every test in this file runs the unpainted path
 * and none of them can tell whether the painting is right — that is what the hand test in a
 * real browser is for, and what `contenteditable-demo/index.html` demo 10 was for before it.
 *
 * A test here failing with `CSS is not defined` or `Highlight is not defined` means the
 * feature detection is missing or wrong. That is the bug, not the environment.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MarkdownEditor from './MarkdownEditor.vue'

/** What the browser does when a writer types: it edits the DOM, then tells us. */
const type = (wrapper: ReturnType<typeof mount>, text: string, inputType = 'insertText') => {
  const element = wrapper.find('[contenteditable]').element
  element.textContent = text
  element.dispatchEvent(new InputEvent('input', { inputType }))
}

describe('MarkdownEditor.vue', () => {
  it('is a contenteditable and not a textarea', () => {
    const wrapper = mount(MarkdownEditor, { props: { content: '' } })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('[contenteditable]').exists()).toBe(true)
  })

  it('renders the content prop', () => {
    const content = '# Hello World'
    const wrapper = mount(MarkdownEditor, { props: { content } })
    expect(wrapper.find('[contenteditable]').element.textContent).toBe(content)
  })

  it('emits contentChange on input', () => {
    const wrapper = mount(MarkdownEditor, { props: { content: '' } })
    type(wrapper, 'new content')

    expect(wrapper.emitted()).toHaveProperty('contentChange')
    expect(wrapper.emitted('contentChange')![0]).toEqual(['new content'])
  })

  it('emits the text as it stands, not the keystroke', () => {
    // The parent owns the text, so what it needs is the whole of it.
    const wrapper = mount(MarkdownEditor, { props: { content: 'Once' } })
    type(wrapper, 'Once.')
    type(wrapper, 'Once. Twice.')
    expect(wrapper.emitted('contentChange')).toEqual([['Once.'], ['Once. Twice.']])
  })

  it('carries newlines through, since the prose has them', () => {
    const wrapper = mount(MarkdownEditor, { props: { content: '' } })
    type(wrapper, 'One.\n\nTwo.\n', 'insertParagraph')
    expect(wrapper.emitted('contentChange')![0]).toEqual(['One.\n\nTwo.\n'])
  })

  it('replaces the displayed text when the content prop changes', async () => {
    const wrapper = mount(MarkdownEditor, { props: { content: 'first' } })
    await wrapper.setProps({ content: 'second' })
    expect(wrapper.find('[contenteditable]').element.textContent).toBe('second')
  })

  it('does not rewrite the DOM when the prop only echoes what was emitted', async () => {
    // The one case that matters: a parent that stores what it is handed and passes it back
    // would otherwise have every keystroke rewrite the element under the caret, which
    // discards the browser's undo entry for it.
    const wrapper = mount(MarkdownEditor, { props: { content: '' } })
    const element = wrapper.find('[contenteditable]').element
    type(wrapper, 'typed')

    const spy = vi.spyOn(element, 'textContent', 'set')
    await wrapper.setProps({ content: 'typed' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('mounts and edits without the highlight API present', () => {
    // jsdom never has it, so this is the path every other test here takes too. Asserted by
    // name anyway, because it is the behaviour a browser without the API also gets.
    expect(typeof CSS).toBe('undefined')
    const wrapper = mount(MarkdownEditor, { props: { content: 'Once.' } })
    expect(() => type(wrapper, 'Once. Twice.')).not.toThrow()
    expect(wrapper.emitted('contentChange')![0]).toEqual(['Once. Twice.'])
  })

  it('survives being emptied and refilled', () => {
    const wrapper = mount(MarkdownEditor, { props: { content: 'Once.' } })
    expect(() => {
      type(wrapper, '', 'deleteContentBackward')
      type(wrapper, 'A')
    }).not.toThrow()
    expect(wrapper.emitted('contentChange')).toEqual([[''], ['A']])
  })

  describe('the placeholder', () => {
    // Driven by the model, not by `:empty`. A browser leaves a stray node behind in an
    // emptied contenteditable, so the selector stops matching while the writer sees
    // nothing -- which is what it did before this was model-driven.
    it('shows when there is no text', () => {
      const wrapper = mount(MarkdownEditor, { props: { content: '' } })
      expect(wrapper.find('.placeholder').exists()).toBe(true)
    })

    it('does not show when a file has prose', () => {
      const wrapper = mount(MarkdownEditor, { props: { content: 'Once.' } })
      expect(wrapper.find('.placeholder').exists()).toBe(false)
    })

    it('goes away on the first character and comes back when all of it is deleted', async () => {
      const wrapper = mount(MarkdownEditor, { props: { content: '' } })
      type(wrapper, 'O')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.placeholder').exists()).toBe(false)

      type(wrapper, '', 'deleteContentBackward')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.placeholder').exists()).toBe(true)
    })

    it('is outside the editable element, so it can never become prose', () => {
      const wrapper = mount(MarkdownEditor, { props: { content: '' } })
      const editable = wrapper.find('[contenteditable]').element
      expect(editable.textContent).toBe('')
      expect(editable.querySelector('.placeholder')).toBeNull()
    })

    it('comes back when the open file is replaced by an empty one', async () => {
      const wrapper = mount(MarkdownEditor, { props: { content: 'Once.' } })
      await wrapper.setProps({ content: '' })
      expect(wrapper.find('.placeholder').exists()).toBe(true)
    })
  })
})
