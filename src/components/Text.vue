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
import { renderMarkdown } from '../services/markdown'
import { useSharedFiles, type FileSelection } from '../services/sharedFiles'
import { useSharedModel } from '../services/sharedModel'
import { useSharedGit } from '../services/sharedGit'
import { isLoggedIn } from '../services/api'
import MarkdownEditor from './MarkdownEditor.vue'
import Modal from './Modal.vue'

const { selectedFile, clearSelectedFile } = useSharedFiles()
const { selectedModelName, selectedModelProtocol, thinkEnabled } = useSharedModel()
const { refresh: refreshGitStatus } = useSharedGit()

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
 * Saves the prose and its provenance together.
 *
 * One request for both, because a section derived from the body may not be written without
 * it: sent separately, the stored hashes would stop matching the prose and the next load
 * would discard provenance the writer had just created. No-op when nothing has changed
 * since the last save.
 *
 * At most one request is in flight at a time. A call that arrives while one is already
 * sending does not start a second -- the API's rule is last-write-wins, so whichever
 * landed second would win regardless of which was issued first -- it instead marks
 * `saveAgain`, consumed once the in-flight one settles.
 */
const save = async () => {
  const file = currentFile.value
  if (!isLoggedIn() || !file || !isDirty.value) return

  if (saving.value) {
    saveAgain = true
    return
  }

  saving.value = true
  // Cleared before sending, not after: an edit landing while this request is in
  // flight sets it true again on its own (the next keystroke's handleProseChange),
  // which is exactly the signal the resend below needs.
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
  } finally {
    saving.value = false
    if (saveAgain) {
      saveAgain = false
      save()
    }
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
 * Appends a continuation of the current text, a chunk at a time as the model writes it.
 *
 * The API saves nothing, so every chunk marks the document dirty; the debounce is
 * suspended for the duration (see `scheduleAutoSave`), and the `finally` below is
 * what writes it back, once, when the stream ends. Text that arrived before a
 * failure is kept: it is as much the writer's to keep or undo as anything they typed.
 */
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

  // Any debounce left over from typing just before Generate was clicked would
  // otherwise fire mid-stream -- the finally below is what flushes now instead.
  cancelAutoSave()
  isGenerating.value = true
  generation = new AbortController()
  try {
    await llmService.generate(
      selectedModelName.value,
      text.value,
      (delta) => {
        // Handed to the editor rather than appended here, so it goes in through the
        // browser's own insert command -- undoable like anything typed -- and is recorded as
        // written by a model. The editor emits the result, which `handleProseChange` stores.
        editor.value?.appendGenerated(delta)
        isDirty.value = true
      },
      // Only ollama honours this; anything else is left at the server's default
      // rather than sending a value that model would simply ignore.
      selectedModelProtocol.value === 'ollama' ? thinkEnabled.value : undefined,
      generation.signal
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

/** Stops a generation in progress, keeping whatever has arrived so far. */
const handleStopGenerating = () => {
  generation?.abort()
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

onMounted(() => {
  if (selectedFile.value) {
    loadFile(selectedFile.value)
  }
})

onUnmounted(() => {
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

    <div class="editor-container">
      <div v-if="!currentFile" class="no-file-pane">Select a file to start writing.</div>
      <MarkdownEditor v-else-if="!readMode" ref="editor" :prose="prose" @prose-change="handleProseChange" />
      <!-- Sanitised in renderMarkdown, through DOMPurify -- nothing here escapes that. -->
      <div v-else class="rendered-prose" v-html="renderMarkdown(text)"></div>

      <div class="actions">
        <button @click="readMode = !readMode" :disabled="!currentFile">
          {{ readMode ? 'Edit' : 'Read' }}
        </button>
        <button @click="save" :disabled="!currentFile">Save</button>
        <button v-if="isGenerating" @click="handleStopGenerating">Stop</button>
        <button class="primary" @click="handleGenerate" :disabled="!currentFile || isGenerating" :class="{ generating: isGenerating }">
          {{ isGenerating ? 'Generating…' : 'Generate' }}
        </button>
      </div>
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
</style>
