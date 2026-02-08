import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ModelSelector from './ModelSelector.vue'
import { modelService } from '../services/model'
import { resetSharedModel } from '../services/sharedModel'

vi.mock('../services/model', () => ({
  modelService: {
    getModels: vi.fn()
  }
}))

describe('ModelSelector.vue', () => {
  beforeEach(() => {
    localStorage.setItem('jwt_token', 'fake-token')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    resetSharedModel()
  })

  it('renders title', () => {
    const wrapper = mount(ModelSelector)
    expect(wrapper.find('h3').text()).toBe('Models')
  })

  it('fetches and displays models on mount', async () => {
    const mockModels = [{ name: 'Llama3' }, { name: 'Gemma' }]
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

  it('does not fetch if no token is present', async () => {
    localStorage.clear()
    mount(ModelSelector)
    await flushPromises()
    expect(modelService.getModels).not.toHaveBeenCalled()
  })
})
