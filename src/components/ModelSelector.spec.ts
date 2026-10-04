import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ModelSelector from './ModelSelector.vue'
import { modelService, type Model } from '../services/model'
import { resetSharedModel } from '../services/sharedModel'

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

  it('renders title', () => {
    const wrapper = mount(ModelSelector)
    expect(wrapper.find('h3').text()).toBe('Models')
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

  describe('the thinking checkbox', () => {
    it('is shown for an ollama model and hidden for one that cannot honour it', async () => {
      const mockModels: Model[] = [
        { name: 'Llama3', protocol: 'ollama' },
        { name: 'gpt-4', protocol: 'openai' }
      ]
      vi.mocked(modelService.getModels).mockResolvedValue(mockModels)

      const wrapper = mount(ModelSelector)
      await flushPromises()
      // The first model is selected automatically, and it is the ollama one.
      expect(wrapper.find('.think-toggle').exists()).toBe(true)

      await wrapper.find('select').setValue('gpt-4')
      expect(wrapper.find('.think-toggle').exists()).toBe(false)
    })

    it('is absent with no model selected yet', () => {
      const wrapper = mount(ModelSelector)
      expect(wrapper.find('.think-toggle').exists()).toBe(false)
    })

    it('updates the shared setting when toggled', async () => {
      const mockModels: Model[] = [{ name: 'Llama3', protocol: 'ollama' }]
      vi.mocked(modelService.getModels).mockResolvedValue(mockModels)

      const wrapper = mount(ModelSelector)
      await flushPromises()

      const checkbox = wrapper.find('.think-toggle input')
      expect((checkbox.element as HTMLInputElement).checked).toBe(false)

      await checkbox.setValue(true)

      const vm = wrapper.vm as any
      expect(vm.thinkEnabled).toBe(true)
    })
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
})
