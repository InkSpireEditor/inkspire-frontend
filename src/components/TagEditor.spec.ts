import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TagEditor from './TagEditor.vue'

const mountEditor = (props: Record<string, unknown> = {}) =>
  mount(TagEditor, { props: { tags: [], ...props }, attachTo: document.body })

const input = (wrapper: ReturnType<typeof mountEditor>) => wrapper.find('input.tag-input')

const emitted = (wrapper: ReturnType<typeof mountEditor>) =>
  (wrapper.emitted('change') ?? []).map((call) => call[0])

const type = async (wrapper: ReturnType<typeof mountEditor>, text: string, key = 'Enter') => {
  await input(wrapper).setValue(text)
  await input(wrapper).trigger('keydown', { key })
}

describe('TagEditor', () => {
  it('draws each tag as a chip, in order', () => {
    const wrapper = mountEditor({ tags: ['perso', 'priority'] })
    expect(wrapper.findAll('.chip-text').map((chip) => chip.text())).toEqual(['perso', 'priority'])
  })

  it('draws nothing but the input for a file with no tags', () => {
    const wrapper = mountEditor()
    expect(wrapper.findAll('.chip')).toHaveLength(0)
    expect(input(wrapper).exists()).toBe(true)
  })

  describe('removing', () => {
    it("emits the list without the chip's tag", async () => {
      const wrapper = mountEditor({ tags: ['a', 'b', 'c'] })
      await wrapper.findAll('.chip-remove')[1]!.trigger('click')
      expect(emitted(wrapper)).toEqual([['a', 'c']])
    })

    it('names the tag and the file on the button', () => {
      const wrapper = mountEditor({ tags: ['perso'], label: 'First Chapter' })
      expect(wrapper.find('.chip-remove').attributes('aria-label')).toBe(
        'Remove tag perso from First Chapter'
      )
    })

    it('does not remove anything on Backspace in an empty input', async () => {
      const wrapper = mountEditor({ tags: ['a'] })
      await input(wrapper).trigger('keydown', { key: 'Backspace' })
      expect(emitted(wrapper)).toEqual([])
    })
  })

  describe('adding', () => {
    it('adds a trimmed, lowercased tag on Enter and empties the input', async () => {
      const wrapper = mountEditor({ tags: ['a'] })
      await type(wrapper, '  Perso ')
      expect(emitted(wrapper)).toEqual([['a', 'perso']])
      expect((input(wrapper).element as HTMLInputElement).value).toBe('')
    })

    it('adds on a comma as well', async () => {
      const wrapper = mountEditor()
      await type(wrapper, 'perso', ',')
      expect(emitted(wrapper)).toEqual([['perso']])
    })

    it('adds several tags typed or pasted with commas, in order', async () => {
      const wrapper = mountEditor({ tags: ['a'] })
      await type(wrapper, 'b, c ,a')
      expect(emitted(wrapper)).toEqual([['a', 'b', 'c']])
    })

    it('adds nothing when one of several is not a tag, and keeps what was typed', async () => {
      const wrapper = mountEditor()
      await type(wrapper, 'good, bad tag')
      expect(emitted(wrapper)).toEqual([])
      expect((input(wrapper).element as HTMLInputElement).value).toBe('good, bad tag')
      expect(wrapper.find('[role="alert"]').text()).toContain('a-z')
    })

    it('says what a tag is, and adds nothing, for text that is not one', async () => {
      const wrapper = mountEditor()
      await type(wrapper, 'perso!')
      expect(emitted(wrapper)).toEqual([])
      expect(wrapper.find('[role="alert"]').text()).toContain('up to 32 characters')
    })

    it('clears the message once a tag is accepted', async () => {
      const wrapper = mountEditor()
      await type(wrapper, 'perso!')
      await type(wrapper, 'perso')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('emits nothing for a tag already there, and empties the input', async () => {
      const wrapper = mountEditor({ tags: ['perso'] })
      await type(wrapper, 'Perso')
      expect(emitted(wrapper)).toEqual([])
      expect((input(wrapper).element as HTMLInputElement).value).toBe('')
    })

    it('emits nothing for an empty input', async () => {
      const wrapper = mountEditor()
      await type(wrapper, '   ')
      expect(emitted(wrapper)).toEqual([])
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('does not change the list it was given', async () => {
      const tags = ['a']
      const wrapper = mountEditor({ tags })
      await type(wrapper, 'b')
      expect(tags).toEqual(['a'])
    })
  })

  describe('suggestions', () => {
    it('offers the known tags the file does not have yet', () => {
      const wrapper = mountEditor({ tags: ['perso'], suggestions: ['idea', 'perso', 'priority'] })
      expect(wrapper.findAll('datalist option').map((o) => o.attributes('value'))).toEqual([
        'idea',
        'priority'
      ])
    })

    it('ties the input to its own list', () => {
      const wrapper = mountEditor({ suggestions: ['idea'] })
      expect(input(wrapper).attributes('list')).toBe(wrapper.find('datalist').attributes('id'))
    })

    it('gives two editors different lists', () => {
      const first = mountEditor({ suggestions: ['a'] })
      const second = mountEditor({ suggestions: ['a'] })
      expect(first.find('datalist').attributes('id')).not.toBe(
        second.find('datalist').attributes('id')
      )
    })
  })

  describe('compact', () => {
    it('keeps the input behind a button until it is asked for', async () => {
      const wrapper = mountEditor({ compact: true, label: 'First Chapter' })
      expect(input(wrapper).exists()).toBe(false)

      const open = wrapper.find('button.add-open')
      expect(open.attributes('aria-label')).toBe('Add a tag to First Chapter')
      await open.trigger('click')

      expect(input(wrapper).exists()).toBe(true)
      expect(document.activeElement).toBe(input(wrapper).element)
    })

    it('closes again on Escape, forgetting what was typed', async () => {
      const wrapper = mountEditor({ compact: true })
      await wrapper.find('button.add-open').trigger('click')
      await input(wrapper).setValue('half')
      await input(wrapper).trigger('keydown', { key: 'Escape' })

      expect(input(wrapper).exists()).toBe(false)
      expect(wrapper.find('button.add-open').exists()).toBe(true)
    })

    it('closes when the empty input loses focus, and stays open with text in it', async () => {
      const wrapper = mountEditor({ compact: true })
      await wrapper.find('button.add-open').trigger('click')
      await input(wrapper).setValue('half')
      await input(wrapper).trigger('blur')
      expect(input(wrapper).exists()).toBe(true)

      await input(wrapper).setValue('')
      await input(wrapper).trigger('blur')
      expect(input(wrapper).exists()).toBe(false)
    })

    it('adds a tag the same way', async () => {
      const wrapper = mountEditor({ compact: true, tags: ['a'] })
      await wrapper.find('button.add-open').trigger('click')
      await type(wrapper, 'b')
      expect(emitted(wrapper)).toEqual([['a', 'b']])
    })
  })
})
