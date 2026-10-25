<script setup lang="ts">
/**
 * A story's chapters, concatenated in story.yaml order and rendered as Markdown.
 *
 * Entirely client-side: the API has no bulk-content route, so every chapter's prose
 * is fetched on its own -- the same cost the dashboard's word count already pays --
 * and joined here, one heading per chapter, before being drawn by `RenderedProse`, the
 * same component the editor's own Read toggle uses.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { filesManagerService } from '../services/filesManager'
import BackLink from '../components/BackLink.vue'
import RenderedProse from '../components/RenderedProse.vue'

const route = useRoute()
const storyId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
const storyName = ref('')
const markdown = ref('')
const hasChapters = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

const load = async () => {
  const id = route.params.id
  if (typeof id !== 'string') return

  loading.value = true
  error.value = null
  try {
    const story = await filesManagerService.getDirContent('stories', id)
    storyName.value = story.name
    hasChapters.value = story.files.length > 0

    const bodies = await Promise.all(
      story.files.map((file) => filesManagerService.getFileContent('stories', file.id))
    )
    markdown.value = story.files
      .map((file, index) => `## ${file.name}\n\n${bodies[index]}`)
      .join('\n\n')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the story'
  } finally {
    loading.value = false
  }
}

onMounted(load)
// A story link elsewhere can be clicked while this view is already open, which
// changes the param without remounting the component.
watch(() => route.params.id, load)
</script>

<template>
  <div class="reading-view">
    <BackLink v-if="storyId" :story-id="storyId" />
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else>
      <h1>{{ storyName }}</h1>
      <p v-if="!hasChapters" class="empty">No chapters yet.</p>
      <RenderedProse v-else :text="markdown" />
    </template>
  </div>
</template>

<style scoped>
.reading-view {
  max-width: 720px;
  margin: 0 auto;
  /* A line with no spaces to break at -- a long word, a URL -- would otherwise
     overflow the column instead of wrapping, widening the whole page under it. */
  overflow-wrap: break-word;
}

h1 {
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-5);
}

.error {
  color: var(--color-danger);
}

.empty {
  color: var(--color-text-muted);
}

/* A chapter's heading is set apart by a rule under it. The prose component itself styles every
   heading the same way, since a Markdown heading inside a chapter is not a chapter. */
.reading-view :deep(h2) {
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}
</style>
