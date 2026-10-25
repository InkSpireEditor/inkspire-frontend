<script setup lang="ts">
/**
 * A way back to a story's dashboard from one of its own views.
 *
 * The sidebar can get there by clicking the story again, but a reader looking at
 * the timeline or the lorebook is looking at the centre panel, not the tree.
 */
import Icon from './Icon.vue'

defineProps<{ storyId: string }>()
</script>

<template>
  <router-link :to="{ name: 'dashboard', params: { space: 'stories', id: storyId } }" class="back-link">
    <Icon name="arrow-left" /> Back to the dashboard
  </router-link>
</template>

<style scoped>
.back-link {
  align-self: flex-start;
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 0.85rem;
  transition: color var(--transition);
}

.back-link:hover {
  color: var(--color-text);
  text-decoration: underline;
}
</style>
