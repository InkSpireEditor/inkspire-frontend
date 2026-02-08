import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import Text from './Text.vue'
import Modal from './Modal.vue'
import { filesManagerService } from '../services/filesManager'
import { ollamaService } from '../services/ollama'
import * as sharedFiles from '../services/sharedFiles'
import * as sharedModel from '../services/sharedModel'

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
    generate: vi.fn()
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
    vi.spyOn(sharedModel, 'useSharedModel').mockReturnValue({
      selectedModelName: ref('llama3'),
      setSelectedModel: vi.fn()
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

  it('calls ollama service and applies text directly', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFileId.value = 1
    await flushPromises()
    await wrapper.vm.$nextTick()
    
    // Clear mock calls from loadFile/auto-save setup
    vi.mocked(filesManagerService.updateFileContent).mockClear()

    vi.mocked(ollamaService.generate).mockResolvedValue('AI generated text')

    // Find "Generate" button
    const generateBtn = wrapper.findAll('button').find(b => b.text() === 'Generate')
    await generateBtn?.trigger('click')
    
    await flushPromises()

    expect(ollamaService.generate).toHaveBeenCalledWith(
      'fake-token',
      1,
      'llama3',
      'Initial content'
    )
    const vm = wrapper.vm as any
    expect(vm.text).toBe('Initial contentAI generated text')
    // Should NOT be called again after generate because backend already saved
    expect(filesManagerService.updateFileContent).not.toHaveBeenCalled()
  })
})
