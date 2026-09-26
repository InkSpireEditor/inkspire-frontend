<script setup lang="ts">
/**
 * A story's chapters, concatenated in story.yaml order and rendered as Markdown.
 *
 * Entirely client-side: the API has no bulk-content route, so every chapter's prose
 * is fetched on its own -- the same cost the dashboard's word count already pays --
 * and joined here, one heading per chapter, before being rendered and sanitised.
 * `html: false` keeps markdown-it from passing a chapter's own raw HTML through at
 * all; DOMPurify runs on what it renders regardless, since neither is a substitute
 * for the other.
 */
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { filesManagerService } from '../services/filesManager'

const route = useRoute()
const storyName = ref('')
const html = ref('')
const hasChapters = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

const md = new MarkdownIt({ html: false, linkify: true })

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
    const markdown = story.files
      .map((file, index) => `## ${file.name}\n\n${bodies[index]}`)
      .join('\n\n')

    html.value = DOMPurify.sanitize(md.render(markdown))
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
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else>
      <h1>{{ storyName }}</h1>
      <p v-if="!hasChapters" class="empty">No chapters yet.</p>
      <!-- Sanitised just above, through DOMPurify -- nothing here escapes that. -->
      <div v-else class="prose" v-html="html"></div>
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
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-5);
}

.error {
  color: var(--color-danger);
}

.empty {
  color: var(--color-text);
  opacity: 0.7;
}

.prose {
  color: var(--color-text);
  line-height: 1.7;
}

.prose :deep(h2) {
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
  margin-top: var(--space-6);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.prose :deep(h2:first-child) {
  margin-top: 0;
}

.prose :deep(p) {
  margin: 0 0 var(--space-4) 0;
}
</style>
