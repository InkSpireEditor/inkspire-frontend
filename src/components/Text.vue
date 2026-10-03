<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { filesManagerService, NotFoundError } from '../services/filesManager'
import {
  applyEdit,
  metadataFromProse,
  proseFromMetadata,
  type Kind,
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
const { selectedModelName } = useSharedModel()
const { refresh: refreshGitStatus } = useSharedGit()

/** How long to wait after the last keystroke before writing it back to the API, in ms. */
const AUTO_SAVE_DEBOUNCE_MS = 2000

// --- Component State ---
const text = ref('')
/**
 * One kind per character of `text`, which is what a save writes back as the file's
 * provenance section.
 *
 * Kept beside the text rather than inside it: provenance is separate metadata, not markup,
 * so nothing here parses or escapes anything. Nothing draws it yet -- `MarkdownEditor` is
 * still a plain textarea -- but it has to be maintained from the moment saves go through
 * the document route, because a save that sent the prose with provenance keyed to older
 * prose would have the next load discard it.
 */
const prov = ref<Kind[]>([])
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

/** The text and its provenance as one value, which is what the pure functions take. */
const current = (): Prose => ({ text: text.value, prov: prov.value })

/**
 * Replaces the text, keeping provenance in step with it.
 *
 * The only thing allowed to change the text once a file is open. `applyEdit` carries the
 * provenance either side of the change over untouched and throws if the result would not
 * hold one kind per character, which is the one error here that silently corrupts a file.
 */
const setText = (next: string, declared?: Kind) => {
  const updated = applyEdit(current(), next, declared)
  text.value = updated.text
  prov.value = updated.prov
}

/** Starts fresh from what the API answered, discarding whatever was open. */
const openProse = (body: string, metadata: ProvenanceMetadata | null) => {
  const opened = proseFromMetadata(body, metadata)
  text.value = opened.text
  prov.value = opened.prov
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
 */
const save = async () => {
  const file = currentFile.value
  if (!isLoggedIn() || !file || !isDirty.value) return

  try {
    await filesManagerService.putDocument(
      file.space,
      file.id,
      text.value,
      metadataFromProse(current())
    )
    isDirty.value = false
    // A note is never committed, so only a chapter's save is worth a git refresh.
    if (file.space === 'stories') refreshGitStatus().catch(() => {})
  } catch (e) {
    console.error('Error saving file:', e)
    if (e instanceof NotFoundError) {
      // Nothing to save into any more. `isDirty` stays true and the text stays on
      // screen, so the writer can still copy it somewhere -- but the debounce has
      // to stop, or it would raise this same dialog on every further keystroke.
      cancelAutoSave()
      displayError(
        'This file no longer exists. It may have been renamed or deleted elsewhere. ' +
        'Your text is still here — copy it somewhere safe.'
      )
    } else {
      displayError('Failed to save the file')
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

const handleContentChange = (newContent: string) => {
  setText(newContent)
  isDirty.value = true
  scheduleAutoSave()
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
        // Undeclared, so this counts as the writer's for now. Marking a continuation as
        // `gen` is its own step, and doing it here would be a provenance claim the editor
        // cannot yet draw.
        setText(text.value + delta)
        isDirty.value = true
      },
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
      <MarkdownEditor v-if="!readMode" :content="text" @content-change="handleContentChange" />
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
