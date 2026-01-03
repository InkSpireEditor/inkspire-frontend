import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import Text from './Text.vue'
import Modal from './Modal.vue'
import { filesManagerService } from '../services/filesManager'
import { ollamaService } from '../services/ollama'
import * as sharedFiles from '../services/sharedFiles'

// Mock services
vi.mock('../services/filesManager', () => ({
  filesManagerService: {
    getFileInfo: vi.fn(),
    getFileContent: vi.fn(),
    updateFileContent: vi.fn(),
    getDirContent: vi.fn()
  }
}))

vi.mock('../services/ollama', () => ({
  ollamaService: {
    addButtonOllama: vi.fn()
  }
}))

describe('Text.vue', () => {
  let selectedFileId: any
  
  beforeEach(() => {
    localStorage.setItem('jwt_token', 'fake-token')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    selectedFileId = ref<number | null>(null)
    vi.spyOn(sharedFiles, 'useSharedFiles').mockReturnValue({
      selectedFileId,
      setSelectedFile: vi.fn()
    })
    
    vi.mocked(filesManagerService.getFileInfo).mockResolvedValue({ name: 'test.ink' })
    vi.mocked(filesManagerService.getFileContent).mockResolvedValue('Initial content')
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue(JSON.stringify({ files: {} }))
    vi.useFakeTimers()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders placeholder when no file is selected', () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    expect(wrapper.text()).toContain('No file selected')
  })

  it('loads file content when selectedFileId changes', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    
    // Trigger change
    selectedFileId.value = 1
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(filesManagerService.getFileInfo).toHaveBeenCalled()
    expect(wrapper.text()).toContain('test.ink')
    const vm = wrapper.vm as any
    expect(vm.text).toBe('Initial content')
  })

  it('saves content every 5 seconds (auto-save)', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFileId.value = 1
    await flushPromises()
    await wrapper.vm.$nextTick()

    vi.advanceTimersByTime(5000)
    expect(filesManagerService.updateFileContent).toHaveBeenCalled()
  })

  it('opens generate modal and calls ollama service', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFileId.value = 1
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Find "Generate" button
    const generateBtn = wrapper.findAll('button').find(b => b.text() === 'Generate')
    await generateBtn?.trigger('click')
    
    const modal = wrapper.findComponent(Modal)
    expect(modal.props('show')).toBe(true)

    vi.mocked(ollamaService.addButtonOllama).mockResolvedValue(JSON.stringify({
      param: { response: 'AI generated text' }
    }))

    // Find the textarea in the modal - it's inside the Modal component now
    const modalInput = wrapper.find('textarea[placeholder*="Describe"]')
    await modalInput.setValue('Write a story')
    
    await modal.vm.$emit('confirm')
    await flushPromises()

    expect(ollamaService.addButtonOllama).toHaveBeenCalled()
    expect(wrapper.find('.validation-container').exists()).toBe(true)
    expect((wrapper.find('.validation-container textarea').element as HTMLTextAreaElement).value).toBe('AI generated text')
  })

  it('applies generated text to editor', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFileId.value = 1
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Manually set state to simulate AI response received
    const vm = wrapper.vm as any
    vm.generatedText = ' - AI suffix'
    vm.pendingValidation = true
    await wrapper.vm.$nextTick()

    // Find "Apply (Yes)" button
    const applyBtn = wrapper.findAll('button').find(b => b.text().includes('Apply'))
    await applyBtn?.trigger('click')
    
    expect(vm.text).toBe('Initial content - AI suffix')
    expect(vm.pendingValidation).toBe(false)
  })
})
