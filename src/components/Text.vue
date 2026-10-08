<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
import { filesManagerService, NotFoundError } from '../services/filesManager'
import {
  metadataFromProse,
  proseFromMetadata,
  type Prose,
  type ProvenanceMetadata,
} from '../services/provenance'
import { llmService } from '../services/llm'
import { cursorFromOffset, rangeFromOffsets, type Cursor, type CursorRange } from '../services/cursor'
import { renderMarkdown } from '../services/markdown'
import { useSharedFiles, type FileSelection } from '../services/sharedFiles'
import { useSharedModel } from '../services/sharedModel'
import { useSharedGit } from '../services/sharedGit'
import { useSharedSettings } from '../services/sharedSettings'
import { isLoggedIn } from '../services/api'
import MarkdownEditor from './MarkdownEditor.vue'
import Modal from './Modal.vue'
import SidePanel from './SidePanel.vue'
import GenerationSettings from './GenerationSettings.vue'

const { selectedFile, clearSelectedFile } = useSharedFiles()
const { selectedModelName, selectedModelProtocol, thinkEnabled } = useSharedModel()
const { refresh: refreshGitStatus } = useSharedGit()
const { temperature, promptBudget, prefixShare, numCtx, sendSelection } = useSharedSettings()

/** Whether the generation settings panel is slid open. Local to this component --
 *  it is a view preference, not a setting a generation needs to know about. */
const settingsOpen = ref(false)

/**
 * Whether a non-collapsed selection is live in the editor right now, bound from its
 * `selectionChange` emit. Drives the Generate/Rewrite label (frontend#25): a rewrite
 * destroys the writer's own prose, so it must not happen because a selection was
 * left over from something else -- the label is the cheapest honest warning.
 */
const hasSelection = ref(false)

/**
 * Whether the editor's own `rerollTarget()` would answer a span right now, bound
 * from its `rerollableChange` emit (api#5). What Reroll's disabled state reads.
 */
const canReroll = ref(false)

/** How long to wait after the last keystroke before writing it back to the API, in ms. */
const AUTO_SAVE_DEBOUNCE_MS = 2000

// --- Component State ---
/**
 * The open file's prose and its provenance, as one value.
 *
 * **Stored here, computed in `MarkdownEditor`.** This component is the editor's store and
 * the API's client; it never works out provenance for itself. Deriving it in both places
 * would be two answers to one question, and only the editor can give the right one — see
 * its own docstring for why.
 */
const prose = ref<Prose>(proseFromMetadata('', null))
/** The prose as text, which is what the reading view and a generation prompt want. */
const text = computed(() => prose.value.text)
/**
 * The editor, so a streamed continuation can be handed to it.
 *
 * It owns provenance, so it is the only thing that can record that a model wrote something —
 * which is known only at the moment of insertion and cannot be worked out from the text
 * afterwards.
 */
const editor = ref<InstanceType<typeof MarkdownEditor> | null>(null)
const fileName = ref('')
const currentFile = ref<FileSelection | null>(null)
const isDirty = ref(false)
/** Shows the current text rendered, in place of the editor, rather than a separate
 *  page -- there is nothing else on this file worth a whole route of its own. */
const readMode = ref(false)

// Error state
const showError = ref(false)
const errorMessage = ref('')

let autoSaveTimer: number | null = null
/** Whether a `putDocument` request is currently in flight, so a second one is never
 *  sent alongside it -- the API's rule is last-write-wins, so the one that lands
 *  second would win regardless of which was issued first. */
const saving = ref(false)
/** Set when `save` is called while one is already in flight -- the debounce firing
 *  again, a manual click, the generation `finally`, or unmount's flush. Consumed by
 *  the in-flight request's own completion, which resends once it settles rather
 *  than only on the next debounce. */
let saveAgain = false
/**
 * The chain of requests `save()` is currently driving: the in-flight `putDocument`
 * and, if `saveAgain` is set when it settles, however many resends follow before one
 * settles with nothing queued behind it. Every caller of `save()` while this is set
 * is handed this same promise rather than a fresh one, so "is the text on screen
 * right now safely on disk" is answered once the chain actually finishes -- not from
 * `isDirty`, which a resend already still in flight may have cleared optimistically
 * before it is known to have succeeded.
 */
let inFlight: Promise<boolean> | null = null

/** Stores a change the editor made. */
const handleProseChange = (next: Prose) => {
  prose.value = next
  isDirty.value = true
  scheduleAutoSave()
}

/** Starts fresh from what the API answered, discarding whatever was open. */
const openProse = (body: string, metadata: ProvenanceMetadata | null) => {
  prose.value = proseFromMetadata(body, metadata)
}

/**
 * Loads a file's name and content. Called whenever the selection changes to a file.
 *
 * The prose comes with its provenance, already reconciled against what the prose says now
 * (§7.5), so a chapter edited outside the editor opens with its runs on the right
 * characters rather than with a drift the writer has to notice. The header is not part of
 * either: the API keeps it out and puts it back at the write.
 */
const loadFile = async (file: FileSelection) => {
  if (!isLoggedIn()) return

  try {
    const [info, document] = await Promise.all([
      filesManagerService.getFileInfo(file.space, file.id),
      filesManagerService.getDocument(file.space, file.id)
    ])

    fileName.value = info.name
    openProse(document.body, document.metadata)
    currentFile.value = file
    isDirty.value = false
    readMode.value = false

    cancelAutoSave()
  } catch (e) {
    console.error('Error loading file:', e)
    if (e instanceof NotFoundError) {
      // The selection is out of date, not broken: the file was renamed, deleted, or
      // removed by a pull. Dropping it falls back to "No file selected", which is
      // what this pane shows anyway with nothing open -- there is nothing here for
      // the reader to act on, so there is nothing worth interrupting them for.
      clearSelectedFile()
    } else {
      displayError('Failed to load the file')
    }
  }
}

/**
 * Saves the prose and its provenance together, resolving `true` once the text that was
 * on screen when this was called is confirmed written -- `false` if it was not, whether
 * because the write failed or because there was nothing to confirm (not logged in, or no
 * file open).
 *
 * One request for both, because a section derived from the body may not be written without
 * it: sent separately, the stored hashes would stop matching the prose and the next load
 * would discard provenance the writer had just created.
 *
 * At most one request is in flight at a time. A call that arrives while one is already
 * sending does not start a second -- the API's rule is last-write-wins, so whichever
 * landed second would win regardless of which was issued first -- it instead marks
 * `saveAgain` and is handed the same promise the in-flight request (and whatever resend
 * `saveAgain` triggers) is already driving, via `inFlight`.
 */
const save = (): Promise<boolean> => {
  const file = currentFile.value
  if (!isLoggedIn() || !file) return Promise.resolve(false)

  if (inFlight) {
    saveAgain = true
    return inFlight
  }

  if (!isDirty.value) return Promise.resolve(true)

  inFlight = runSaveChain()
  return inFlight
}

/** Sends the current text, and again for each resend `saveAgain` queued before the
 *  previous one settled, so whoever is awaiting `save()`'s result only sees it once
 *  nothing is left to resend. */
const runSaveChain = async (): Promise<boolean> => {
  let ok = true
  do {
    saveAgain = false
    ok = await putOnce()
  } while (saveAgain)
  inFlight = null
  return ok
}

/** One `putDocument` request, with the error handling a save has always had. */
const putOnce = async (): Promise<boolean> => {
  const file = currentFile.value
  if (!file) return false

  saving.value = true
  // Cleared before sending, not after: an edit landing while this request is in
  // flight sets it true again on its own (the next keystroke's handleProseChange).
  isDirty.value = false
  try {
    await filesManagerService.putDocument(
      file.space,
      file.id,
      text.value,
      metadataFromProse(prose.value)
    )
    // A note is never committed, so only a chapter's save is worth a git refresh.
    if (file.space === 'stories') refreshGitStatus().catch(() => {})
    return true
  } catch (e) {
    console.error('Error saving file:', e)
    // The content above was never actually persisted.
    isDirty.value = true
    if (e instanceof NotFoundError) {
      // Nothing to save into any more. `isDirty` stays true and the text stays on
      // screen, so the writer can still copy it somewhere -- but the debounce has
      // to stop, or it would raise this same dialog on every further keystroke, and
      // a queued resend would do the same the instant it ran.
      cancelAutoSave()
      saveAgain = false
      displayError(
        'This file no longer exists. It may have been renamed or deleted elsewhere. ' +
        'Your text is still here — copy it somewhere safe.'
      )
    } else {
      displayError('Failed to save the file')
    }
    return false
  } finally {
    saving.value = false
  }
}

/**
 * (Re)starts the debounce so a save fires once typing pauses, replacing any
 * still-pending one from an earlier keystroke. Skipped while a generation is
 * streaming: `handleGenerate`'s own `finally` flushes once it ends, so a
 * multi-second continuation produces one save rather than one every couple
 * of seconds.
 */
const scheduleAutoSave = () => {
  cancelAutoSave()
  if (isGenerating.value) return
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null
    save()
  }, AUTO_SAVE_DEBOUNCE_MS)
}

const cancelAutoSave = () => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

const isGenerating = ref(false)
let generation: AbortController | null = null

/**
 * Saves, then streams one generation into the editor and saves again once it ends
 * -- the part `handleGenerate` and `handleReroll` share. `cursor`/`selection` are
 * each caller's own anchor; `saveFailedMessage` is shown in place of the default
 * when the save beforehand fails, since what is recoverable differs between the
 * two callers (frontend#25, api#5).
 *
 * The server reads the file fresh from disk and assembles the prompt itself
 * (`inkspire-api/docs/prompt.md`), so what it is asked to continue or rewrite is
 * whatever was last saved -- not necessarily what is on screen. `save()` is
 * awaited first, and generation is refused if it resolves `false`.
 *
 * The API saves nothing, so every chunk marks the document dirty; the debounce is
 * suspended for the duration (see `scheduleAutoSave`), and the `finally` below is
 * what writes it back, once, when the stream ends. Text that arrived before a
 * failure is kept: it is as much the writer's to keep or undo as anything they typed.
 */
const runGeneration = async (
  model: string,
  cursor: Cursor | undefined,
  selection: CursorRange | undefined,
  saveFailedMessage = 'Could not save your text before generating. Try again once it saves.',
) => {
  // Any debounce left over from typing just before this was triggered would
  // otherwise fire mid-stream -- this covers it, and covers it before the
  // request is sent rather than after.
  cancelAutoSave()
  if (!(await save())) {
    displayError(saveFailedMessage)
    return
  }

  // The save above may have taken a moment; the file could have changed meanwhile.
  const file = currentFile.value
  if (!file) return

  isGenerating.value = true
  generation = new AbortController()
  try {
    await llmService.generate(
      file.space,
      file.id,
      model,
      (delta) => {
        // Handed to the editor rather than appended here, so it goes in through the
        // browser's own insert command -- undoable like anything typed -- and is recorded as
        // written by a model. The editor emits the result, which `handleProseChange` stores.
        editor.value?.appendGenerated(delta)
        isDirty.value = true
      },
      {
        // Only ollama honours this; anything else is left at the server's default
        // rather than sending a value that model would simply ignore.
        think: selectedModelProtocol.value === 'ollama' ? thinkEnabled.value : undefined,
        signal: generation.signal,
        cursor,
        selection,
        // Sent unconditionally: the API ignores it for a continuation or a
        // fill-in-the-middle, and deciding not to send it for one here would
        // duplicate that rule in the client.
        sendSelection: sendSelection.value,
        temperature: temperature.value,
        promptBudget: promptBudget.value,
        prefixShare: prefixShare.value,
        numCtx: numCtx.value ?? undefined,
      }
    )
  } catch (e) {
    // Stopping on purpose is not a failure and needs no message.
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      console.error('Error generating text:', e)
      displayError(e instanceof Error ? e.message : 'Error generating text')
    }
  } finally {
    isGenerating.value = false
    generation = null
    save()
  }
}

/** Appends a continuation of the current text, or rewrites a live selection. */
const handleGenerate = async () => {
  if (isGenerating.value) return
  if (!text.value) return
  if (!selectedModelName.value) {
    displayError('No model selected')
    return
  }

  if (!isLoggedIn() || !currentFile.value) return

  // The editor has to be mounted to receive the continuation, and in Read mode it is not.
  // Leaving Read mode is better than refusing to generate from it: the writer is about to
  // have new prose, which is the state they wanted anyway.
  if (readMode.value) {
    readMode.value = false
    await nextTick()
  }

  // Where the caret or the selection is right now, converted to what the API wants --
  // a paragraph and an offset within it (or two, for a real selection), not a flat
  // offset into the whole text. No selection ever having landed in the editor
  // (freshly left Read mode, say) means neither at all, which the server reads as
  // "continue at the end", same as before there was one.
  const offsets = editor.value?.getSelectionOffsets() ?? null
  let cursor: Cursor | undefined
  let selection: CursorRange | undefined
  if (offsets !== null) {
    if (offsets.start === offsets.end) {
      cursor = cursorFromOffset(text.value, offsets.start)
    } else {
      selection = rangeFromOffsets(text.value, offsets.start, offsets.end)
    }
  }

  await runGeneration(selectedModelName.value, cursor, selection)
}

/**
 * Resamples the generated run at the caret (api#5): deletes it, undoably, saves,
 * then generates again with a caret where it started -- a second sample of the
 * same request that produced it, not a rewrite of the deleted span
 * (`inkspire-api/docs/prompt.md`'s "Why the server assembles" section says why).
 *
 * Unavailable in Read mode -- the editor unmounts there, which is also why this
 * does not leave Read mode and continue the way `handleGenerate` does: remounting
 * runs the editor's own `reset()`, which nulls the caret this needs.
 */
const handleReroll = async () => {
  if (isGenerating.value) return
  if (!selectedModelName.value) {
    displayError('No model selected')
    return
  }
  if (!isLoggedIn() || !currentFile.value || !canReroll.value) return

  const target = editor.value?.rerollTarget() ?? null
  if (target === null) return
  editor.value?.removeRange(target.start, target.end)

  // From the post-deletion text, before anything is awaited: the deletion has to
  // be saved before the request (the server reads from disk), and an await can
  // let the editor's state move on from under this if it is read any later --
  // the same discipline `handleGenerate`'s own offsets read keeps.
  const cursor = cursorFromOffset(text.value, target.start)

  await runGeneration(
    selectedModelName.value,
    cursor,
    undefined,
    'Could not save before generating. The deleted text is still recoverable with ' +
      'Ctrl+Z -- try again once it saves.',
  )
}

/** Stops a generation in progress, keeping whatever has arrived so far. */
const handleStopGenerating = () => {
  generation?.abort()
}

/**
 * Toggles Read mode, clearing `hasSelection` and `canReroll` on the way in.
 *
 * The editor unmounts in Read mode (replaced by the rendered-prose div below), so
 * neither emit ever fires to say its answer stopped mattering -- without this, the
 * buttons would keep reading whatever they were before Read was clicked.
 */
const toggleReadMode = () => {
  if (!readMode.value) {
    hasSelection.value = false
    canReroll.value = false
  }
  readMode.value = !readMode.value
}

const displayError = (msg: string) => {
  errorMessage.value = msg
  showError.value = true
}

// Watch for changes in selected file
watch(selectedFile, (file) => {
  cancelAutoSave()
  if (file) {
    loadFile(file)
  } else {
    currentFile.value = null
    fileName.value = ''
    openProse('', null)
    readMode.value = false
  }
})

/**
 * Warns before the browser tears the page down with unsaved text still on screen.
 *
 * `onUnmounted` below flushes on every path within the app -- switching files,
 * closing the pane -- because Vue gets to run its cleanup first. A real unload
 * (closing the tab, refreshing, navigating to another site) skips unmount hooks
 * entirely, which is the one case a writer would actually lose work in.
 *
 * There is no way to await a save from here and warn only if it fails: a
 * `beforeunload` handler cannot keep the page alive for an async result, so
 * whether a best-effort request would have survived can never be known before
 * the decision to warn has to be made. Warning whenever `isDirty` is set, rather
 * than attempting a save of its own, is the deliberately chosen tradeoff: it
 * costs a dialog on some closes that a save would quietly have survived, but
 * never gives a false sense of safety for one that would not have.
 */
const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  if (selectedFile.value) {
    loadFile(selectedFile.value)
  }
  window.addEventListener('beforeunload', warnBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  cancelAutoSave()
  if (currentFile.value) {
    save()
  }
})
</script>

<template>
  <div class="text-page">
    <div class="header">
      <p v-if="fileName" class="file-title">{{ fileName }}</p>
      <p v-else class="file-title empty">No file selected</p>
    </div>

    <div class="editor-row">
      <div class="editor-container">
        <div v-if="!currentFile" class="no-file-pane">Select a file to start writing.</div>
        <MarkdownEditor
          v-else-if="!readMode"
          ref="editor"
          :prose="prose"
          @prose-change="handleProseChange"
          @selection-change="(live) => (hasSelection = live)"
          @rerollable-change="(possible) => (canReroll = possible)"
        />
        <!-- Sanitised in renderMarkdown, through DOMPurify -- nothing here escapes that. -->
        <div v-else class="rendered-prose" v-html="renderMarkdown(text)"></div>

        <div class="actions">
          <button @click="toggleReadMode" :disabled="!currentFile">
            {{ readMode ? 'Edit' : 'Read' }}
          </button>
          <button @click="save" :disabled="!currentFile">Save</button>
          <button v-if="isGenerating" @click="handleStopGenerating">Stop</button>
          <button
            @click="handleReroll"
            :disabled="!currentFile || isGenerating || !canReroll"
            title="Put the caret in text a model wrote"
          >
            Reroll
          </button>
          <button class="primary" @click="handleGenerate" :disabled="!currentFile || isGenerating" :class="{ generating: isGenerating }">
            {{ isGenerating ? 'Generating…' : hasSelection ? 'Rewrite' : 'Generate' }}
          </button>
          <button @click="settingsOpen = !settingsOpen" :class="{ active: settingsOpen }">
            Settings
          </button>
        </div>
      </div>

      <SidePanel title="Generation" :open="settingsOpen" @close="settingsOpen = false">
        <GenerationSettings />
      </SidePanel>
    </div>

    <!-- Error Modal (Reusing Unified Modal) -->
    <Modal
      :show="showError"
      title="Error"
      confirm-text="OK"
      hide-cancel
      @close="showError = false"
      @confirm="showError = false"
    >
      <p>{{ errorMessage }}</p>
    </Modal>
  </div>
</template>

<style scoped>
.text-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

.header {
  text-align: center;
  color: var(--color-heading);
}

.file-title {
  font-size: 1.5rem;
  font-weight: var(--font-weight-bold);
  line-height: 1.3;
  letter-spacing: -0.01em;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-title.empty {
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  opacity: 0.45;
}

/* Holds the editor and the settings panel side by side. `overflow: hidden` keeps the
   panel's own slide (a negative margin, see SidePanel.vue) from ever producing a
   horizontal scrollbar on this row while it is collapsed. */
.editor-row {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
  gap: 1rem;
}

.editor-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.rendered-prose {
  flex: 1;
  min-height: 240px;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-background-soft);
  color: var(--color-text);
  line-height: 1.7;
  overflow-wrap: break-word;
  box-shadow: var(--shadow-card);
}

/* Same surface as .rendered-prose: a pane, not a writing surface, with nothing to write. */
.no-file-pane {
  flex: 1;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-background-soft);
  color: var(--color-text);
  opacity: 0.45;
}

.rendered-prose :deep(p) {
  margin: 0 0 var(--space-4) 0;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-top: 1.25rem;
}

button {
  padding: 10px 24px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
  transition: background-color var(--transition), border-color var(--transition),
    transform var(--transition), box-shadow var(--transition);
}

button:hover:not(:disabled) {
  border-color: var(--color-border-hover);
  transform: translateY(-1px);
}

button:active:not(:disabled) {
  transform: translateY(0);
}

button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

button.primary {
  background-color: var(--color-primary);
  color: white;
  border: none;
}

button.primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes pulse-border {
  0%, 100% { box-shadow: 0 0 0 0px var(--color-primary-soft); }
  50%       { box-shadow: 0 0 0 4px var(--color-primary-soft); }
}

button.generating {
  animation: pulse-border 1.2s ease-in-out infinite;
  cursor: wait;
}

button.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
</style>
