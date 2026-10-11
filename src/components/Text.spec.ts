import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyEdit, metadataFromProse, proseFromMetadata, type Prose } from '../services/provenance'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, ref, type Ref } from 'vue'
import Text from './Text.vue'
import MarkdownEditor from './MarkdownEditor.vue'
import Modal from './Modal.vue'
import { filesManagerService, NotFoundError } from '../services/filesManager'
import { llmService } from '../services/llm'
import * as sharedFiles from '../services/sharedFiles'
import * as sharedModel from '../services/sharedModel'
import * as sharedGit from '../services/sharedGit'
import * as sharedSettings from '../services/sharedSettings'
import * as sharedFeatures from '../services/sharedFeatures'
import * as sharedInstruction from '../services/sharedInstruction'

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
      getDirContent: vi.fn(),
      editFile: vi.fn()
    }
  }
})

vi.mock('../services/llm', () => ({
  llmService: {
    generate: vi.fn(),
    getDefaults: vi.fn(),
    getFeatures: vi.fn(),
    suggestTitle: vi.fn(),
    complete: vi.fn()
  }
}))

// Text.vue reaches for the route (for the title-proposal event's storyId) and,
// through `useRename`, the router -- without this, mounting it with no router
// plugin installed would leave both injected as undefined.
const mockReplace = vi.fn().mockResolvedValue(undefined)
const mockRoute = { name: 'home', params: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useRoute: () => mockRoute
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
  /** Whether the dice button has anything to call -- `sharedFeatures`'s `title`. */
  let titleFeature: Ref<boolean>
  /** Whether the editor proposes a completion on idle (frontend#9) --
   *  `sharedSettings`'s `autoComplete`. Off by default; a test in that block
   *  flips it. */
  let autoComplete: Ref<boolean>
  /** The writer's own one-off steering for the next generation (api#19) --
   *  `sharedInstruction`'s `instruction`. Empty by default; a test in that block
   *  sets it directly, the same way `autoComplete` is flipped directly above. */
  let instructionRef: Ref<string>
  /** A real spy, not a no-op: a test asserts the file-switch watcher actually
   *  cleared it, which a bare `vi.fn()` could not show. */
  let mockClearInstruction: () => void

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
    // Off by default -- a test in the auto-complete block (frontend#9) flips it.
    autoComplete = ref(false)
    vi.spyOn(sharedSettings, 'useSharedSettings').mockReturnValue({
      temperature: ref(1.0),
      promptBudget: ref(10000),
      prefixShare: ref(0.75),
      numCtx: ref(null),
      sendSelection: ref(true),
      autoComplete,
      loaded: ref(true),
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      setTemperature: vi.fn(),
      setPromptBudget: vi.fn(),
      setPrefixShare: vi.fn(),
      setNumCtx: vi.fn(),
      setSendSelection: vi.fn(),
      setAutoComplete: vi.fn(),
      reset: vi.fn()
    })
    // Empty by default -- a test in the instruction block (api#19) sets it
    // directly, the way `autoComplete` is flipped directly above.
    instructionRef = ref('')
    mockClearInstruction = vi.fn(() => {
      instructionRef.value = ''
    })
    vi.spyOn(sharedInstruction, 'useSharedInstruction').mockReturnValue({
      instruction: instructionRef,
      setInstruction: vi.fn((value: string) => {
        instructionRef.value = value
      }),
      clearInstruction: mockClearInstruction
    })
    // Off by default -- a test in the title-proposal block (frontend#30) flips it.
    titleFeature = ref(false)
    vi.spyOn(sharedFeatures, 'useSharedFeatures').mockReturnValue({
      title: titleFeature,
      loaded: ref(true),
      ensureLoaded: vi.fn().mockResolvedValue(undefined)
    })
    mockRoute.name = 'home'
    mockRoute.params = {}

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

  it('auto-save fires 1s after the last keystroke, not before', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } }
    })
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any
    vm.handleProseChange(typed('Changed content'))

    vi.advanceTimersByTime(999)
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
    // Each keystroke restarts the 1s wait, so as long as they arrive closer
    // together than that, nothing saves until the run stops.
    vm.handleProseChange(typed('C'))
    vi.advanceTimersByTime(400)
    vm.handleProseChange(typed('Ch'))
    vi.advanceTimersByTime(400)
    vm.handleProseChange(typed('Cha'))
    await flushPromises()
    expect(filesManagerService.putDocument).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
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

  /** Generates once via the Generate button, leaving a `gen` run at the end of
   *  the text and the caret collapsed right after it -- the state Reroll
   *  (api#5) and Discard (frontend#33) both act on. */
  const generateOnce = async (wrapper: ReturnType<typeof mount>, delta: string) => {
    vi.mocked(llmService.generate).mockImplementationOnce(
      async (_space, _id, _model, onDelta) => {
        onDelta(delta)
      }
    )
    await clickButton(wrapper, 'Generate')
    await flushPromises()
    vi.mocked(llmService.generate).mockClear()
    vi.mocked(filesManagerService.putDocument).mockClear()
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
        sendSelection: true,
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
        sendSelection: true,
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
        sendSelection: true,
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
        sendSelection: true,
        temperature: 1.0,
        promptBudget: 10000,
        prefixShare: 0.75,
        numCtx: undefined,
      }
    )
    wrapper.unmount()
  })

  it('reports a live selection as a range, with no cursor, and the button reads Rewrite', async () => {
    const wrapper = mount(Text, {
      global: { stubs: { teleport: true } },
      attachTo: document.body
    })
    selectedFile.value = OPEN
    await flushPromises()
    await wrapper.vm.$nextTick()
    vi.mocked(filesManagerService.putDocument).mockClear()
    vi.mocked(llmService.generate).mockResolvedValue(undefined)

    // "Initial content" -- selects "content" (offsets 8 to 15).
    const editorElement = wrapper.find('[contenteditable]').element
    const range = document.createRange()
    range.setStart(editorElement.firstChild!, 'Initial '.length)
    range.setEnd(editorElement.firstChild!, 'Initial content'.length)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    await wrapper.vm.$nextTick()

    expect(
      wrapper.findAll('button').find((b) => b.text() === 'Rewrite' || b.text() === 'Generate')!.text()
    ).toBe('Rewrite')

    await clickButton(wrapper, 'Rewrite')
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
        selection: { start: { para: 0, offset: 8 }, end: { para: 0, offset: 15 } },
        sendSelection: true,
        temperature: 1.0,
        promptBudget: 10000,
        prefixShare: 0.75,
        numCtx: undefined,
      }
    )
    wrapper.unmount()
  })

  it('a collapsed selection still sends a cursor, not a selection', async () => {
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

    expect(llmService.generate).toHaveBeenCalledWith(
      OPEN.space,
      OPEN.id,
      'llama3',
      expect.any(Function),
      {
        think: undefined,
        signal: expect.any(AbortSignal),
        cursor: { para: 0, offset: 'Initial'.length },
        selection: undefined,
        sendSelection: true,
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

  describe('Ctrl+Enter (frontend#32)', () => {
    it('triggers the same generation Clicking Generate would', async () => {
      const wrapper = await mountWithFile()

      vi.mocked(llmService.generate).mockImplementation(async (_space, _id, _model, onDelta) => {
        onDelta(' and then.')
      })

      await wrapper.find('.text-page').trigger('keydown', { key: 'Enter', ctrlKey: true })
      await flushPromises()

      expect(llmService.generate).toHaveBeenCalledTimes(1)
      const vm = wrapper.vm as any
      expect(vm.text).toBe('Initial content and then.')
    })

    it('does nothing without the Ctrl modifier', async () => {
      const wrapper = await mountWithFile()

      await wrapper.find('.text-page').trigger('keydown', { key: 'Enter' })
      await flushPromises()

      expect(llmService.generate).not.toHaveBeenCalled()
    })

    it('still fires from a keydown that bubbles up from inside the editor', async () => {
      const wrapper = await mountWithFile()

      vi.mocked(llmService.generate).mockImplementation(async (_space, _id, _model, onDelta) => {
        onDelta(' and then.')
      })

      await wrapper.find('[contenteditable]').trigger('keydown', { key: 'Enter', ctrlKey: true })
      await flushPromises()

      expect(llmService.generate).toHaveBeenCalledTimes(1)
    })
  })

  describe("the writer's own instruction (api#19)", () => {
    it('sends what is typed when Generate is clicked', async () => {
      const wrapper = await mountWithFile()
      instructionRef.value = 'Make this more neutral.'

      vi.mocked(llmService.generate).mockImplementation(async (_space, _id, _model, onDelta) => {
        onDelta(' and then.')
      })

      await clickButton(wrapper, 'Generate')
      await flushPromises()

      expect(llmService.generate).toHaveBeenCalledWith(
        OPEN.space,
        OPEN.id,
        'llama3',
        expect.any(Function),
        expect.objectContaining({ instruction: 'Make this more neutral.' })
      )
    })

    it('sends nothing when the field is empty', async () => {
      const wrapper = await mountWithFile()

      vi.mocked(llmService.generate).mockImplementation(async (_space, _id, _model, onDelta) => {
        onDelta(' and then.')
      })

      await clickButton(wrapper, 'Generate')
      await flushPromises()

      const [, , , , options] = vi.mocked(llmService.generate).mock.calls[0]!
      expect(options?.instruction).toBeUndefined()
    })

    it('is cleared when the selected file changes', async () => {
      await mountWithFile()
      instructionRef.value = 'Make this more neutral.'

      selectedFile.value = { space: 'notes', id: '0f1e2d3c4b5a6978' }
      await flushPromises()

      expect(instructionRef.value).toBe('')
    })

    it('is not cleared by toggling Read mode', async () => {
      const wrapper = await mountWithFile()
      instructionRef.value = 'Make this more neutral.'

      await clickButton(wrapper, 'Read')
      await clickButton(wrapper, 'Edit')

      expect(instructionRef.value).toBe('Make this more neutral.')
    })
  })

  describe('reroll (api#5)', () => {
    const rerollButton = (wrapper: ReturnType<typeof mount>) =>
      wrapper.findAll('button').find((b) => b.text() === 'Reroll')!

    it('sends whatever instruction is currently typed, not a snapshot from the original generation (api#19)', async () => {
      const wrapper = await mountWithFile()
      await generateOnce(wrapper, ' and then.')

      // Typed only now, after the generation the reroll is resampling -- proves
      // this is read live, not carried over from when that first call was made.
      instructionRef.value = 'Make this more neutral.'
      vi.mocked(llmService.generate).mockImplementationOnce(
        async (_space, _id, _model, onDelta) => {
          onDelta(' instead.')
        }
      )
      await rerollButton(wrapper).trigger('click')
      await flushPromises()

      expect(llmService.generate).toHaveBeenCalledWith(
        OPEN.space,
        OPEN.id,
        'llama3',
        expect.any(Function),
        expect.objectContaining({ instruction: 'Make this more neutral.' })
      )
    })

    it('is disabled with no generated run, and enabled once there is one', async () => {
      const wrapper = await mountWithFile()
      expect(rerollButton(wrapper).attributes('disabled')).toBeDefined()

      await generateOnce(wrapper, ' and then.')
      expect(rerollButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('deletes the generated run, saves, and resamples with a caret where it started -- no selection', async () => {
      const wrapper = await mountWithFile()
      await generateOnce(wrapper, ' and then.')
      expect((wrapper.vm as any).text).toBe('Initial content and then.')

      vi.mocked(llmService.generate).mockImplementationOnce(
        async (_space, _id, _model, onDelta) => {
          onDelta(' instead.')
        }
      )
      await rerollButton(wrapper).trigger('click')
      await flushPromises()

      // The generated run (" and then.") is gone, saved without it, then a fresh
      // sample lands at the same caret -- not a rewrite of what was deleted, so
      // no `selection` is ever sent.
      expect(filesManagerService.putDocument).toHaveBeenCalledWith(
        OPEN.space,
        OPEN.id,
        'Initial content',
        handwritten('Initial content')
      )
      expect(llmService.generate).toHaveBeenCalledWith(
        OPEN.space,
        OPEN.id,
        'llama3',
        expect.any(Function),
        {
          think: undefined,
          signal: expect.any(AbortSignal),
          cursor: { para: 0, offset: 'Initial content'.length },
          sendSelection: true,
          temperature: 1.0,
          promptBudget: 10000,
          prefixShare: 0.75,
          numCtx: undefined,
        }
      )
      expect((wrapper.vm as any).text).toBe('Initial content instead.')
    })

    it('refuses to generate when the post-deletion save fails, naming Ctrl+Z', async () => {
      const wrapper = await mountWithFile()
      await generateOnce(wrapper, ' and then.')
      vi.mocked(filesManagerService.putDocument).mockRejectedValueOnce(new Error('boom'))

      await rerollButton(wrapper).trigger('click')
      await flushPromises()

      expect(llmService.generate).not.toHaveBeenCalled()
      const vm = wrapper.vm as any
      expect(vm.errorMessage).toContain('Ctrl+Z')
      // The deletion itself still happened -- Ctrl+Z is what the message points at.
      expect(vm.text).toBe('Initial content')
    })

    it('is disabled in Read mode, since the editor it needs is unmounted there', async () => {
      const wrapper = await mountWithFile()
      await generateOnce(wrapper, ' and then.')
      expect(rerollButton(wrapper).attributes('disabled')).toBeUndefined()

      const readToggle = wrapper.findAll('button').find((b) => b.text() === 'Read')!
      await readToggle.trigger('click')

      expect(rerollButton(wrapper).attributes('disabled')).toBeDefined()
    })
  })

  describe('discard (frontend#33)', () => {
    const discardButton = (wrapper: ReturnType<typeof mount>) =>
      wrapper.findAll('button').find((b) => b.text() === 'Discard')!

    it('is disabled with no generated run, and enabled once there is one', async () => {
      const wrapper = await mountWithFile()
      expect(discardButton(wrapper).attributes('disabled')).toBeDefined()

      await generateOnce(wrapper, ' and then.')
      expect(discardButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('deletes the generated run, saves without it, and asks no model', async () => {
      const wrapper = await mountWithFile()
      await generateOnce(wrapper, ' and then.')
      const vm = wrapper.vm as any
      expect(vm.text).toBe('Initial content and then.')

      await discardButton(wrapper).trigger('click')
      await flushPromises()

      // Nothing was asked of a model -- this is Reroll's first half with no
      // generation after it.
      expect(llmService.generate).not.toHaveBeenCalled()
      expect(vm.text).toBe('Initial content')

      // The deletion is an ordinary edit from here on, written back by the
      // existing autosave debounce -- no save call of its own.
      vi.advanceTimersByTime(1000)
      await flushPromises()
      expect(filesManagerService.putDocument).toHaveBeenCalledWith(
        OPEN.space,
        OPEN.id,
        'Initial content',
        handwritten('Initial content')
      )
    })

    it("leaves the writer's own correction alone, discarding only the generated text after it", async () => {
      const wrapper = await mountWithFile()
      await generateOnce(wrapper, ' and then.')
      const vm = wrapper.vm as any
      const before = vm.text as string // 'Initial content and then.'

      // A correction typed inside the generated run splits it into
      // gen/fix/gen (`classify`'s own rule): both neighbours of the insertion
      // are generated text, so the inserted character is marked `fix`.
      const splitAt = before.indexOf('and') + 'and'.length
      const corrected = before.slice(0, splitAt) + '!' + before.slice(splitAt)

      const element = wrapper.find('[contenteditable]').element as HTMLElement
      element.textContent = corrected
      const textNode = element.firstChild
      if (textNode) {
        const range = document.createRange()
        range.setStart(textNode, splitAt + 1)
        range.collapse(true)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
      element.dispatchEvent(new InputEvent('input', { inputType: 'insertText' }))
      await flushPromises()

      // The caret now sits right after the correction, at the start of the
      // trailing `gen` run -- which is what Discard removes.
      await discardButton(wrapper).trigger('click')
      await flushPromises()

      expect(vm.text).toBe(corrected.slice(0, splitAt + 1))
    })

    it('is disabled in Read mode, since the editor it needs is unmounted there', async () => {
      const wrapper = await mountWithFile()
      await generateOnce(wrapper, ' and then.')
      expect(discardButton(wrapper).attributes('disabled')).toBeUndefined()

      const readToggle = wrapper.findAll('button').find((b) => b.text() === 'Read')!
      await readToggle.trigger('click')

      expect(discardButton(wrapper).attributes('disabled')).toBeDefined()
    })

    it('is disabled while a generation is streaming', async () => {
      const wrapper = await mountWithFile()
      await generateOnce(wrapper, ' and then.')

      let resolveGen: () => void = () => {}
      vi.mocked(llmService.generate).mockImplementation(
        () => new Promise<void>((resolve) => { resolveGen = resolve })
      )
      await clickButton(wrapper, 'Generate')
      await flushPromises()
      expect(discardButton(wrapper).attributes('disabled')).toBeDefined()

      resolveGen()
      await flushPromises()
    })

    it('cancels any idle-completion timer the deletion itself started, so no ' +
      'proposal appears for the spot it just removed from', async () => {
      const wrapper = await mountWithFile()
      await generateOnce(wrapper, ' and then.')
      autoComplete.value = true

      await discardButton(wrapper).trigger('click')
      await flushPromises()

      vi.advanceTimersByTime(2000)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
    })
  })

  describe('title proposal (frontend#30)', () => {
    const diceButton = (wrapper: ReturnType<typeof mount>) =>
      wrapper.find('[aria-label="Propose a title"]')

    it('is absent when the feature is off', async () => {
      const wrapper = await mountWithFile()
      expect(diceButton(wrapper).exists()).toBe(false)
    })

    it('is absent for a note, even with the feature on', async () => {
      titleFeature.value = true
      const wrapper = await mountWithFile()
      selectedFile.value = { space: 'notes', id: 'n1' }
      await flushPromises()

      expect(diceButton(wrapper).exists()).toBe(false)
    })

    it('is present for a stories file once the feature is on', async () => {
      titleFeature.value = true
      const wrapper = await mountWithFile()
      expect(diceButton(wrapper).exists()).toBe(true)
      expect(diceButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('asks for a title, then renames the file to it', async () => {
      titleFeature.value = true
      const wrapper = await mountWithFile()
      vi.mocked(llmService.suggestTitle).mockResolvedValue('The Wax Still Held')
      vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new-id' })

      await diceButton(wrapper).trigger('click')
      await flushPromises()

      expect(llmService.suggestTitle).toHaveBeenCalledWith(OPEN.id)
      expect(filesManagerService.editFile).toHaveBeenCalledWith(
        OPEN.space,
        OPEN.id,
        'The Wax Still Held'
      )
    })

    it('dispatches stories:changed, carrying the write route\'s story id', async () => {
      mockRoute.name = 'write'
      mockRoute.params = { id: 'story-1', fileId: OPEN.id }
      titleFeature.value = true
      const wrapper = await mountWithFile()
      vi.mocked(llmService.suggestTitle).mockResolvedValue('A Title')
      vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new-id' })
      const listener = vi.fn()
      window.addEventListener('stories:changed', listener)

      await diceButton(wrapper).trigger('click')
      await flushPromises()

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ detail: { storyId: 'story-1' } })
      )
      window.removeEventListener('stories:changed', listener)
    })

    it('shows an error and renames nothing when the suggestion request fails', async () => {
      titleFeature.value = true
      const wrapper = await mountWithFile()
      vi.mocked(llmService.suggestTitle).mockRejectedValue(new Error('No small model is configured.'))

      await diceButton(wrapper).trigger('click')
      await flushPromises()

      expect(filesManagerService.editFile).not.toHaveBeenCalled()
      const vm = wrapper.vm as any
      expect(vm.errorMessage).toBe('No small model is configured.')
    })

    it('is not hidden in Read mode -- it never touches the editor', async () => {
      titleFeature.value = true
      const wrapper = await mountWithFile()
      const readToggle = wrapper.findAll('button').find((b) => b.text() === 'Read')!
      await readToggle.trigger('click')

      expect(diceButton(wrapper).exists()).toBe(true)
      expect(diceButton(wrapper).attributes('disabled')).toBeUndefined()
    })
  })

  describe('clicking the title (frontend#30 follow-on)', () => {
    const titleButton = (wrapper: ReturnType<typeof mount>) =>
      wrapper.find('button.file-title')

    const listenOnce = () => {
      const listener = vi.fn()
      window.addEventListener('text:edit-title', listener, { once: true })
      return listener
    }

    it('dispatches text:edit-title with the space, id and current name', async () => {
      const wrapper = await mountWithFile()
      const listener = listenOnce()

      await titleButton(wrapper).trigger('click')

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { space: OPEN.space, id: OPEN.id, name: 'test.ink', parentId: undefined },
        }),
      )
    })

    it('carries the story id as parentId on the write route', async () => {
      mockRoute.name = 'write'
      mockRoute.params = { id: 'story-1', fileId: OPEN.id }
      const wrapper = await mountWithFile()
      const listener = listenOnce()

      await titleButton(wrapper).trigger('click')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ detail: expect.objectContaining({ parentId: 'story-1' }) }),
      )
    })

    it('opens no second modal of its own -- there is no title-edit Modal in this component', async () => {
      const wrapper = await mountWithFile()
      await titleButton(wrapper).trigger('click')
      await flushPromises()

      // The only Modal this component ever shows is the error one; clicking the
      // title must not reveal any other.
      expect(wrapper.findAllComponents(Modal)).toHaveLength(1)
    })

    it('does nothing with no file open', () => {
      const wrapper = mount(Text, { global: { stubs: { teleport: true } } })
      expect(wrapper.find('button.file-title').exists()).toBe(false)
    })
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

  describe('an idle completion proposal (frontend#9)', () => {
    /**
     * A stand-in for the real editor: what these tests exercise is `Text.vue`'s
     * own orchestration -- the idle timer, its guards, the save-then-fetch
     * sequence, and what it hands the editor -- not the real editor's DOM
     * behaviour, which `MarkdownEditor.spec.ts` already covers on its own.
     * `offsets` is mutable so a test can move the caret between calls.
     */
    const stubEditor = (offsets: { start: number; end: number } | null) => {
      // The stub's own `methods` go through Vue's public-instance wrapping, which
      // `toHaveBeenCalledWith` cannot see through -- these are the real spies,
      // called by the thin methods below, and what a test asserts against.
      const mocks = {
        showProposal: vi.fn(),
        clearProposal: vi.fn(),
        acceptProposal: vi.fn(),
        appendGenerated: vi.fn(),
        removeRange: vi.fn()
      }
      const component = {
        offsets,
        name: 'MarkdownEditor',
        props: ['prose'],
        emits: ['proseChange', 'selectionChange', 'rerollableChange', 'proposalChange'],
        template: '<div></div>',
        methods: {
          getSelectionOffsets(this: { offsets: typeof offsets }) {
            return this.offsets
          },
          showProposal: (text: string) => mocks.showProposal(text),
          clearProposal: () => mocks.clearProposal(),
          acceptProposal: () => mocks.acceptProposal(),
          appendGenerated: (delta: string) => mocks.appendGenerated(delta),
          rerollTarget: () => null,
          removeRange: (start: number, end: number) => mocks.removeRange(start, end)
        }
      }
      return { component, mocks }
    }

    /** Mounts with a file open and the caret collapsed at the end of its text,
     *  auto-complete on -- the state every positive case in this block starts
     *  from. */
    const mountIdle = async (body = 'The door creaked.') => {
      vi.mocked(filesManagerService.getDocument).mockResolvedValue({
        body,
        metadata: null,
        reconciled: null
      })
      autoComplete.value = true
      const { component, mocks } = stubEditor({ start: body.length, end: body.length })
      const wrapper = mount(Text, {
        global: { stubs: { teleport: true, MarkdownEditor: component } }
      })
      selectedFile.value = OPEN
      await flushPromises()
      await wrapper.vm.$nextTick()
      vi.mocked(filesManagerService.putDocument).mockClear()
      const editorStub = wrapper.findComponent({ name: 'MarkdownEditor' })
      return { wrapper, editorStub, editorMocks: mocks, body }
    }

    it('does nothing before 2s of idling', async () => {
      const { wrapper } = await mountIdle()
      const vm = wrapper.vm as any
      vm.handleProseChange(typed('The door creaked open.'))

      vi.advanceTimersByTime(1999)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
    })

    it('saves, asks for a completion, and shows what comes back', async () => {
      const { wrapper, editorStub, editorMocks } = await mountIdle()
      vi.mocked(filesManagerService.putDocument).mockResolvedValue({ ok: true })
      vi.mocked(llmService.complete).mockResolvedValue(' open.')
      const body = 'The door creaked open.'
      editorStub.vm.offsets = { start: body.length, end: body.length }
      const vm = wrapper.vm as any
      vm.handleProseChange(typed(body))

      // In two steps, with a flush between them, so the autosave's own request
      // (the 1s debounce) actually settles before the idle timer (the 2s one)
      // fires -- otherwise this would race the same way a real save finishing
      // in well under 1s never does.
      vi.advanceTimersByTime(1000)
      await flushPromises()
      vi.advanceTimersByTime(1000)
      await flushPromises()

      expect(filesManagerService.putDocument).toHaveBeenCalledTimes(1)
      expect(llmService.complete).toHaveBeenCalledWith(
        OPEN.space,
        OPEN.id,
        'llama3',
        expect.anything()
      )
      expect(editorMocks.showProposal).toHaveBeenCalledWith(' open.')
    })

    it('still fires with the caret right before a single trailing newline', async () => {
      // A single trailing newline is not its own reachable caret position in
      // most browsers -- the caret at the visual end of a file ending in one
      // lands one offset short of the text's own length, not at it. Nearly
      // every real chapter ends in exactly one `\n`, which is what made this
      // never fire on a real file while every test here used a body with no
      // trailing newline at all.
      const body = 'The door creaked open.\n'
      const { wrapper, editorStub, editorMocks } = await mountIdle(body)
      vi.mocked(filesManagerService.putDocument).mockResolvedValue({ ok: true })
      vi.mocked(llmService.complete).mockResolvedValue(' open.')
      // The caret a real browser reports for "the very end" of this body:
      // right before the trailing `\n`, one short of body.length -- not at it.
      editorStub.vm.offsets = { start: body.length - 1, end: body.length - 1 }
      const vm = wrapper.vm as any
      vm.handleProseChange(typed(body))

      vi.advanceTimersByTime(1000)
      await flushPromises()
      vi.advanceTimersByTime(1000)
      await flushPromises()

      expect(llmService.complete).toHaveBeenCalled()
      expect(editorMocks.showProposal).toHaveBeenCalledWith(' open.')
    })

    it('does nothing with the setting off', async () => {
      const { wrapper } = await mountIdle()
      autoComplete.value = false
      const vm = wrapper.vm as any
      vm.handleProseChange(typed('The door creaked open.'))

      vi.advanceTimersByTime(10000)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
    })

    it('does nothing with no model selected', async () => {
      const { wrapper } = await mountIdle()
      vi.mocked(filesManagerService.putDocument).mockResolvedValue({ ok: true })
      vi.spyOn(sharedModel, 'useSharedModel').mockReturnValue({
        selectedModelName: ref(null),
        selectedModelProtocol: ref(null),
        thinkEnabled: ref(false),
        setSelectedModel: vi.fn(),
        setThinkEnabled: vi.fn()
      })
      const vm = wrapper.vm as any
      vm.handleProseChange(typed('The door creaked open.'))

      vi.advanceTimersByTime(10000)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
    })

    it('does nothing with the caret away from the end of the text', async () => {
      const { wrapper, editorStub } = await mountIdle()
      editorStub.vm.offsets = { start: 3, end: 3 }
      const vm = wrapper.vm as any
      vm.handleProseChange(typed('The door creaked open.'))

      vi.advanceTimersByTime(10000)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
    })

    it('does nothing with a live selection', async () => {
      const { wrapper, editorStub } = await mountIdle()
      editorStub.vm.offsets = { start: 3, end: 7 }
      const vm = wrapper.vm as any
      vm.handleProseChange(typed('The door creaked open.'))

      vi.advanceTimersByTime(10000)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
    })

    it('does nothing while a real generation is in flight', async () => {
      const { wrapper } = await mountIdle()
      const vm = wrapper.vm as any
      vm.isGenerating = true
      vm.handleProseChange(typed('The door creaked open.'))

      vi.advanceTimersByTime(10000)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
    })

    it('does nothing in Read mode', async () => {
      const { wrapper } = await mountIdle()
      const vm = wrapper.vm as any
      vm.readMode = true
      vm.handleProseChange(typed('The door creaked open.'))

      vi.advanceTimersByTime(10000)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
    })

    it('asks nothing when the pre-fetch save fails, and shows no modal', async () => {
      const { wrapper } = await mountIdle()
      vi.mocked(filesManagerService.putDocument).mockRejectedValue(new Error('offline'))
      const vm = wrapper.vm as any
      vm.handleProseChange(typed('The door creaked open.'))

      vi.advanceTimersByTime(2000)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
      expect(wrapper.find('.text-page').html()).not.toContain('offline')
    })

    it('shows no modal when the completion request itself fails', async () => {
      const { wrapper } = await mountIdle()
      vi.mocked(filesManagerService.putDocument).mockResolvedValue({ ok: true })
      vi.mocked(llmService.complete).mockRejectedValue(new Error('Too many requests'))
      const vm = wrapper.vm as any
      vm.handleProseChange(typed('The door creaked open.'))

      vi.advanceTimersByTime(2000)
      await flushPromises()

      expect(vm.showError).toBe(false)
    })

    it('restarts the 2s wait on every keystroke', async () => {
      const { wrapper } = await mountIdle()
      const vm = wrapper.vm as any
      vm.handleProseChange(typed('The door creaked o'))
      vi.advanceTimersByTime(900)
      vm.handleProseChange(typed('The door creaked op'))
      vi.advanceTimersByTime(900)
      await flushPromises()

      expect(llmService.complete).not.toHaveBeenCalled()
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
      sendSelection: ref(true),
      autoComplete: ref(false),
      loaded: ref(true),
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      setTemperature: vi.fn(),
      setPromptBudget: vi.fn(),
      setPrefixShare: vi.fn(),
      setNumCtx: vi.fn(),
      setSendSelection: vi.fn(),
      setAutoComplete: vi.fn(),
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
