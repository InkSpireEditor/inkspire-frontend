import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyEdit, metadataFromProse, proseFromMetadata, type Prose } from '../services/provenance'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, ref } from 'vue'
import Text from './Text.vue'
import MarkdownEditor from './MarkdownEditor.vue'
import Modal from './Modal.vue'
import { filesManagerService, NotFoundError } from '../services/filesManager'
import { llmService } from '../services/llm'
import * as sharedFiles from '../services/sharedFiles'
import * as sharedModel from '../services/sharedModel'
import * as sharedGit from '../services/sharedGit'

// Mock services. NotFoundError is the real class: Text.vue branches on it with
// instanceof, so a stand-in would not be recognised.
vi.mock('../services/filesManager', async () => {
  const actual = await vi.importActual<typeof import('../services/filesManager')>(
    '../services/filesManager'
  )
  return {
    ...actual,
    filesManagerService: {
      getFileInfo: vi.fn(),
      getDocument: vi.fn(),
      putDocument: vi.fn(),
      getDirContent: vi.fn()
    }
  }
})

vi.mock('../services/llm', () => ({
  llmService: {
    generate: vi.fn()
  }
}))

/**
 * The provenance a save sends for prose nothing model-written has touched: one entry per
 * paragraph, each an empty run list. Derived rather than written out, so a test says what
 * it means instead of carrying a hash nobody can check by eye.
 */
const handwritten = (body: string) => metadataFromProse(proseFromMetadata(body, null))

/**
 * What `MarkdownEditor` emits after a writer types `body`. The editor owns provenance, so a
 * test standing in for it hands over the whole prose rather than a string.
 */
const typed = (body: string) => proseFromMetadata(body, null)

/**
 * The provenance a save sends after a continuation: `before` is the writer's, `added` is the
 * model's. Derived, so a test states the shape rather than a hash and a pair of offsets.
 */
const continued = (before: string, added: string) =>
  metadataFromProse(applyEdit(typed(before), before + added, 'gen'))

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
      // Clears for real, so a test can see what the pane falls back to rather than
      // only that the call happened.
      clearSelectedFile: () => {
        selectedFile.value = null
      }
    })
    vi.spyOn(sharedModel, 'useSharedModel').mockReturnValue({
      selectedModelName: ref('llama3'),
      setSelectedModel: vi.fn()
    })
    vi.spyOn(sharedGit, 'useSharedGit').mockReturnValue({
      gitStatus: ref(null),
      refresh: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn()
    })
    
    vi.mocked(filesManagerService.getFileInfo).mockResolvedValue({ name: 'test.ink' })
    vi.mocked(filesManagerService.getDocument).mockResolvedValue({
      body: 'Initial content',
      metadata: null,
      reconciled: null
    })
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue(
    { id: '1', name: 'Example Story', summary: '', files: [] },
  )
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
    // Nothing editable is on screen with no file open -- there is nothing to save,
    // and typing here would otherwise be accepted and silently go nowhere.
    expect(wrapper.findComponent(MarkdownEditor).exists()).toBe(false)
    expect(wrapper.find('.no-file-pane').exists()).toBe(true)
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

  it('auto-save fires 2s after the last keystroke, not before', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any
    vm.handleProseChange(typed('Changed content'))

    vi.advanceTimersByTime(1999)
    await flushPromises()
    expect(filesManagerService.putDocument).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)
  })

  it('debounces a run of keystrokes into a single save', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any
    // Each keystroke restarts the 2s wait, so as long as they arrive closer
    // together than that, nothing saves until the run stops.
    vm.handleProseChange(typed('C'))
    vi.advanceTimersByTime(1000)
    vm.handleProseChange(typed('Ch'))
    vi.advanceTimersByTime(1000)
    vm.handleProseChange(typed('Cha'))
    await flushPromises()
    expect(filesManagerService.putDocument).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)
    expect(filesManagerService.putDocument).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'Cha',
      handwritten('Cha')
    )
  })

  it('auto-save skips API call when content is unchanged', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()

    // No content change — isDirty remains false, and no debounce was even scheduled
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(filesManagerService.putDocument).not.toHaveBeenCalled()
  })

  it('does not autosave while generating, but flushes once the stream ends', async () => {
    const wrapper = await mountWithFile()

    let resolveGenerate: () => void = () => {}
    vi.mocked(llmService.generate).mockImplementation(
      (_model, _prompt, onDelta) =>
        new Promise<void>((resolve) => {
          resolveGenerate = () => {
            onDelta(' streamed.')
            resolve()
          }
        })
    )

    // A keystroke just before Generate leaves a pending debounce that generating
    // should cancel, not let fire mid-stream.
    const vm = wrapper.vm as any
    vm.handleProseChange(typed('Changed just before generating'))
    await clickButton(wrapper, 'Generate')
    await flushPromises()

    vi.advanceTimersByTime(10000)
    await flushPromises()
    expect(filesManagerService.putDocument).not.toHaveBeenCalled()

    resolveGenerate()
    await flushPromises()

    expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)
    expect(filesManagerService.putDocument).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'Changed just before generating streamed.',
      continued('Changed just before generating', ' streamed.')
    )
  })

  describe('a selection the API no longer has', () => {
    it('drops the selection instead of raising a dialog, on load', async () => {
      vi.mocked(filesManagerService.getFileInfo).mockRejectedValue(
        new NotFoundError('No file with that id')
      )
      vi.mocked(filesManagerService.getDocument).mockRejectedValue(
        new NotFoundError('No file with that id')
      )
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })

      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()

      expect(selectedFile.value).toBeNull()
      expect(wrapper.text()).toContain('No file selected')
      expect(wrapper.findComponent(Modal).props('show')).toBe(false)
    })

    it('still raises a dialog for any other load failure', async () => {
      vi.mocked(filesManagerService.getFileInfo).mockRejectedValue(new Error('boom'))
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })

      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()

      expect(selectedFile.value).not.toBeNull()
      expect((wrapper.vm as any).errorMessage).toBe('Failed to load the file')
    })

    it('says so once on save, and stops retrying', async () => {
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()

      vi.mocked(filesManagerService.putDocument).mockRejectedValue(
        new NotFoundError('No file with that id')
      )
      const vm = wrapper.vm as any
      vm.handleProseChange(typed('Changed content'))

      vi.advanceTimersByTime(5000)
      await flushPromises()
      expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)
      expect(vm.errorMessage).toContain('no longer exists')

      // The timer is stopped, so the same dialog does not come back every interval.
      vi.advanceTimersByTime(20000)
      await flushPromises()
      expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)
      // The writer's text is still on screen to copy out of.
      expect(vm.text).toBe('Changed content')
    })
  })

  it('flushes unsaved content to the backend on unmount', async () => {
    vi.mocked(filesManagerService.putDocument).mockResolvedValue({ ok: true })
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Simulate user editing so isDirty is true
    const vm = wrapper.vm as any
    vm.handleProseChange(typed('Unsaved content'))

    wrapper.unmount()
    await flushPromises()

    expect(filesManagerService.putDocument).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'Unsaved content',
      handwritten('Unsaved content')
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
    vi.mocked(filesManagerService.putDocument).mockClear()
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
    expect(filesManagerService.putDocument).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'Initial content and then.',
      continued('Initial content', ' and then.')
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
    expect(filesManagerService.putDocument).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'Initial content as far as here',
      continued('Initial content', ' as far as here')
    )
  })

  describe('the Read toggle', () => {
    const readToggle = (wrapper: ReturnType<typeof mount>) =>
      wrapper.findAll('button').find((b) => b.text() === 'Read' || b.text() === 'Edit')!

    it('swaps the editor for the rendered prose, and back', async () => {
      vi.mocked(filesManagerService.getDocument).mockResolvedValue({
        body: '# A Title',
        metadata: null,
        reconciled: null
      })
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()

      expect(wrapper.find('[contenteditable]').exists()).toBe(true)
      expect(readToggle(wrapper).text()).toBe('Read')

      await readToggle(wrapper).trigger('click')
      expect(wrapper.find('[contenteditable]').exists()).toBe(false)
      expect(wrapper.find('.rendered-prose h1').text()).toBe('A Title')
      expect(readToggle(wrapper).text()).toBe('Edit')

      await readToggle(wrapper).trigger('click')
      expect(wrapper.find('[contenteditable]').exists()).toBe(true)
      expect(wrapper.find('.rendered-prose').exists()).toBe(false)
    })

    it('renders exactly what is currently typed, including an unsaved edit', async () => {
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()

      const vm = wrapper.vm as any
      vm.handleProseChange(typed('Something **bold**, not yet saved.'))
      await wrapper.vm.$nextTick()

      await readToggle(wrapper).trigger('click')
      expect(wrapper.find('.rendered-prose').html()).toContain('<strong>bold</strong>')
      expect(filesManagerService.putDocument).not.toHaveBeenCalled()
    })

    it('does not autosave while showing the rendered prose instead of the editor', async () => {
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()
      await readToggle(wrapper).trigger('click')

      vi.advanceTimersByTime(10000)
      await flushPromises()

      expect(filesManagerService.putDocument).not.toHaveBeenCalled()
    })

    it('starts a newly opened file back in edit mode, even if the last one was in Read', async () => {
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()
      await readToggle(wrapper).trigger('click')
      expect(readToggle(wrapper).text()).toBe('Edit')

      selectedFile.value = { space: 'notes', id: '0f1e2d3c4b5a6978' }
      await flushPromises()

      expect(readToggle(wrapper).text()).toBe('Read')
      expect(wrapper.find('[contenteditable]').exists()).toBe(true)
    })
  })


  describe('a chapter that already has provenance', () => {
    // The chain this proves, link by link: GET /document answers body and metadata ->
    // openProse builds a Prose from *both* -> the prose prop carries it -> the editor's
    // watcher adopts it without rebuilding from the text. Before the editor owned
    // provenance its prop was a bare string and it called proseFromMetadata(body, null),
    // and that `null` threw away everything a file had recorded.
    const PARA = 'The door creaked. The streets glistened like wet glass under the lamplight.'
    const PARA_HASH = '47f57caaa4fb330e'

    const openWithRuns = async () => {
      vi.mocked(filesManagerService.getDocument).mockResolvedValue({
        body: `${PARA}\n`,
        metadata: { [PARA_HASH]: [[18, 45, 'gen'], [45, 54, 'fix']] },
        reconciled: null
      })
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    }

    it('hands the stored runs to the editor, not a blank slate', async () => {
      const wrapper = await openWithRuns()
      const given = wrapper.findComponent(MarkdownEditor).props('prose') as Prose

      expect(given.text).toBe(`${PARA}\n`)
      expect(given.prov).toHaveLength(PARA.length + 1)
      expect(given.prov.slice(18, 45)).toEqual(new Array(27).fill('gen'))
      expect(given.prov.slice(45, 54)).toEqual(new Array(9).fill('fix'))
      expect(given.prov[75]).toBe('user')
    })

    it('saves them back unchanged when nothing was edited', async () => {
      const wrapper = await openWithRuns()
      const vm = wrapper.vm as any
      vm.isDirty = true
      await vm.save()

      expect(filesManagerService.putDocument).toHaveBeenCalledWith(OPEN.space, OPEN.id, `${PARA}\n`, {
        [PARA_HASH]: [[18, 45, 'gen'], [45, 54, 'fix']]
      })
    })

    it('still has them after the editor is unmounted and brought back', async () => {
      // Which is what the Read toggle does. The editor rebuilds from the prop on mount, so
      // it has to be the prose and not the text.
      const wrapper = await openWithRuns()
      const vm = wrapper.vm as any

      vm.readMode = true
      await wrapper.vm.$nextTick()
      expect(wrapper.findComponent(MarkdownEditor).exists()).toBe(false)

      vm.readMode = false
      await wrapper.vm.$nextTick()
      const given = wrapper.findComponent(MarkdownEditor).props('prose') as Prose
      expect(given.prov.slice(18, 45)).toEqual(new Array(27).fill('gen'))
    })
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
    vi.spyOn(sharedGit, 'useSharedGit').mockReturnValue({
      gitStatus: ref(null),
      refresh: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn()
    })
    vi.mocked(filesManagerService.getFileInfo).mockResolvedValue({ name: 'scratch' })
    vi.mocked(filesManagerService.getDocument).mockResolvedValue({
      body: 'A list.',
      metadata: null,
      reconciled: null
    })
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
    expect(filesManagerService.getDocument).toHaveBeenCalledWith('notes', '0f1e2d3c4b5a6978')
    expect(wrapper.text()).toContain('scratch')
  })
})
