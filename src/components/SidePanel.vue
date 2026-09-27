<script setup lang="ts">
/**
 * A generic right-hand panel: a title, a close button, and whatever the caller
 * slots in. No lore-specific knowledge, so a later feature (a timeline event's
 * detail, a chapter outline) can reuse it without touching this one.
 *
 * Stays mounted whether `open` or not, and slides off to the right via a
 * negative margin when it isn't -- the same technique the left sidebar uses
 * (App.vue's `aside`), so a caller's flex sibling (the graph canvas here) grows
 * to fill the freed width smoothly rather than snapping the moment the panel's
 * content disappears.
 */
withDefaults(defineProps<{ title: string; open?: boolean }>(), { open: true })
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="side-panel" :class="{ collapsed: !open }">
    <div class="side-panel-header">
      <h2>{{ title }}</h2>
      <button class="close" @click="$emit('close')" aria-label="Close">×</button>
    </div>
    <div class="side-panel-body"><slot /></div>
  </div>
</template>

<style scoped>
.side-panel {
  width: 340px;
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  transition: margin-right 220ms ease;
}

.side-panel.collapsed {
  margin-right: -340px;
}

.side-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.side-panel-header h2 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
}

.close {
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;
  padding: 0 var(--space-1);
}

.close:hover {
  opacity: 1;
}

.side-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}
</style>
