import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ModelSelector from './ModelSelector.vue'
import { modelService, type Model } from '../services/model'
import { resetSharedModel, useSharedModel } from '../services/sharedModel'
import { useSharedFiles } from '../services/sharedFiles'

vi.mock('../services/model', () => ({
  modelService: {
    getModels: vi.fn()
  }
}))

describe('ModelSelector.vue', () => {
  beforeEach(() => {
    document.cookie = 'auth_status=1; Path=/'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    document.cookie = 'auth_status=; Path=/; Max-Age=0'
    vi.clearAllMocks()
    resetSharedModel()
  })

  it('names the select for assistive technology, with no visible heading', () => {
    const wrapper = mount(ModelSelector)
    expect(wrapper.find('select').attributes('aria-label')).toBe('Model')
    expect(wrapper.find('h3').exists()).toBe(false)
  })

  it('fetches and displays models on mount', async () => {
    const mockModels: Model[] = [
      { name: 'Llama3', protocol: 'ollama' },
      { name: 'Gemma', protocol: 'ollama' }
    ]
    vi.mocked(modelService.getModels).mockResolvedValue(mockModels)

    const wrapper = mount(ModelSelector)
    await flushPromises()

    const options = wrapper.findAll('option')
    expect(options).toHaveLength(2)
    expect(options[0]?.text()).toBe('Llama3')
    expect(options[1]?.text()).toBe('Gemma')

    const vm = wrapper.vm as any
    expect(vm.selectedModelName).toBe('Llama3')
  })

  it('displays error message when fetch fails', async () => {
    vi.mocked(modelService.getModels).mockRejectedValue(new Error('Network Error'))

    const wrapper = mount(ModelSelector)
    await flushPromises()

    expect(wrapper.find('.error').exists()).toBe(true)
    expect(wrapper.find('.error').text()).toBe('Network Error')
  })

  it('does not fetch when there is no active session', async () => {
    document.cookie = 'auth_status=; Path=/; Max-Age=0'
    mount(ModelSelector)
    await flushPromises()
    expect(modelService.getModels).not.toHaveBeenCalled()
  })

  describe('models whose provider refuses a tag of the open file (inkspire-api#33)', () => {
    const MODELS: Model[] = [
      { name: 'local/llama3', protocol: 'ollama', refused_tags: [] },
      { name: 'hosted/big', protocol: 'openai', refused_tags: ['perso'] },
      { name: 'older/model', protocol: 'openai' }
    ]

    const mountWith = async (tags: string[]) => {
      vi.mocked(modelService.getModels).mockResolvedValue(MODELS)
      useSharedFiles().setSelectedTags(tags)
      const wrapper = mount(ModelSelector)
      await flushPromises()
      return wrapper
    }

    const option = (wrapper: ReturnType<typeof mount>, name: string) =>
      wrapper.findAll('option').find((o) => o.attributes('value') === name)!

    afterEach(() => useSharedFiles().clearSelectedFile())

    it('disables them and says which tag, while the file carries it', async () => {
      const wrapper = await mountWith(['perso'])

      expect(option(wrapper, 'hosted/big').attributes('disabled')).toBeDefined()
      expect(option(wrapper, 'hosted/big').text()).toBe('hosted/big (not for "perso")')
    })

    it('leaves the others alone, including a server that sends no list at all', async () => {
      const wrapper = await mountWith(['perso'])

      expect(option(wrapper, 'local/llama3').attributes('disabled')).toBeUndefined()
      expect(option(wrapper, 'local/llama3').text()).toBe('local/llama3')
      expect(option(wrapper, 'older/model').attributes('disabled')).toBeUndefined()
    })

    it('disables nothing for a file without the tag', async () => {
      const wrapper = await mountWith(['idea'])
      expect(wrapper.findAll('option[disabled]')).toHaveLength(0)
    })

    it('follows the open file: the model is allowed again once the tag is gone', async () => {
      const wrapper = await mountWith(['perso'])

      useSharedFiles().setSelectedTags([])
      await flushPromises()

      expect(option(wrapper, 'hosted/big').attributes('disabled')).toBeUndefined()
      expect(option(wrapper, 'hosted/big').text()).toBe('hosted/big')
    })

    it('records the provider\'s refused tags with the model it selects', async () => {
      vi.mocked(modelService.getModels).mockResolvedValue([MODELS[1]!])
      const wrapper = mount(ModelSelector)
      await flushPromises()

      expect(useSharedModel().selectedModelName.value).toBe('hosted/big')
      expect(useSharedModel().selectedModelRefusedTags.value).toEqual(['perso'])
      wrapper.unmount()
    })

    it('records them again when another model is chosen, and none for one that sends none', async () => {
      const wrapper = await mountWith([])

      await wrapper.find('select').setValue('hosted/big')
      expect(useSharedModel().selectedModelRefusedTags.value).toEqual(['perso'])

      await wrapper.find('select').setValue('older/model')
      expect(useSharedModel().selectedModelRefusedTags.value).toEqual([])
    })
  })
})
