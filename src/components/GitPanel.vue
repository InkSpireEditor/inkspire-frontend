<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import { gitService, type GitChange } from '../services/git'
import { useSharedGit } from '../services/sharedGit'
import { useGitActions } from '../services/gitActions'
import { resettable, stageable } from '../services/gitMarks'
import { filesManagerService } from '../services/filesManager'
import { isLoggedIn } from '../services/api'
import { useSharedFeatures } from '../services/sharedFeatures'

const { gitStatus, refresh, setStatus } = useSharedGit()
const { stage, reset } = useGitActions()
const features = useSharedFeatures()

// A commit, a push and a pull each take the API's own lock, so only one of them can
// really be running at once — this mirrors that on the button row, and covers the
// panel's own first fetch too.
const busy = ref(false)

const showCommitModal = ref(false)
const commitMessage = ref('')

// A proposed message from the small model (frontend#56). It arrives a few seconds after
// the dialog opens, by which time the writer may have typed: their text is never replaced.
const proposing = ref(false)
const proposalError = ref('')
const lastProposal = ref('')
let proposal: AbortController | null = null

const showError = ref(false)
const errorMessage = ref('')

/** The changes stage, unstage and reset act on: chapters, one-shots and story manifests. */
const changes = computed(() => gitStatus.value?.changes.filter((change) => change.committable) ?? [])
const stageableCount = computed(() => changes.value.filter(stageable).length)
const resettableCount = computed(() => changes.value.filter(resettable).length)
/** Everything in the index, including a path staged by hand: that is what Commit takes. */
const stagedCount = computed(() => gitStatus.value?.changes.filter((c) => c.staged).length ?? 0)

/** The display names of the stories and their files, by id, for the list. */
const names = ref(new Map<string, string>())

const loadNames = async () => {
  if (!isLoggedIn()) return
  try {
    const tree = await filesManagerService.getTree('stories')
    const found = new Map<string, string>()
    for (const dir of tree.dirs ?? []) {
      found.set(dir.id, dir.name)
      for (const file of dir.files) found.set(file.id, file.name)
    }
    for (const file of tree.files ?? []) found.set(file.id, file.name)
    names.value = found
  } catch {
    // The list falls back to the paths git reports.
  }
}

/** A change as the writer reads it: "Story / Chapter", from the tree's names where it has them. */
const labelOf = (change: GitChange): string => {
  const parts = change.path.split('/').slice(1)
  const story = change.dir && change.dir !== change.id ? names.value.get(change.dir) : undefined
  if (change.id) {
    const name = names.value.get(change.id)
    if (name) return story ? `${story} / ${name}` : name
  }
  if (parts.length === 2 && parts[1] === 'story.yaml') return `${story ?? parts[0]} / story.yaml`
  return parts.join(' / ').replace(/\.ink$/, '').replace('chapters / ', '')
}

const STATE_WORDS: Record<GitChange['state'], string> = {
  added: 'new',
  untracked: 'new',
  modified: 'modified',
  deleted: 'deleted',
  renamed: 'renamed',
  conflicted: 'conflicted',
}

/** Where a change's name leads: its file's page, none for a deleted file or a manifest. */
const linkOf = (change: GitChange) => {
  if (!change.id || change.state === 'deleted') return null
  if (change.dir && change.dir !== change.id) {
    return { name: 'write', params: { space: 'stories', id: change.dir, fileId: change.id } }
  }
  return { name: 'write-root', params: { space: 'stories', fileId: change.id } }
}

const displayError = (message: string) => {
  errorMessage.value = message
  showError.value = true
}

const cancelProposal = () => {
  proposal?.abort()
  proposal = null
  proposing.value = false
}

/**
 * Asks for a proposal. The answer is written into the field only if the field still
 * holds what it held when the request started, unless `replace`: the dice button was
 * pressed, which asks for the field to be replaced. A failure is one muted line under
 * the field and never blocks Commit.
 */
const propose = async (replace: boolean) => {
  cancelProposal()
  const controller = new AbortController()
  proposal = controller
  proposing.value = true
  proposalError.value = ''
  const before = commitMessage.value
  try {
    const message = await gitService.proposeMessage(lastProposal.value || undefined, controller.signal)
    if (proposal !== controller) return
    lastProposal.value = message
    if (replace || commitMessage.value === before) commitMessage.value = message
  } catch (e) {
    if (proposal !== controller) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    proposalError.value = e instanceof Error ? e.message : 'No message could be proposed'
  } finally {
    if (proposal === controller) {
      proposal = null
      proposing.value = false
    }
  }
}

const openCommitModal = async () => {
  commitMessage.value = ''
  lastProposal.value = ''
  proposalError.value = ''
  showCommitModal.value = true
  try {
    await features.ensureLoaded()
  } catch {
    return
  }
  if (features.commitMessage.value && showCommitModal.value) propose(false)
}

const closeCommitModal = () => {
  cancelProposal()
  showCommitModal.value = false
}

const submitCommit = async () => {
  const message = commitMessage.value.trim()
  if (!message) {
    displayError('A commit needs a message.')
    return
  }
  if (!isLoggedIn()) return

  cancelProposal()
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

/** Runs a stage or a reset of everything, showing a failure in the error dialog. */
const runAll = async (action: () => Promise<unknown>, fallback: string) => {
  if (!isLoggedIn()) return
  busy.value = true
  try {
    await action()
  } catch (e) {
    displayError(e instanceof Error ? e.message : fallback)
  } finally {
    busy.value = false
  }
}

const stageAll = () => runAll(() => stage(), 'Stage failed')

const showResetModal = ref(false)
const resetAll = async () => {
  showResetModal.value = false
  await runAll(() => reset(), 'Reset failed')
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

const reloadNames = () => {
  loadNames()
}

onMounted(async () => {
  if (!isLoggedIn()) return
  window.addEventListener('tree:changed', reloadNames)
  loadNames()
  busy.value = true
  try {
    await refresh()
  } catch (e) {
    displayError(e instanceof Error ? e.message : 'Failed to read git status')
  } finally {
    busy.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('tree:changed', reloadNames)
  cancelProposal()
})
</script>

<template>
  <div class="git-panel">
    <h3>Git</h3>

    <div v-if="gitStatus" class="git-summary">
      <span class="branch">{{ gitStatus.branch }}</span>
      <span v-if="gitStatus.upstream" class="ahead-behind">
        <span v-if="gitStatus.ahead" :title="`${gitStatus.ahead} ahead of the upstream`">
          <Icon name="arrow-up" />{{ gitStatus.ahead }}
        </span>
        <span v-if="gitStatus.behind" :title="`${gitStatus.behind} behind the upstream`">
          <Icon name="arrow-down" />{{ gitStatus.behind }}
        </span>
      </span>
      <span class="changes" :class="{ clean: changes.length === 0 }">
        {{ changes.length === 0 ? 'Nothing changed' : `${stagedCount} staged, ${stageableCount} not staged` }}
      </span>
    </div>

    <ul v-if="changes.length" class="change-list">
      <li v-for="change in changes" :key="change.path" :data-path="change.path">
        <span
          class="git-mark"
          :class="change.unstaged ? 'changed' : 'staged'"
          role="img"
          :aria-label="change.unstaged ? 'Not staged' : 'Staged'"
          :title="change.unstaged ? 'Not staged' : 'Staged'"
        ></span>
        <router-link v-if="linkOf(change)" :to="linkOf(change)!">{{ labelOf(change) }}</router-link>
        <span v-else>{{ labelOf(change) }}</span>
        <span class="state">{{ STATE_WORDS[change.state] }}</span>
      </li>
    </ul>

    <div class="actions">
      <button @click="stageAll" :disabled="busy || stageableCount === 0">Stage all</button>
      <button @click="showResetModal = true" :disabled="busy || resettableCount === 0">
        Reset all…
      </button>
      <button @click="openCommitModal" :disabled="busy || stagedCount === 0">
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
      @close="closeCommitModal"
      @confirm="submitCommit"
    >
      <div class="form-group">
        <label for="commit-message">Message:</label>
        <div class="message-row">
          <textarea
            id="commit-message"
            v-model="commitMessage"
            :placeholder="proposing ? 'Proposing a message…' : 'What changed'"
            rows="3"
            @keyup.enter.meta="submitCommit"
          ></textarea>
          <button
            v-if="features.commitMessage.value"
            type="button"
            class="dice"
            aria-label="Propose another message"
            title="Propose another message"
            :disabled="proposing"
            @click="propose(true)"
          >
            <Icon name="dice" />
          </button>
        </div>
        <p v-if="proposalError" class="proposal-error">{{ proposalError }}</p>
      </div>
    </Modal>

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
        {{ resettableCount === 1 ? 'file' : 'files' }} since the last commit? The text goes back
        to what was committed, and this cannot be undone. New files are kept.
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
.git-panel {
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  margin-bottom: var(--space-6);
  border-top: 1px solid var(--color-border);
}

h3 {
  margin-top: 0;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  color: var(--color-text);
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
  flex-wrap: wrap;
  gap: var(--space-2);
}

.change-list {
  list-style: none;
  margin: 0 0 var(--space-2);
  padding: 0;
  font-size: 0.85rem;
}

.change-list li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 2px 0;
}

.change-list .state {
  color: var(--color-text-muted);
  margin-left: auto;
}

/* The same dot the sidebar draws: hollow is not staged, filled is staged. */
.git-mark {
  flex-shrink: 0;
  box-sizing: border-box;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--color-primary);
}

.git-mark.staged {
  background: var(--color-primary);
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.message-row textarea {
  flex: 1;
  min-width: 0;
}

.proposal-error {
  margin: var(--space-1) 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
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
