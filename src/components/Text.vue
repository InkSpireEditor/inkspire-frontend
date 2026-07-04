<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { filesManagerService } from '../services/filesManager'
import { llmService } from '../services/llm'
import { useSharedFiles } from '../services/sharedFiles'
import { useSharedModel } from '../services/sharedModel'
import { isLoggedIn } from '../services/api'
import MarkdownEditor from './MarkdownEditor.vue'
import Modal from './Modal.vue'

const { selectedFileId } = useSharedFiles()
const { selectedModelName } = useSharedModel()

// --- Component State ---
const text = ref('')
const fileName = ref('')
const currentFileID = ref<number | null>(null)
const isDirty = ref(false)

// Error state
const showError = ref(false)
const errorMessage = ref('')

let autoSaveTimer: number | null = null

/**
 * Loads the file information and content whenever the selectedFileId changes.
 */
const loadFile = async (fileId: number) => {
  if (!isLoggedIn()) return

  try {
    const [info, content] = await Promise.all([
      filesManagerService.getFileInfo(fileId),
      filesManagerService.getFileContent(fileId)
    ])

    fileName.value = info.name
    text.value = content
    currentFileID.value = fileId
    isDirty.value = false

    startAutoSave()
  } catch (e) {
    console.error('Error loading file:', e)
    displayError('Failed to load the file')
  }
}

/**
 * Saves the current text content to the backend.
 * No-op when content has not changed since the last save.
 */
const save = async () => {
  if (!isLoggedIn() || !currentFileID.value || !isDirty.value) return

  try {
    await filesManagerService.updateFileContent(currentFileID.value, text.value)
    isDirty.value = false
  } catch (e) {
    console.error('Error saving file:', e)
    displayError('Failed to save the file')
  }
}

const startAutoSave = () => {
  stopAutoSave()
  autoSaveTimer = window.setInterval(() => {
    save()
  }, 5000)
}

const stopAutoSave = () => {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }
}

const handleContentChange = (newContent: string) => {
  text.value = newContent
  isDirty.value = true
}

const isGenerating = ref(false)

const handleGenerate = async () => {
  if (isGenerating.value) return
  if (!text.value) return
  if (!selectedModelName.value) {
    displayError('No model selected')
    return
  }

  if (!isLoggedIn() || !currentFileID.value) return

  isGenerating.value = true
  try {
    const result = await llmService.generate(
      currentFileID.value,
      selectedModelName.value,
      text.value
    )

    if (result) {
      text.value += result
    }
  } catch (e) {
    console.error('Error generating text:', e)
    displayError('Error generating text')
  } finally {
    isGenerating.value = false
  }
}

const displayError = (msg: string) => {
  errorMessage.value = msg
  showError.value = true
}

// Watch for changes in selected file
watch(selectedFileId, (newId) => {
  stopAutoSave()
  if (newId) {
    loadFile(newId)
  } else {
    currentFileID.value = null
    fileName.value = ''
    text.value = ''
  }
})

onMounted(() => {
  if (selectedFileId.value) {
    loadFile(selectedFileId.value)
  }
})

onUnmounted(() => {
  stopAutoSave()
  if (currentFileID.value) {
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
        <button @click="save" :disabled="!currentFileID">Save</button>
        <button class="primary" @click="handleGenerate" :disabled="!currentFileID || isGenerating" :class="{ generating: isGenerating }">
          {{ isGenerating ? 'Generating…' : 'Generate' }}
        </button>
      </div>
    </div>

    <!-- Error Modal (Reusing Unified Modal) -->
    <Modal
      :show="showError"
      title="Error"
      confirm-text="OK"
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
