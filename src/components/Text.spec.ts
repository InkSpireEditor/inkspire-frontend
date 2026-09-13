import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, ref } from 'vue'
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
  let selectedFile: any

  /** The file the sidebar has open, named by its space as well as its id. */
  const OPEN = { space: 'stories' as const, id: 'a1b2c3d4e5f60718' }

  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie = 'auth_status=1; Path=/'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    selectedFile = ref<{ space: 'stories' | 'notes'; id: string } | null>(null)
    vi.spyOn(sharedFiles, 'useSharedFiles').mockReturnValue({
      selectedFile,
      selectedFileId: computed(() => selectedFile.value?.id ?? null),
      setSelectedFile: vi.fn(),
      clearSelectedFile: vi.fn()
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

  it('loads file content when the selection changes', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    
    // Trigger change
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(filesManagerService.getFileInfo).toHaveBeenCalledWith(OPEN.space, OPEN.id)
    expect(wrapper.text()).toContain('test.ink')
    const vm = wrapper.vm as any
    expect(vm.text).toBe('Initial content')
  })

  it('auto-save fires after content change', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFile.value = OPEN
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
    selectedFile.value = OPEN
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
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Simulate user editing so isDirty is true
    const vm = wrapper.vm as any
    vm.handleContentChange('Unsaved content')

    wrapper.unmount()
    await flushPromises()

    expect(filesManagerService.updateFileContent).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'Unsaved content'
    )
  })

  /** Mounts the editor with a file open and the generate mock cleared. */
  const mountWithFile = async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()
    vi.mocked(filesManagerService.updateFileContent).mockClear()
    return wrapper
  }

  const clickButton = async (wrapper: ReturnType<typeof mount>, label: string) => {
    const button = wrapper.findAll('button').find(b => b.text() === label)
    await button?.trigger('click')
    return button
  }

  it('appends each delta as it arrives and saves the result', async () => {
    const wrapper = await mountWithFile()

    vi.mocked(llmService.generate).mockImplementation(async (_model, _prompt, onDelta) => {
      onDelta(' and')
      onDelta(' then.')
    })

    await clickButton(wrapper, 'Generate')
    await flushPromises()

    expect(llmService.generate).toHaveBeenCalledWith(
      'llama3',
      'Initial content',
      expect.any(Function),
      expect.any(AbortSignal)
    )

    const vm = wrapper.vm as any
    expect(vm.text).toBe('Initial content and then.')
    // The API writes nothing now, so the client has to save what it appended.
    expect(filesManagerService.updateFileContent).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'Initial content and then.'
    )
  })

  it('offers Stop while generating and aborts when it is clicked', async () => {
    const wrapper = await mountWithFile()

    let captured: AbortSignal | undefined
    let finish: () => void = () => {}
    vi.mocked(llmService.generate).mockImplementation(
      (_model, _prompt, _onDelta, signal) => {
        captured = signal
        return new Promise<void>((resolve) => {
          finish = resolve
          signal?.addEventListener('abort', () => resolve())
        })
      }
    )

    expect(wrapper.findAll('button').some(b => b.text() === 'Stop')).toBe(false)

    await clickButton(wrapper, 'Generate')
    await flushPromises()
    expect(wrapper.findAll('button').some(b => b.text() === 'Stop')).toBe(true)

    await clickButton(wrapper, 'Stop')
    await flushPromises()

    expect(captured?.aborted).toBe(true)
    expect(wrapper.findAll('button').some(b => b.text() === 'Stop')).toBe(false)
    finish()
  })

  it('keeps the text that arrived before a failure', async () => {
    const wrapper = await mountWithFile()

    vi.mocked(llmService.generate).mockImplementation(async (_model, _prompt, onDelta) => {
      onDelta(' as far as here')
      throw new Error('provider went away')
    })

    await clickButton(wrapper, 'Generate')
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.text).toBe('Initial content as far as here')
    expect(vm.errorMessage).toBe('provider went away')
    // Partial text is still the writer's, so it is saved rather than discarded.
    expect(filesManagerService.updateFileContent).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'Initial content as far as here'
    )
  })
})

describe('Text.vue across the two spaces', () => {
  let selectedFile: any

  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie = 'auth_status=1; Path=/'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    selectedFile = ref<{ space: 'stories' | 'notes'; id: string } | null>(null)
    vi.spyOn(sharedFiles, 'useSharedFiles').mockReturnValue({
      selectedFile,
      selectedFileId: computed(() => selectedFile.value?.id ?? null),
      setSelectedFile: vi.fn(),
      clearSelectedFile: vi.fn()
    })
    vi.spyOn(sharedModel, 'useSharedModel').mockReturnValue({
      selectedModelName: ref('llama3'),
      setSelectedModel: vi.fn()
    })
    vi.mocked(filesManagerService.getFileInfo).mockResolvedValue({ name: 'scratch' })
    vi.mocked(filesManagerService.getFileContent).mockResolvedValue('A list.')
  })

  afterEach(() => {
    document.cookie = 'auth_status=; Path=/; Max-Age=0'
    vi.restoreAllMocks()
  })

  it('opens a note through the notes routes', async () => {
    const wrapper = mount(Text, { global: { stubs: { teleport: true } } })

    selectedFile.value = { space: 'notes', id: '0f1e2d3c4b5a6978' }
    await flushPromises()

    expect(filesManagerService.getFileInfo).toHaveBeenCalledWith('notes', '0f1e2d3c4b5a6978')
    expect(filesManagerService.getFileContent).toHaveBeenCalledWith('notes', '0f1e2d3c4b5a6978')
    expect(wrapper.text()).toContain('scratch')
  })
})
