<script setup lang="ts">
/**
 * A directory's page, for a story and for a notes folder alike: its name, its synopsis (a
 * folder's context), its files with a word count each, a way to edit that text, and deleting
 * the directory. A story also has its chapters in story.yaml order with drag-to-reorder, links
 * to its reading, timeline and lorebook views, the git panel, and a forced delete when it holds
 * more than its chapters. A folder has none of those: its files have no order of their own,
 * the notes are never committed, and its delete is refused with a message while it holds
 * anything besides its files.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  filesManagerService,
  HoldsError,
  MAX_SUMMARY_LENGTH,
  type DirApiResponse,
  type FileEntry
} from '../services/filesManager'
import { useSharedFiles } from '../services/sharedFiles'
import { useSharedGit } from '../services/sharedGit'
import { asSpace, type Space } from '../services/spaces'
import { countWords } from '../services/words'
import Modal from '../components/Modal.vue'
import GitPanel from '../components/GitPanel.vue'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const { selectedFile, clearSelectedFile } = useSharedFiles()
const { refresh: refreshGitStatus } = useSharedGit()
const dir = ref<DirApiResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const wordCounts = ref<Record<string, number>>({})

/** Which root the directory is in, read from the URL: it decides what the page offers. */
const space = computed(() => asSpace(typeof route.params.space === 'string' ? route.params.space : null))
const isStory = computed(() => space.value === 'stories')
/** What the text under the name is called in this space, and what the directory is. */
const textLabel = computed(() => (isStory.value ? 'synopsis' : 'context'))
const dirLabel = computed(() => (isStory.value ? 'story' : 'notes folder'))
const fileLabel = computed(() => (isStory.value ? 'chapters' : 'files'))

/**
 * Not sent by the API -- the scan reads only a chapter's header, capped at 64 KiB,
 * so a per-chapter count would force a full-corpus read on every save. Fetched here
 * instead, one request per file, same cost the reading view already pays.
 * Fire-and-forget: the chapter list renders before these resolve, and each count
 * fills in on its own rather than holding up the page for the slowest chapter.
 */
const loadWordCounts = async (inSpace: Space, files: FileEntry[]) => {
  const counted = await Promise.all(
    files.map(async (file) => {
      try {
        const text = await filesManagerService.getFileContent(inSpace, file.id)
        return [file.id, countWords(text)] as const
      } catch {
        return null
      }
    })
  )
  wordCounts.value = Object.fromEntries(counted.filter((entry) => entry !== null))
}

const load = async () => {
  const id = route.params.id
  if (typeof id !== 'string') return

  loading.value = true
  error.value = null
  wordCounts.value = {}
  try {
    dir.value = await filesManagerService.getDirContent(space.value, id)
    loadWordCounts(space.value, dir.value.files)
  } catch (e) {
    error.value = e instanceof Error ? e.message : `Failed to load the ${dirLabel.value}`
  } finally {
    loading.value = false
  }
}

onMounted(load)
// A directory link elsewhere in the tree can be clicked while this view is already
// open, which changes the params without remounting the component.
watch(() => [route.params.space, route.params.id], load)

/**
 * The sidebar can add, rename or delete this directory's own files (or the directory
 * itself) while its page is open -- a change this view has no way to notice on its own,
 * since it only ever fetches on mount or on a route change. Ignores the event with no
 * directory in it that this view's own delete flow dispatches for Tree.vue's benefit, and
 * any other directory's change, reloading only for its own. Ids differ between the two
 * roots, so the directory id alone says which page it is for.
 */
const handleStoriesChanged = (event: Event) => {
  const storyId = (event as CustomEvent<{ storyId?: string }>).detail?.storyId
  if (storyId && storyId === route.params.id) load()
}

onMounted(() => window.addEventListener('stories:changed', handleStoriesChanged))
onUnmounted(() => window.removeEventListener('stories:changed', handleStoriesChanged))

// --- drag-to-reorder ------------------------------------------------------------

const draggedChapterId = ref<string | null>(null)
const reorderError = ref<string | null>(null)

const onDragStart = (fileId: string) => {
  if (isStory.value) draggedChapterId.value = fileId
}

/**
 * Dropping onto a chapter's own row moves the dragged chapter next to it: dragging
 * down lands it just after that row, dragging up lands it just before -- since
 * removing the dragged id shifts only the indices between the two, re-inserting at
 * the target's original index lands on the correct side of it either way.
 */
const onDrop = async (targetId: string) => {
  const draggedId = draggedChapterId.value
  draggedChapterId.value = null
  if (!isStory.value || !dir.value || !draggedId || draggedId === targetId) return

  const ids = dir.value.files.map((file) => file.id)
  const from = ids.indexOf(draggedId)
  const to = ids.indexOf(targetId)
  if (from === -1 || to === -1) return

  const [movedId] = ids.splice(from, 1)
  ids.splice(to, 0, movedId!)

  try {
    dir.value = await filesManagerService.reorderChapters(dir.value.id, ids)
  } catch (e) {
    reorderError.value = e instanceof Error ? e.message : 'Failed to reorder chapters'
  }
}

// --- editing the synopsis or context ---------------------------------------------

const editingText = ref(false)
const textDraft = ref('')
const savingText = ref(false)
const textError = ref<string | null>(null)

const startEditingText = () => {
  textDraft.value = dir.value?.summary ?? ''
  editingText.value = true
}

const cancelEditingText = () => {
  editingText.value = false
}

/**
 * Writes the text through the same call the sidebar's Edit modal uses, which sends the name
 * with it, then tells the sidebar: its tree holds each directory's text to fill that modal,
 * and has no way to notice this change on its own.
 */
const saveText = async () => {
  if (!dir.value) return

  savingText.value = true
  try {
    await filesManagerService.editDir(space.value, dir.value.id, dir.value.name, textDraft.value)
    dir.value = { ...dir.value, summary: textDraft.value }
    editingText.value = false
    window.dispatchEvent(new CustomEvent('stories:changed', { detail: { space: space.value } }))
  } catch (e) {
    textError.value = e instanceof Error ? e.message : `Failed to save the ${textLabel.value}`
  } finally {
    savingText.value = false
  }
}

// --- deleting the directory ---------------------------------------------------

const showDeleteConfirm = ref(false)
const showDeleteHolds = ref(false)
const showDeleteError = ref(false)
const holds = ref<string[]>([])
const typedName = ref('')
const deleting = ref(false)
const deleteError = ref('')

const openDeleteConfirm = () => {
  showDeleteConfirm.value = true
}

/**
 * Common to both delete paths. Three things nothing else does on the directory's
 * behalf once it is gone:
 *
 * - The sidebar built its tree before this happened, and has no way to notice on
 *   its own, so it is told directly, with the space whose tree to fetch again.
 * - The shared file selection may still point at one of this directory's own files
 *   -- if it does, the editor would otherwise try to reload a file that no longer exists.
 * - The git panel's last status is now stale, the same way any other change made
 *   outside its own buttons already refreshes it.
 */
const afterDeletion = () => {
  window.dispatchEvent(new CustomEvent('stories:changed', { detail: { space: space.value } }))
  if (
    dir.value &&
    selectedFile.value?.space === space.value &&
    dir.value.files.some((file) => file.id === selectedFile.value?.id)
  ) {
    clearSelectedFile()
  }
  refreshGitStatus().catch(() => {})
  router.push({ name: 'home' })
}

/**
 * First attempt: no force. A clean story deletes outright; one holding anything
 * else answers with what is in the way, which opens the second, more careful modal
 * instead of just failing. A folder has no forced delete: the API refuses one that holds
 * anything besides its files, and the message says what, so it is shown as it is.
 */
const confirmDelete = async () => {
  if (!dir.value) return

  deleting.value = true
  try {
    await filesManagerService.delDir(space.value, dir.value.id)
    showDeleteConfirm.value = false
    afterDeletion()
  } catch (e) {
    showDeleteConfirm.value = false
    if (e instanceof HoldsError && isStory.value) {
      holds.value = e.holds
      typedName.value = ''
      showDeleteHolds.value = true
    } else {
      deleteError.value = e instanceof Error ? e.message : 'Delete failed'
      showDeleteError.value = true
    }
  } finally {
    deleting.value = false
  }
}

/** Second attempt, stories only, reached after typing the story's own name: force it through. */
const confirmForceDelete = async () => {
  if (!dir.value) return

  deleting.value = true
  try {
    await filesManagerService.delDir('stories', dir.value.id, { force: true })
    showDeleteHolds.value = false
    afterDeletion()
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Delete failed'
    showDeleteError.value = true
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="dashboard">
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else-if="dir">
      <h1>{{ dir.name }}</h1>

      <div v-if="editingText" class="text-editor">
        <textarea
          v-model="textDraft"
          rows="4"
          :maxlength="MAX_SUMMARY_LENGTH"
          :aria-label="`Edit ${textLabel}`"
        ></textarea>
        <div class="text-actions">
          <button class="primary" :disabled="savingText" @click="saveText">Save</button>
          <button :disabled="savingText" @click="cancelEditingText">Cancel</button>
        </div>
      </div>
      <div v-else class="text-row">
        <p v-if="dir.summary" class="synopsis">{{ dir.summary }}</p>
        <button
          class="icon-only"
          :title="`Edit ${textLabel}`"
          :aria-label="`Edit ${textLabel}`"
          @click="startEditingText"
        >
          <Icon name="pencil" />
        </button>
      </div>

      <ul class="chapters">
        <li
          v-for="file in dir.files"
          :key="file.id"
          class="chapter"
          :class="{ dragging: draggedChapterId === file.id }"
          :draggable="isStory"
          @dragstart="onDragStart(file.id)"
          @dragover.prevent
          @drop="onDrop(file.id)"
          @dragend="draggedChapterId = null"
        >
          <router-link :to="{ name: 'write', params: { space, id: dir.id, fileId: file.id } }">
            {{ file.name }}
          </router-link>
          <span class="chapter-meta">
            <span v-if="wordCounts[file.id] !== undefined" class="word-count">
              {{ wordCounts[file.id] }} words
            </span>
            <span v-if="file.status" class="status">{{ file.status }}</span>
          </span>
        </li>
        <li v-if="dir.files.length === 0" class="empty">No {{ fileLabel }} yet.</li>
      </ul>

      <div v-if="isStory" class="story-links">
        <router-link :to="{ name: 'read', params: { id: dir.id } }" class="read-link">
          Read
        </router-link>
        <router-link
          v-if="dir.timeline"
          :to="{ name: 'timeline', params: { id: dir.id } }"
          class="read-link"
        >
          Timeline
        </router-link>
        <router-link
          v-if="dir.lorebook"
          :to="{ name: 'lore', params: { id: dir.id } }"
          class="read-link"
        >
          Lorebook
        </router-link>
      </div>

      <GitPanel v-if="isStory" />

      <div class="danger-zone">
        <button class="delete-story" @click="openDeleteConfirm">Delete {{ dirLabel }}</button>
      </div>
    </template>

    <Modal
      :show="showDeleteConfirm"
      :title="`Delete ${dirLabel}`"
      confirm-text="Delete"
      is-danger
      :loading="deleting"
      @close="showDeleteConfirm = false"
      @confirm="confirmDelete"
    >
      <p>Delete "{{ dir?.name }}"? This removes its {{ fileLabel }} too.</p>
    </Modal>

    <Modal
      :show="showDeleteHolds"
      title="This story holds more than its chapters"
      confirm-text="Delete anyway"
      is-danger
      :loading="deleting"
      :confirm-disabled="typedName.trim() !== dir?.name"
      @close="showDeleteHolds = false"
      @confirm="confirmForceDelete"
    >
      <p>Deleting it would also remove: {{ holds.join(', ') }}.</p>
      <div class="form-group">
        <label>Type "{{ dir?.name }}" to confirm:</label>
        <input v-model="typedName" @keyup.enter="confirmForceDelete" />
      </div>
    </Modal>

    <Modal
      :show="showDeleteError"
      title="Error"
      confirm-text="OK"
      hide-cancel
      @close="showDeleteError = false"
      @confirm="showDeleteError = false"
    >
      <p>{{ deleteError }}</p>
    </Modal>

    <Modal
      :show="!!textError"
      title="Error"
      confirm-text="OK"
      hide-cancel
      @close="textError = null"
      @confirm="textError = null"
    >
      <p>{{ textError }}</p>
    </Modal>

    <Modal
      :show="!!reorderError"
      title="Error"
      confirm-text="OK"
      hide-cancel
      @close="reorderError = null"
      @confirm="reorderError = null"
    >
      <p>{{ reorderError }}</p>
    </Modal>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 720px;
  margin: 0 auto;
}

h1 {
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-2);
}

.synopsis {
  flex: 1;
  color: var(--color-text);
}

.text-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.text-editor {
  margin-bottom: var(--space-5);
}

.text-editor textarea {
  width: 100%;
  padding: var(--space-3);
  background: var(--color-background-soft);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font: inherit;
  resize: vertical;
}

.text-editor textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.text-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.text-row button,
.text-actions button {
  padding: var(--space-1) var(--space-3);
  background: var(--color-background-soft);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font: inherit;
  cursor: pointer;
}

.text-row button.icon-only {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.text-row button:hover,
.text-actions button:hover:not(:disabled) {
  border-color: var(--color-border-hover);
}

.text-actions button.primary {
  background: var(--color-primary);
  color: var(--color-text-on-fill);
  border-color: var(--color-primary);
}

.text-actions button:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.text-row button:focus-visible,
.text-actions button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.error {
  color: var(--color-danger);
}

.chapters {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-5) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.chapter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background-color: var(--color-background-soft);
  cursor: grab;
}

.chapter.dragging {
  opacity: 0.4;
}

.chapter a {
  color: var(--color-primary);
  text-decoration: none;
}

.chapter a:hover {
  text-decoration: underline;
}

.chapter-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.word-count,
.status {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.empty {
  color: var(--color-text-muted);
  padding: var(--space-2) var(--space-3);
}

.story-links {
  display: flex;
  gap: var(--space-3);
}

.read-link {
  display: inline-block;
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  transition: background-color var(--transition);
}

.read-link:hover {
  background-color: var(--color-background-mute);
}

.danger-zone {
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.delete-story {
  padding: 8px 16px;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--color-danger);
  cursor: pointer;
  font-weight: var(--font-weight-medium);
  transition: background-color var(--transition), color var(--transition);
}

.delete-story:hover {
  background-color: var(--color-danger);
  color: var(--color-text-on-fill);
}
</style>
