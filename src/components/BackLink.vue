<script setup lang="ts">
/**
 * A way back to a story's dashboard from one of its own views.
 *
 * The sidebar can get there by clicking the story again, but a reader looking at
 * the timeline or the lorebook is looking at the centre panel, not the tree.
 */
defineProps<{ storyId: string }>()
</script>

<template>
  <router-link :to="{ name: 'dashboard', params: { id: storyId } }" class="back-link">
    ← Back to the dashboard
  </router-link>
</template>

<style scoped>
.back-link {
  align-self: flex-start;
  color: var(--color-text);
  opacity: 0.7;
  text-decoration: none;
  font-size: 0.85rem;
  transition: opacity var(--transition);
}

.back-link:hover {
  opacity: 1;
  text-decoration: underline;
}
</style>
