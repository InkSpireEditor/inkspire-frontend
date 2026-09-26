<script setup lang="ts">
/**
 * A story's chapters, concatenated in story.yaml order and rendered as Markdown.
 * Filled in by a later step.
 */
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="reading-view">
    <p>Reading view for story {{ route.params.id }}.</p>
  </div>
</template>

<style scoped>
.reading-view {
  max-width: 720px;
  margin: 0 auto;
}
</style>
