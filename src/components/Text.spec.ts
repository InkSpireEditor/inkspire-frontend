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
import * as sharedSettings from '../services/sharedSettings'

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
    generate: vi.fn(),
    getDefaults: vi.fn()
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
      selectedModelProtocol: ref(null),
      thinkEnabled: ref(false),
      setSelectedModel: vi.fn(),
      setThinkEnabled: vi.fn()
    })
    vi.spyOn(sharedGit, 'useSharedGit').mockReturnValue({
      gitStatus: ref(null),
      refresh: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn()
    })
    vi.spyOn(sharedSettings, 'useSharedSettings').mockReturnValue({
      temperature: ref(1.0),
      promptBudget: ref(10000),
      prefixShare: ref(0.75),
      numCtx: ref(null),
      loaded: ref(true),
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      setTemperature: vi.fn(),
      setPromptBudget: vi.fn(),
      setPrefixShare: vi.fn(),
      setNumCtx: vi.fn(),
      reset: vi.fn()
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

  it('flushes a pending edit before generating, does not autosave during the stream, and flushes once it ends', async () => {
    const wrapper = await mountWithFile()
    vi.mocked(filesManagerService.putDocument).mockResolvedValue({ ok: true })

    let resolveGenerate: () => void = () => {}
    vi.mocked(llmService.generate).mockImplementation(
      (_space, _id, _model, onDelta) =>
        new Promise<void>((resolve) => {
          resolveGenerate = () => {
            onDelta(' streamed.')
            resolve()
          }
        })
    )

    // A keystroke just before Generate leaves a pending debounce that generating
    // should cancel -- the explicit flush below covers it instead, before the
    // request is even sent, since the server reads the file fresh from disk.
    const vm = wrapper.vm as any
    vm.handleProseChange(typed('Changed just before generating'))
    await clickButton(wrapper, 'Generate')
    await flushPromises()

    expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)
    expect(filesManagerService.putDocument).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'Changed just before generating',
      handwritten('Changed just before generating')
    )

    vi.advanceTimersByTime(10000)
    await flushPromises()
    // No autosave fires from the deltas arriving while the stream is open.
    expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)

    resolveGenerate()
    await flushPromises()

    expect(filesManagerService.putDocument).toHaveBeenCalledTimes(2)
    expect(filesManagerService.putDocument).toHaveBeenLastCalledWith(
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

  describe('overlapping saves', () => {
    /** Replaces the next `putDocument` call with a promise the test resolves by hand,
     *  so a request can be held "in flight" for as long as the test needs. */
    const holdNextPut = () => {
      let resolve: (value: unknown) => void = () => {}
      const held = new Promise((r) => { resolve = r })
      vi.mocked(filesManagerService.putDocument).mockReturnValueOnce(held as any)
      return () => resolve({ ok: true })
    }

    it('does not start a second request while one is in flight, and resends once it settles', async () => {
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()
      const vm = wrapper.vm as any

      const finishFirst = holdNextPut()
      vm.handleProseChange(typed('First'))
      vi.advanceTimersByTime(2000)
      await flushPromises()
      expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)

      // An edit lands, and a manual save is also asked for, while that first
      // request is still in flight -- neither may start a second one of its own.
      // `save()` now resolves once the whole chain settles, so it is not awaited
      // yet here -- the first request is still being held.
      vi.mocked(filesManagerService.putDocument).mockResolvedValue({ ok: true })
      vm.handleProseChange(typed('First and more'))
      const resent = vm.save()
      await flushPromises()
      expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)

      finishFirst()
      expect(await resent).toBe(true)

      // Settling resends exactly once, carrying what landed during the flight --
      // not one extra request per thing that asked for a save.
      expect(filesManagerService.putDocument).toHaveBeenCalledTimes(2)
      expect(filesManagerService.putDocument).toHaveBeenLastCalledWith(
        OPEN.space,
        OPEN.id,
        'First and more',
        handwritten('First and more')
      )
    })

    it('does not resend after a plain failure with nothing new to send', async () => {
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()
      const vm = wrapper.vm as any

      vi.mocked(filesManagerService.putDocument).mockRejectedValueOnce(new Error('boom'))
      vm.handleProseChange(typed('Unlucky'))
      vi.advanceTimersByTime(2000)
      await flushPromises()

      expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)
      expect(vm.isDirty).toBe(true)
      expect(vm.errorMessage).toBe('Failed to save the file')
    })
  })

  describe('warning before an unload', () => {
    /**
     * The handler this component registered for 'beforeunload', found through a spy
     * rather than a real `window.dispatchEvent` -- plenty of other tests in this file
     * mount `Text` and never unmount it, so the real event bus can carry other
     * components' listeners long after their own test has finished. Finding this
     * component's own handler, and calling it directly with a stand-in event, is
     * what keeps this test about this component alone.
     */
    const theRegisteredHandler = (addSpy: ReturnType<typeof vi.spyOn>) => {
      const call = addSpy.mock.calls.find(([type]: [string, unknown]) => type === 'beforeunload')
      return call?.[1] as (event: Event) => void
    }

    const fakeEvent = () => ({ preventDefault: vi.fn(), returnValue: '' }) as unknown as Event

    it('warns when there is unsaved text', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()

      const vm = wrapper.vm as any
      vm.handleProseChange(typed('Changed, not yet saved'))

      const event = fakeEvent()
      theRegisteredHandler(addSpy)(event)
      expect(event.preventDefault).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('does not warn with nothing unsaved', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()

      const event = fakeEvent()
      theRegisteredHandler(addSpy)(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('stops listening once unmounted', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()

      const handler = theRegisteredHandler(addSpy)
      wrapper.unmount()

      expect(removeSpy).toHaveBeenCalledWith('beforeunload', handler)
    })
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

  it('refuses to generate when the pre-generate save fails, and never calls the API', async () => {
    // The server reads the file fresh from disk once asked to generate -- asking
    // it to continue text that failed to save would ask about a sentence that was
    // never actually written.
    const wrapper = await mountWithFile()
    const vm = wrapper.vm as any
    vm.handleProseChange(typed('Changed just before generating'))
    vi.mocked(filesManagerService.putDocument).mockRejectedValueOnce(new Error('boom'))

    await clickButton(wrapper, 'Generate')
    await flushPromises()

    expect(llmService.generate).not.toHaveBeenCalled()
    expect(vm.errorMessage).toContain('save')
    // The failed edit is still on screen and still marked unsaved.
    expect(vm.text).toBe('Changed just before generating')
    expect(vm.isDirty).toBe(true)
  })

  it('appends each delta as it arrives and saves the result', async () => {
    const wrapper = await mountWithFile()

    vi.mocked(llmService.generate).mockImplementation(async (_space, _id, _model, onDelta) => {
      onDelta(' and')
      onDelta(' then.')
    })

    await clickButton(wrapper, 'Generate')
    await flushPromises()

    expect(llmService.generate).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'llama3',
      expect.any(Function),
      {
        // The mocked model has no protocol, so this is left for the server's own
        // default rather than a value it would ignore.
        think: undefined,
        signal: expect.any(AbortSignal),
        // No selection has ever landed in this test's editor, so there is no caret
        // to report -- the server reads that as "continue at the end".
        cursor: undefined,
        temperature: 1.0,
        promptBudget: 10000,
        prefixShare: 0.75,
        numCtx: undefined,
      }
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

  it('sends think when the selected model is ollama and the box is checked', async () => {
    const wrapper = await mountWithFile()
    const shared = sharedModel.useSharedModel()
    shared.selectedModelProtocol.value = 'ollama'
    shared.thinkEnabled.value = true

    vi.mocked(llmService.generate).mockResolvedValue(undefined)
    await clickButton(wrapper, 'Generate')
    await flushPromises()

    expect(llmService.generate).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'llama3',
      expect.any(Function),
      {
        think: true,
        signal: expect.any(AbortSignal),
        cursor: undefined,
        temperature: 1.0,
        promptBudget: 10000,
        prefixShare: 0.75,
        numCtx: undefined,
      }
    )
  })

  it('omits think for a protocol that cannot honour it, even with the box checked', async () => {
    // Nothing sets selectedModelProtocol to 'ollama' for this model, so the
    // checkbox would not even be shown -- thinkEnabled lingering true from an
    // earlier reasoning model must not leak into a request this one would ignore.
    const wrapper = await mountWithFile()
    const shared = sharedModel.useSharedModel()
    shared.selectedModelProtocol.value = 'openai'
    shared.thinkEnabled.value = true

    vi.mocked(llmService.generate).mockResolvedValue(undefined)
    await clickButton(wrapper, 'Generate')
    await flushPromises()

    expect(llmService.generate).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'llama3',
      expect.any(Function),
      {
        think: undefined,
        signal: expect.any(AbortSignal),
        cursor: undefined,
        temperature: 1.0,
        promptBudget: 10000,
        prefixShare: 0.75,
        numCtx: undefined,
      }
    )
  })

  it('reports the caret as a paragraph and an offset within it', async () => {
    // Selection only behaves like a browser's once the element is actually in the
    // document, which `mountWithFile` does not attach -- this test mounts for itself.
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } },
      attachTo: document.body
    })
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()
    vi.mocked(filesManagerService.putDocument).mockClear()
    vi.mocked(llmService.generate).mockResolvedValue(undefined)

    const editorElement = wrapper.find('[contenteditable]').element
    const range = document.createRange()
    range.setStart(editorElement.firstChild!, 'Initial'.length)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))

    await clickButton(wrapper, 'Generate')
    await flushPromises()

    // "Initial content" is one paragraph, so the caret after "Initial" is simply
    // that offset within paragraph 0.
    expect(llmService.generate).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'llama3',
      expect.any(Function),
      {
        think: undefined,
        signal: expect.any(AbortSignal),
        cursor: { para: 0, offset: 'Initial'.length },
        temperature: 1.0,
        promptBudget: 10000,
        prefixShare: 0.75,
        numCtx: undefined,
      }
    )
    wrapper.unmount()
  })

  it('offers Stop while generating and aborts when it is clicked', async () => {
    const wrapper = await mountWithFile()

    let captured: AbortSignal | undefined
    let finish: () => void = () => {}
    vi.mocked(llmService.generate).mockImplementation(
      (_space, _id, _model, _onDelta, options) => {
        captured = options?.signal
        return new Promise<void>((resolve) => {
          finish = resolve
          options?.signal?.addEventListener('abort', () => resolve())
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

    vi.mocked(llmService.generate).mockImplementation(async (_space, _id, _model, onDelta) => {
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
      selectedModelProtocol: ref(null),
      thinkEnabled: ref(false),
      setSelectedModel: vi.fn(),
      setThinkEnabled: vi.fn()
    })
    vi.spyOn(sharedGit, 'useSharedGit').mockReturnValue({
      gitStatus: ref(null),
      refresh: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn()
    })
    vi.spyOn(sharedSettings, 'useSharedSettings').mockReturnValue({
      temperature: ref(1.0),
      promptBudget: ref(10000),
      prefixShare: ref(0.75),
      numCtx: ref(null),
      loaded: ref(true),
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      setTemperature: vi.fn(),
      setPromptBudget: vi.fn(),
      setPrefixShare: vi.fn(),
      setNumCtx: vi.fn(),
      reset: vi.fn()
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
