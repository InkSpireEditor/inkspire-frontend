<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Modal from './Modal.vue'
import { useSharedGit } from '../services/sharedGit'
import { useGitActions } from '../services/gitActions'
import { resettable, selectChanges, stageable } from '../services/gitMarks'
import { isLoggedIn } from '../services/api'

/** A story's own changes, staged or discarded as a set. Committing is on the homepage. */
const props = defineProps<{ storyId: string }>()

const { gitStatus, refresh } = useSharedGit()
const { stage, reset } = useGitActions()

const busy = ref(false)
const showResetModal = ref(false)
const showError = ref(false)
const errorMessage = ref('')

const changes = computed(() => selectChanges(gitStatus.value, { dir: props.storyId }))
const stageableCount = computed(() => changes.value.filter(stageable).length)
const stagedCount = computed(() => changes.value.filter((change) => change.staged).length)
const resettableCount = computed(() => changes.value.filter(resettable).length)

const run = async (action: () => Promise<unknown>, fallback: string) => {
  if (!isLoggedIn()) return
  busy.value = true
  try {
    await action()
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : fallback
    showError.value = true
  } finally {
    busy.value = false
  }
}

const stageAll = () => run(() => stage({ dir: props.storyId }), 'Stage failed')

const resetAll = async () => {
  showResetModal.value = false
  await run(() => reset({ dir: props.storyId }), 'Reset failed')
}

onMounted(() => {
  if (isLoggedIn()) refresh().catch(() => {})
})
</script>

<template>
  <div class="story-git-panel">
    <h3>Changes</h3>

    <p class="summary" :class="{ clean: changes.length === 0 }">
      {{
        changes.length === 0
          ? 'Nothing changed since the last commit'
          : `${changes.length} changed, ${stagedCount} staged`
      }}
    </p>

    <div class="actions">
      <button @click="stageAll" :disabled="busy || stageableCount === 0">Stage all</button>
      <button @click="showResetModal = true" :disabled="busy || resettableCount === 0">
        Reset…
      </button>
    </div>

    <Modal
      :show="showResetModal"
      title="Discard changes"
      confirm-text="Discard"
      :is-danger="true"
      @close="showResetModal = false"
      @confirm="resetAll"
    >
      <p>
        Discard the changes to {{ resettableCount }}
        {{ resettableCount === 1 ? 'file' : 'files' }} of this story since the last commit? The text
        goes back to what was committed, and this cannot be undone. New files are kept.
      </p>
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
.story-git-panel {
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

h3 {
  margin-top: 0;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
}

.summary {
  margin: 0 0 var(--space-2);
  font-size: 0.85rem;
  color: var(--color-danger);
}

.summary.clean {
  color: var(--color-text);
}

.actions {
  display: flex;
  flex-wrap: wrap;
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
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}
</style>
