<script setup lang="ts">
/**
 * A story's knowledge graph, force-directed and drawn client-side.
 *
 * This is a placeholder: F5-F7 fill in the fetch, the force-graph canvas, and the
 * entity side panel. For now it only proves the route resolves and can read the
 * story id out of it.
 */
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="lore-view">
    <p>Lorebook for story {{ route.params.id }}</p>
  </div>
</template>
