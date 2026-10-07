import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GenerationSettings from './GenerationSettings.vue'
import { llmService } from '../services/llm'
import { resetSharedSettings } from '../services/sharedSettings'

vi.mock('../services/llm', () => ({
  llmService: {
    getDefaults: vi.fn()
  }
}))

const DEFAULTS = {
  temperature: 1.0,
  prompt_budget: 10000,
  prefix_share: 0.75,
  num_ctx: null,
  think: null,
}

describe('GenerationSettings.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(llmService.getDefaults).mockResolvedValue({ ...DEFAULTS })
    localStorage.clear()
    resetSharedSettings()
  })

  afterEach(() => {
    localStorage.clear()
    resetSharedSettings()
  })

  it('initialises its sliders from the defaults route', async () => {
    const wrapper = mount(GenerationSettings)
    await flushPromises()

    const temperature = wrapper.find('input[type="range"]')
    expect((temperature.element as HTMLInputElement).value).toBe('1')
  })

  it('moving the temperature slider updates and persists it', async () => {
    const wrapper = mount(GenerationSettings)
    await flushPromises()

    const ranges = wrapper.findAll('input[type="range"]')
    await ranges[0]!.setValue('1.4')

    const stored = JSON.parse(localStorage.getItem('inkspire.generationSettings')!)
    expect(stored.temperature).toBe(1.4)
  })

  it('moving the prompt budget slider shows an updated token estimate', async () => {
    const wrapper = mount(GenerationSettings)
    await flushPromises()

    const ranges = wrapper.findAll('input[type="range"]')
    await ranges[1]!.setValue('4780') // ~1000 tokens at 4.78 chars/token

    expect(wrapper.text()).toContain('1,000 tokens')
  })

  it('an empty context window input is read as "no override"', async () => {
    const wrapper = mount(GenerationSettings)
    await flushPromises()

    const numCtx = wrapper.find('input[type="number"]')
    await numCtx.setValue('8192')
    await numCtx.setValue('')

    const stored = JSON.parse(localStorage.getItem('inkspire.generationSettings')!)
    expect(stored.numCtx).toBeNull()
  })

  it('warns once the budget estimate reaches the configured context window', async () => {
    const wrapper = mount(GenerationSettings)
    await flushPromises()

    expect(wrapper.find('.field-warning').exists()).toBe(false)

    const numCtx = wrapper.find('input[type="number"]')
    // Default budget is 10000 chars, ~2092 tokens -- comfortably under a 100000 window.
    await numCtx.setValue('100000')
    expect(wrapper.find('.field-warning').exists()).toBe(false)

    // A tiny window the estimate already reaches or exceeds.
    await numCtx.setValue('100')
    expect(wrapper.find('.field-warning').exists()).toBe(true)
  })

  it('reset restores the servers defaults', async () => {
    vi.mocked(llmService.getDefaults).mockResolvedValue({
      temperature: 0.8,
      prompt_budget: 5000,
      prefix_share: 0.6,
      num_ctx: null,
      think: null,
    })
    const wrapper = mount(GenerationSettings)
    await flushPromises()

    const ranges = wrapper.findAll('input[type="range"]')
    await ranges[0]!.setValue('1.9')

    await wrapper.find('button.reset').trigger('click')
    await flushPromises()

    expect((ranges[0]!.element as HTMLInputElement).value).toBe('0.8')
  })
})
