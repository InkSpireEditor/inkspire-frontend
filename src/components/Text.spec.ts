import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import Text from './Text.vue'
import Modal from './Modal.vue'
import { filesManagerService } from '../services/filesManager'
import { llmService } from '../services/llm'
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

vi.mock('../services/llm', () => ({
  llmService: {
    generate: vi.fn()
  }
}))

describe('Text.vue', () => {
  let selectedFileId: any
  
  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie = 'auth_status=1; Path=/'
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
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({ files: {} })
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.cookie = 'auth_status=; Path=/; Max-Age=0'
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

  it('auto-save fires after content change', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFileId.value = 1
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Simulate user editing
    const vm = wrapper.vm as any
    vm.handleContentChange('Changed content')

    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(filesManagerService.updateFileContent).toHaveBeenCalled()
  })

  it('auto-save skips API call when content is unchanged', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFileId.value = 1
    await flushPromises()
    await wrapper.vm.$nextTick()

    // No content change — isDirty remains false
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(filesManagerService.updateFileContent).not.toHaveBeenCalled()
  })

  it('flushes unsaved content to the backend on unmount', async () => {
    vi.mocked(filesManagerService.updateFileContent).mockResolvedValue('OK')
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFileId.value = 1
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Simulate user editing so isDirty is true
    const vm = wrapper.vm as any
    vm.handleContentChange('Unsaved content')

    wrapper.unmount()
    await flushPromises()

    expect(filesManagerService.updateFileContent).toHaveBeenCalledWith(
      1,
      'Unsaved content'
    )
  })

  it('calls llm service and applies text directly', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFileId.value = 1
    await flushPromises()
    await wrapper.vm.$nextTick()
    
    // Clear mock calls from loadFile/auto-save setup
    vi.mocked(filesManagerService.updateFileContent).mockClear()

    vi.mocked(llmService.generate).mockResolvedValue('AI generated text')

    // Find "Generate" button
    const generateBtn = wrapper.findAll('button').find(b => b.text() === 'Generate')
    await generateBtn?.trigger('click')
    
    await flushPromises()

    expect(llmService.generate).toHaveBeenCalledWith(
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
