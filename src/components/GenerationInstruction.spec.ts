import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import GenerationInstruction from './GenerationInstruction.vue'
import { useSharedInstruction, resetSharedInstruction } from '../services/sharedInstruction'

describe('GenerationInstruction.vue', () => {
  afterEach(() => {
    resetSharedInstruction()
  })

  it('renders bound to the shared singleton', async () => {
    const { setInstruction } = useSharedInstruction()
    setInstruction('Make this more neutral.')

    const wrapper = mount(GenerationInstruction)
    const input = wrapper.find('input[type="text"]').element as HTMLInputElement

    expect(input.value).toBe('Make this more neutral.')
  })

  it('typing updates the shared singleton', async () => {
    const { instruction } = useSharedInstruction()
    const wrapper = mount(GenerationInstruction)

    await wrapper.find('input[type="text"]').setValue('Continue as if a day has passed.')

    expect(instruction.value).toBe('Continue as if a day has passed.')
  })

  it('caps the input at the same ceiling the API enforces', () => {
    const wrapper = mount(GenerationInstruction)
    const input = wrapper.find('input[type="text"]').element as HTMLInputElement

    expect(input.maxLength).toBe(300)
  })
})
