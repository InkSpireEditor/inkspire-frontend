<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { filesManagerService } from '../services/filesManager'
import { ollamaService } from '../services/ollama'
import { useSharedFiles } from '../services/sharedFiles'
import MarkdownEditor from './MarkdownEditor.vue'
import Modal from './Modal.vue'

const { selectedFileId } = useSharedFiles()

// --- Component State ---
const text = ref('')
const fileName = ref('')
const currentFileID = ref<number | null>(null)
const generatedText = ref('')
const pendingValidation = ref(false)

// Modal state
const showGenerateModal = ref(false)
const modalInputPrompt = ref('')

// Error state
const showError = ref(false)
const errorMessage = ref('')

let autoSaveTimer: number | null = null

/**
 * Loads the file information and content whenever the selectedFileId changes.
 */
const loadFile = async (fileId: number) => {
  const token = localStorage.getItem('jwt_token')
  if (!token) return

  try {
    const [info, content] = await Promise.all([
      filesManagerService.getFileInfo(token, fileId),
      filesManagerService.getFileContent(token, fileId)
    ])
    
    fileName.value = info.name
    text.value = content
    currentFileID.value = fileId
    
    startAutoSave()
  } catch (e) {
    console.error('Error loading file:', e)
    displayError('Failed to load the file')
  }
}

/**
 * Saves the current text content to the backend.
 */
const save = async () => {
  const token = localStorage.getItem('jwt_token')
  if (!token || !currentFileID.value) return

  try {
    await filesManagerService.updateFileContent(token, currentFileID.value, text.value)
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
}

const handleModalSubmit = async () => {
  if (!text.value) return
  if (!modalInputPrompt.value.trim()) return

  const token = localStorage.getItem('jwt_token')
  if (!token || !currentFileID.value) return

  try {
    // Get context (directory content)
    const context = await filesManagerService.getDirContent(token, currentFileID.value)
    
    const result = await ollamaService.addButtonOllama(
      currentFileID.value,
      token,
      modalInputPrompt.value,
      context,
      text.value
    )

    if (result) {
      const res = JSON.parse(result)
      if (res.param?.response) {
        generatedText.value = res.param.response
        pendingValidation.value = true
        showGenerateModal.value = false
      }
    }
  } catch (e) {
    console.error('Error generating text:', e)
    displayError('Error generating text with Ollama')
  }
}

const applyGeneratedText = () => {
  text.value += generatedText.value
  generatedText.value = ''
  pendingValidation.value = false
  save()
}

const rejectGeneratedText = () => {
  generatedText.value = ''
  pendingValidation.value = false
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
      <p v-if="fileName">{{ fileName }}</p>
      <p v-else>No file selected</p>
    </div>

    <div v-if="!pendingValidation" class="editor-container">
      <MarkdownEditor :content="text" @content-change="handleContentChange" />

      <div class="actions">
        <button @click="showGenerateModal = true" :disabled="!currentFileID">Generate</button>
        <button class="primary" @click="save" :disabled="!currentFileID">Save</button>
      </div>
    </div>

    <div v-else class="validation-container">
      <textarea readonly rows="20">{{ generatedText }}</textarea>
      
      <div class="fakeline"></div>
      
      <div class="actions">
        <button class="primary" @click="applyGeneratedText">Apply (Yes)</button>
        <button @click="rejectGeneratedText">Discard (No)</button>
        <button @click="save">Save Current</button>
      </div>
    </div>

    <!-- Generate Modal -->
    <Modal
      :show="showGenerateModal"
      title="What should I generate?"
      confirm-text="Generate"
      @close="showGenerateModal = false"
      @confirm="handleModalSubmit"
    >
      <div class="form-group">
        <label>Prompt:</label>
        <textarea v-model="modalInputPrompt" placeholder="Describe what you want to generate..." rows="3"></textarea>
      </div>
    </Modal>

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
  font-weight: bold;
  color: var(--color-heading);
}

.editor-container, .validation-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.validation-container textarea {
  width: 100%;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-background-soft);
  color: var(--color-text);
  font-family: inherit;
}

.fakeline {
  border-top: 1px solid var(--color-border);
  margin: 1rem 10%;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-top: 1rem;
}

button {
  padding: 10px 24px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
  color: var(--color-text);
  font-weight: bold;
}

button.primary {
  background-color: var(--color-primary);
  color: white;
  border: none;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: bold;
}

.form-group textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
  color: var(--color-text);
}
</style>
