<script setup lang="ts">
/**
 * A story's timeline, laid out server-side and drawn here as SVG.
 *
 * This is a placeholder: F3 fills in the fetch and the SVG rendering. For now it
 * only proves the route resolves and can read the story id out of it.
 */
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="timeline-view">
    <p>Timeline for story {{ route.params.id }}</p>
  </div>
</template>
