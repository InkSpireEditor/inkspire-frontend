<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { filesManagerService, type TreeApiResponse } from '../services/filesManager'
import { countEntries, resolveRecent, type Counts, type RecentFile } from '../services/homeStats'
import { loadRecent, saveRecent } from '../services/recentFiles'
import type { RouteLocationRaw } from 'vue-router'

const counts = ref<Counts | null>(null)
const recent = ref<RecentFile[]>([])
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
}

/**
 * Both trees, in two requests the sidebar has already made once. `silent` keeps the numbers on
 * screen while a reload is under way, so a change made in the sidebar does not flash "Loading…".
 */
const load = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  error.value = null
  try {
    const [stories, notes] = await Promise.all([
      filesManagerService.getTree('stories'),
      filesManagerService.getTree('notes')
    ])
    counts.value = countEntries(stories, notes)
    showRecent(stories, notes)
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
      <section v-if="recent.length" class="recent">
        <h2>Recently opened</h2>
        <ul>
          <li v-for="file in recent" :key="`${file.space}/${file.id}`">
            <router-link :to="routeTo(file)">{{ file.name }}</router-link>
            <span class="where">{{ whereIs(file) }}</span>
          </li>
        </ul>
      </section>

      <dl class="counts">
        <div v-for="entry in entries" :key="entry.key" class="count" :data-count="entry.key">
          <dd>{{ entry.value }}</dd>
          <dt>{{ entry.label }}</dt>
        </div>
      </dl>
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

.recent ul {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.recent li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.recent a {
  color: var(--color-text);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
}

.recent a:hover {
  color: var(--color-primary);
}

.recent a:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-sm);
}

.where {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.counts {
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
