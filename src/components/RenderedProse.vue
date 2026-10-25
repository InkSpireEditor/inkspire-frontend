<script setup lang="ts">
/**
 * Markdown prose, drawn for reading: one centred column, in the prose typeface.
 *
 * Shared by `ReadingView.vue` (a whole story, chapter by chapter) and `Text.vue`'s Read toggle
 * (the one file open in the editor, which is how a one-shot is read), so the two cannot look
 * different from each other. Rendered through the shared `renderMarkdown` (`services/markdown.ts`),
 * which sanitises through DOMPurify -- the `v-html` below takes nothing that has not been through it.
 */
import { computed } from 'vue'
import { renderMarkdown } from '../services/markdown'

const props = defineProps<{ text: string }>()
const html = computed(() => renderMarkdown(props.text))
</script>

<template>
  <div class="prose" v-html="html"></div>
</template>

<style scoped>
.prose {
  max-width: 720px;
  margin: 0 auto;
  color: var(--color-text);
  font-family: var(--font-prose);
  line-height: 1.7;
  /* A line with no spaces to break at -- a long word, a URL -- would otherwise
     overflow the column instead of wrapping, widening the whole page under it. */
  overflow-wrap: break-word;
}

.prose :deep(p) {
  margin: 0 0 var(--space-4) 0;
  text-align: justify;
}

.prose :deep(h1),
.prose :deep(h2),
.prose :deep(h3),
.prose :deep(h4),
.prose :deep(h5),
.prose :deep(h6) {
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
  margin: var(--space-6) 0 var(--space-3) 0;
}

.prose :deep(h1:first-child),
.prose :deep(h2:first-child),
.prose :deep(h3:first-child),
.prose :deep(h4:first-child),
.prose :deep(h5:first-child),
.prose :deep(h6:first-child) {
  margin-top: 0;
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0 0 var(--space-4) 0;
}
</style>
