<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { filesManagerService, NotFoundError } from '../services/filesManager'
import { llmService } from '../services/llm'
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
const fileName = ref('')
const currentFile = ref<FileSelection | null>(null)
const isDirty = ref(false)

// Error state
const showError = ref(false)
const errorMessage = ref('')

let autoSaveTimer: number | null = null

/**
 * Loads a file's name and content. Called whenever the selection changes to a file.
 *
 * The content is the prose alone: the API keeps the file's header out of it, and puts
 * the header back when the prose is saved.
 */
const loadFile = async (file: FileSelection) => {
  if (!isLoggedIn()) return

  try {
    const [info, content] = await Promise.all([
      filesManagerService.getFileInfo(file.space, file.id),
      filesManagerService.getFileContent(file.space, file.id)
    ])

    fileName.value = info.name
    text.value = content
    currentFile.value = file
    isDirty.value = false

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
 * Saves the current text content to the backend.
 * No-op when content has not changed since the last save.
 */
const save = async () => {
  const file = currentFile.value
  if (!isLoggedIn() || !file || !isDirty.value) return

  try {
    await filesManagerService.updateFileContent(file.space, file.id, text.value)
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
  text.value = newContent
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
        text.value += delta
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
    text.value = ''
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
      <MarkdownEditor :content="text" @content-change="handleContentChange" />

      <div class="actions">
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
