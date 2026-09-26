<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Modal from './Modal.vue'
import { gitService } from '../services/git'
import { useSharedGit } from '../services/sharedGit'
import { isLoggedIn } from '../services/api'

const { gitStatus, refresh, setStatus } = useSharedGit()

// A commit, a push and a pull each take the API's own lock, so only one of them can
// really be running at once — this mirrors that on the button row, and covers the
// panel's own first fetch too.
const busy = ref(false)

const showCommitModal = ref(false)
const commitMessage = ref('')

const showError = ref(false)
const errorMessage = ref('')

/** How many of the current changes the Commit button will actually pick up. */
const committableCount = computed(
  () => gitStatus.value?.changes.filter((change) => change.committable).length ?? 0
)

const displayError = (message: string) => {
  errorMessage.value = message
  showError.value = true
}

const openCommitModal = () => {
  commitMessage.value = ''
  showCommitModal.value = true
}

const submitCommit = async () => {
  const message = commitMessage.value.trim()
  if (!message) {
    displayError('A commit needs a message.')
    return
  }
  if (!isLoggedIn()) return

  busy.value = true
  try {
    const result = await gitService.commit(message)
    setStatus(result)
    showCommitModal.value = false
  } catch (e) {
    showCommitModal.value = false
    displayError(e instanceof Error ? e.message : 'Commit failed')
  } finally {
    busy.value = false
  }
}

const push = async () => {
  if (!isLoggedIn()) return
  busy.value = true
  try {
    setStatus(await gitService.push())
  } catch (e) {
    displayError(e instanceof Error ? e.message : 'Push failed')
  } finally {
    busy.value = false
  }
}

const pull = async () => {
  if (!isLoggedIn()) return
  busy.value = true
  try {
    setStatus(await gitService.pull())
  } catch (e) {
    displayError(e instanceof Error ? e.message : 'Pull failed')
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  if (!isLoggedIn()) return
  busy.value = true
  try {
    await refresh()
  } catch (e) {
    displayError(e instanceof Error ? e.message : 'Failed to read git status')
  } finally {
    busy.value = false
  }
})
</script>

<template>
  <div class="git-panel">
    <h3>Git</h3>

    <div v-if="gitStatus" class="git-summary">
      <span class="branch">{{ gitStatus.branch }}</span>
      <span v-if="gitStatus.upstream" class="ahead-behind">
        <template v-if="gitStatus.ahead">↑{{ gitStatus.ahead }}</template>
        <template v-if="gitStatus.behind">↓{{ gitStatus.behind }}</template>
      </span>
      <span class="changes" :class="{ clean: committableCount === 0 }">
        {{ committableCount === 0 ? 'Nothing to commit' : `${committableCount} to commit` }}
      </span>
    </div>

    <div class="actions">
      <button @click="openCommitModal" :disabled="busy || committableCount === 0">
        Commit…
      </button>
      <button @click="push" :disabled="busy || !gitStatus?.upstream">Push</button>
      <button @click="pull" :disabled="busy || !gitStatus?.upstream">Pull</button>
    </div>

    <Modal
      :show="showCommitModal"
      title="Commit"
      confirm-text="Commit"
      :loading="busy"
      @close="showCommitModal = false"
      @confirm="submitCommit"
    >
      <div class="form-group">
        <label>Message:</label>
        <textarea
          v-model="commitMessage"
          placeholder="What changed"
          rows="3"
          @keyup.enter.meta="submitCommit"
        ></textarea>
      </div>
    </Modal>

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
.git-panel {
  padding: 1rem;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-background);
}

h3 {
  margin-top: 0;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
}

.git-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
  margin-bottom: var(--space-2);
}

.branch {
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.ahead-behind {
  color: var(--color-text);
}

.changes {
  color: var(--color-danger);
}

.changes.clean {
  color: var(--color-text);
}

.actions {
  display: flex;
  gap: var(--space-2);
}

button {
  padding: 6px 12px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.85rem;
  font-weight: var(--font-weight-medium);
  transition: background-color var(--transition), border-color var(--transition);
}

button:hover:not(:disabled) {
  background: var(--color-background-mute);
}

button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
