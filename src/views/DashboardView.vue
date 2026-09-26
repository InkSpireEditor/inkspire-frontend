<script setup lang="ts">
/**
 * A story's dashboard. Filled in by a later step: the synopsis, the ordered
 * chapters with status and word count, the git panel, and deleting the story.
 */
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="dashboard">
    <p>Dashboard for story {{ route.params.id }}.</p>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 720px;
  margin: 0 auto;
}
</style>
