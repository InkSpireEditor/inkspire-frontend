<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { filesManagerService, type TreeApiResponse } from '../services/filesManager'
import {
  countEntries,
  foldTail,
  lastEdited,
  resolveRecent,
  statusBars,
  sumBars,
  wordBars,
  type Bar,
  type Counts,
  type EditedFile,
  type RecentFile
} from '../services/homeStats'
import { timeAgo } from '../services/time'
import { countWords } from '../services/words'
import BarChart from '../components/BarChart.vue'
import { loadRecent, saveRecent } from '../services/recentFiles'
import type { RouteLocationRaw } from 'vue-router'

const counts = ref<Counts | null>(null)
const recent = ref<RecentFile[]>([])
const edited = ref<EditedFile[]>([])
const statuses = ref<Bar[]>([])
const storyWords = ref<Bar[]>([])
/** Set while the prose is being fetched to count it, which takes a request per file. */
const countingWords = ref(false)

/** How many bars a chart draws before the rest are folded into one. */
const MAX_BARS = 8
const numbers = new Intl.NumberFormat()

const shownStatuses = computed(() => foldTail(statuses.value, MAX_BARS, 'Other statuses'))
const shownStoryWords = computed(() => foldTail(storyWords.value, MAX_BARS, 'Other stories'))
const totalWords = computed(() => sumBars(storyWords.value))
const loading = ref(false)
const error = ref<string | null>(null)

const COUNT_LABELS: [keyof Counts, string][] = [
  ['stories', 'Stories'],
  ['chapters', 'Chapters'],
  ['oneShots', 'One-shots'],
  ['notesFolders', 'Notes folders'],
  ['notes', 'Notes']
]

const entries = computed(() =>
  counts.value ? COUNT_LABELS.map(([key, label]) => ({ key, label, value: counts.value![key] })) : []
)

/** The route that opens a recent file: with its directory in the URL if it has one. */
const routeTo = (file: RecentFile): RouteLocationRaw =>
  file.dir
    ? { name: 'write', params: { space: file.space, id: file.dir.id, fileId: file.id } }
    : { name: 'write-root', params: { space: file.space, fileId: file.id } }

/** What is shown beside a recent file's name: where it is. */
const whereIs = (file: RecentFile): string =>
  file.dir ? file.dir.name : file.space === 'stories' ? 'One-shot' : 'Note'

/** The clock the "ago" times are read against, set again each time the page loads. */
const now = ref(Date.now())

/**
 * The recorded files that are still in a tree. The others are dropped from storage as well,
 * so a deleted or renamed file does not take up one of the places in the list.
 */
const showRecent = (stories: TreeApiResponse, notes: TreeApiResponse) => {
  const recorded = loadRecent()
  const found = resolveRecent(recorded, { stories, notes })
  if (found.length < recorded.length) {
    saveRecent(found.map(({ space, id }) => ({ space, id })))
  }
  recent.value = found
  edited.value = lastEdited(stories, notes)
}

/**
 * Words in every file of the stories, counted from the prose, one request per file as the
 * story's page does. The chart appears when the last count is in, so a total is never shown
 * while some files are still missing from it; a file that cannot be fetched counts for nothing.
 */
let wordsRun = 0
const loadWords = async (stories: TreeApiResponse) => {
  const run = ++wordsRun
  const files = [...stories.dirs.flatMap((dir) => dir.files), ...stories.files]
  countingWords.value = true
  try {
    const counted = await Promise.all(
      files.map(async (file) => {
        try {
          const text = await filesManagerService.getFileContent('stories', file.id)
          return [file.id, countWords(text)] as const
        } catch {
          return null
        }
      })
    )
    // A reload that started after this one has the newer trees: leave its answer be.
    if (run !== wordsRun) return
    const words = Object.fromEntries(counted.filter((entry) => entry !== null))
    storyWords.value = wordBars(stories, words)
  } finally {
    if (run === wordsRun) countingWords.value = false
  }
}

/**
 * Both trees, in two requests the sidebar has already made once. `silent` keeps the numbers on
 * screen while a reload is under way, so a change made in the sidebar does not flash "Loading…".
 */
const load = async ({ silent = false } = {}) => {
  now.value = Date.now()
  if (!silent) loading.value = true
  error.value = null
  try {
    const [stories, notes] = await Promise.all([
      filesManagerService.getTree('stories'),
      filesManagerService.getTree('notes')
    ])
    counts.value = countEntries(stories, notes)
    showRecent(stories, notes)
    statuses.value = statusBars(stories)
    loadWords(stories)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the home page'
  } finally {
    loading.value = false
  }
}

const reload = () => load({ silent: true })

// Dispatched by Tree.vue after it creates, renames or deletes anything, in either space.
onMounted(() => {
  load()
  window.addEventListener('tree:changed', reload)
})
onUnmounted(() => window.removeEventListener('tree:changed', reload))
</script>

<template>
  <div class="home">
    <h1>InkSpire</h1>
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else-if="counts">
      <section v-if="recent.length" class="recent file-list">
        <h2>Recently opened</h2>
        <ul>
          <li v-for="file in recent" :key="`${file.space}/${file.id}`">
            <router-link :to="routeTo(file)">{{ file.name }}</router-link>
            <span class="where">{{ whereIs(file) }}</span>
          </li>
        </ul>
      </section>

      <section v-if="edited.length" class="file-list">
        <h2>Last edited</h2>
        <ul>
          <li v-for="file in edited" :key="`${file.space}/${file.id}`">
            <router-link :to="routeTo(file)" :title="file.modified">{{ file.name }}</router-link>
            <span class="where">{{ whereIs(file) }}</span>
            <span class="modified" :title="file.modified">{{ timeAgo(file.modified, now) }}</span>
          </li>
        </ul>
      </section>

      <dl class="counts">
        <div v-for="entry in entries" :key="entry.key" class="count" :data-count="entry.key">
          <dd>{{ entry.value }}</dd>
          <dt>{{ entry.label }}</dt>
        </div>
      </dl>

      <BarChart
        v-if="shownStatuses.length"
        title="Status"
        unit="files"
        caption="Chapters and one-shots, by the status in their header"
        :bars="shownStatuses"
      />
      <p v-if="countingWords && !shownStoryWords.length" class="counting">Counting words…</p>
      <BarChart
        v-else-if="shownStoryWords.length"
        title="Words per story"
        unit="words"
        :caption="`${numbers.format(totalWords)} words in all`"
        :bars="shownStoryWords"
      />
    </template>
  </div>
</template>

<style scoped>
.home {
  max-width: 720px;
  margin: 0 auto;
}

h1 {
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-5);
}

.error {
  color: var(--color-danger);
}

h2 {
  color: var(--color-text);
  font-size: 1rem;
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-2);
}

.recent {
  margin-bottom: var(--space-5);
}

.counting {
  color: var(--color-text-muted);
}

.file-list ul {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.file-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.file-list a {
  color: var(--color-text);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
}

.file-list a:hover {
  color: var(--color-primary);
}

.file-list a:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-sm);
}

.where {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.modified {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  flex-shrink: 0;
}

.file-list {
  margin-bottom: var(--space-5);
}

.counts {
  margin-bottom: var(--space-5);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-3);
}

.count {
  display: flex;
  flex-direction: column-reverse;
  padding: var(--space-4);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.count dd {
  color: var(--color-text);
  font-size: 1.75rem;
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
}

.count dt {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
</style>
