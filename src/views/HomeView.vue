<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { filesManagerService } from '../services/filesManager'
import { countEntries, type Counts } from '../services/homeStats'

const counts = ref<Counts | null>(null)
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
    <dl v-else-if="counts" class="counts">
      <div v-for="entry in entries" :key="entry.key" class="count" :data-count="entry.key">
        <dd>{{ entry.value }}</dd>
        <dt>{{ entry.label }}</dt>
      </div>
    </dl>
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
