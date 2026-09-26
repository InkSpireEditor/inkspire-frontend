<script setup lang="ts">
/**
 * A story's dashboard: its synopsis, and its chapters in story.yaml order. The git
 * panel and deleting the story land here in later steps; so does word count and
 * drag-to-reorder.
 */
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { filesManagerService, type DirApiResponse } from '../services/filesManager'

const route = useRoute()
const story = ref<DirApiResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const load = async () => {
  const id = route.params.id
  if (typeof id !== 'string') return

  loading.value = true
  error.value = null
  try {
    story.value = await filesManagerService.getDirContent('stories', id)
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
</script>

<template>
  <div class="dashboard">
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else-if="story">
      <h1>{{ story.name }}</h1>
      <p v-if="story.summary" class="synopsis">{{ story.summary }}</p>

      <ul class="chapters">
        <li v-for="file in story.files" :key="file.id" class="chapter">
          <router-link :to="{ name: 'write', params: { id: story.id, fileId: file.id } }">
            {{ file.name }}
          </router-link>
          <span v-if="file.status" class="status">{{ file.status }}</span>
        </li>
        <li v-if="story.files.length === 0" class="empty">No chapters yet.</li>
      </ul>

      <router-link :to="{ name: 'read', params: { id: story.id } }" class="read-link">
        Read
      </router-link>
    </template>
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
}

.chapter a {
  color: var(--color-primary);
  text-decoration: none;
}

.chapter a:hover {
  text-decoration: underline;
}

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
</style>
