<script setup lang="ts">
/**
 * A story's dashboard: its synopsis, its chapters in story.yaml order with a word
 * count for each and drag-to-reorder, the git panel, and deleting the story.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  filesManagerService,
  HoldsError,
  type DirApiResponse,
  type FileEntry
} from '../services/filesManager'
import { useSharedFiles } from '../services/sharedFiles'
import { useSharedGit } from '../services/sharedGit'
import Modal from '../components/Modal.vue'
import GitPanel from '../components/GitPanel.vue'

const route = useRoute()
const router = useRouter()
const { selectedFile, clearSelectedFile } = useSharedFiles()
const { refresh: refreshGitStatus } = useSharedGit()
const story = ref<DirApiResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const wordCounts = ref<Record<string, number>>({})

/**
 * Not sent by the API -- the scan reads only a chapter's header, capped at 64 KiB,
 * so a per-chapter count would force a full-corpus read on every save. Fetched here
 * instead, one request per chapter, same cost the reading view already pays.
 * Fire-and-forget: the chapter list renders before these resolve, and each count
 * fills in on its own rather than holding up the page for the slowest chapter.
 */
const loadWordCounts = async (files: FileEntry[]) => {
  const counted = await Promise.all(
    files.map(async (file) => {
      try {
        const text = await filesManagerService.getFileContent('stories', file.id)
        return [file.id, text.trim().split(/\s+/).filter(Boolean).length] as const
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
    story.value = await filesManagerService.getDirContent('stories', id)
    loadWordCounts(story.value.files)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the story'
  } finally {
    loading.value = false
  }
}

onMounted(load)
// A story link elsewhere in the tree can be clicked while this view is already
// open, which changes the param without remounting the component.
watch(() => route.params.id, load)

/**
 * The sidebar can add, rename or delete this story's own chapters (or the story
 * itself) while its dashboard is open -- a change this view has no way to notice
 * on its own, since it only ever fetches on mount or on a route change. Ignores
 * the plain, detail-less event DashboardView.vue's own delete flow dispatches for
 * Tree.vue's benefit, and any other story's change, reloading only for its own.
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
  draggedChapterId.value = fileId
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
  if (!story.value || !draggedId || draggedId === targetId) return

  const ids = story.value.files.map((file) => file.id)
  const from = ids.indexOf(draggedId)
  const to = ids.indexOf(targetId)
  if (from === -1 || to === -1) return

  const [movedId] = ids.splice(from, 1)
  ids.splice(to, 0, movedId!)

  try {
    story.value = await filesManagerService.reorderChapters(story.value.id, ids)
  } catch (e) {
    reorderError.value = e instanceof Error ? e.message : 'Failed to reorder chapters'
  }
}

// --- deleting the story -------------------------------------------------------

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
 * Common to both delete paths. Three things nothing else does on the story's
 * behalf once it is gone:
 *
 * - The sidebar built its tree before this happened, and has no way to notice on
 *   its own, so it is told directly.
 * - The shared file selection may still point at one of this story's own chapters
 *   -- if it does, '/' would otherwise try to reload a file that no longer exists.
 * - The git panel's last status is now stale, the same way any other change made
 *   outside its own buttons already refreshes it.
 */
const afterDeletion = () => {
  window.dispatchEvent(new Event('stories:changed'))
  if (
    story.value &&
    selectedFile.value?.space === 'stories' &&
    story.value.files.some((file) => file.id === selectedFile.value?.id)
  ) {
    clearSelectedFile()
  }
  refreshGitStatus().catch(() => {})
  router.push({ name: 'home' })
}

/**
 * First attempt: no force. A clean story deletes outright; one holding anything
 * else answers with what is in the way, which opens the second, more careful modal
 * instead of just failing.
 */
const confirmDelete = async () => {
  if (!story.value) return

  deleting.value = true
  try {
    await filesManagerService.delDir('stories', story.value.id)
    showDeleteConfirm.value = false
    afterDeletion()
  } catch (e) {
    showDeleteConfirm.value = false
    if (e instanceof HoldsError) {
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

/** Second attempt, only reached after typing the story's own name: force it through. */
const confirmForceDelete = async () => {
  if (!story.value) return

  deleting.value = true
  try {
    await filesManagerService.delDir('stories', story.value.id, { force: true })
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
    <template v-else-if="story">
      <h1>{{ story.name }}</h1>
      <p v-if="story.summary" class="synopsis">{{ story.summary }}</p>

      <ul class="chapters">
        <li
          v-for="file in story.files"
          :key="file.id"
          class="chapter"
          :class="{ dragging: draggedChapterId === file.id }"
          draggable="true"
          @dragstart="onDragStart(file.id)"
          @dragover.prevent
          @drop="onDrop(file.id)"
          @dragend="draggedChapterId = null"
        >
          <router-link :to="{ name: 'write', params: { id: story.id, fileId: file.id } }">
            {{ file.name }}
          </router-link>
          <span class="chapter-meta">
            <span v-if="wordCounts[file.id] !== undefined" class="word-count">
              {{ wordCounts[file.id] }} words
            </span>
            <span v-if="file.status" class="status">{{ file.status }}</span>
          </span>
        </li>
        <li v-if="story.files.length === 0" class="empty">No chapters yet.</li>
      </ul>

      <router-link :to="{ name: 'read', params: { id: story.id } }" class="read-link">
        Read
      </router-link>

      <GitPanel />

      <div class="danger-zone">
        <button class="delete-story" @click="openDeleteConfirm">Delete story</button>
      </div>
    </template>

    <Modal
      :show="showDeleteConfirm"
      title="Delete story"
      confirm-text="Delete"
      is-danger
      :loading="deleting"
      @close="showDeleteConfirm = false"
      @confirm="confirmDelete"
    >
      <p>Delete "{{ story?.name }}"? This removes its chapters too.</p>
    </Modal>

    <Modal
      :show="showDeleteHolds"
      title="This story holds more than its chapters"
      confirm-text="Delete anyway"
      is-danger
      :loading="deleting"
      :confirm-disabled="typedName.trim() !== story?.name"
      @close="showDeleteHolds = false"
      @confirm="confirmForceDelete"
    >
      <p>Deleting it would also remove: {{ holds.join(', ') }}.</p>
      <div class="form-group">
        <label>Type "{{ story?.name }}" to confirm:</label>
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
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-2);
}

.synopsis {
  color: var(--color-text);
  margin-bottom: var(--space-5);
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
  color: var(--color-text);
  opacity: 0.7;
}

.empty {
  color: var(--color-text);
  opacity: 0.7;
  padding: var(--space-2) var(--space-3);
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
  color: white;
}
</style>
