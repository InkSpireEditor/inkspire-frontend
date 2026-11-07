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
import Icon from './Icon.vue'

withDefaults(defineProps<{ title: string; open?: boolean }>(), { open: true })
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="side-panel" :class="{ collapsed: !open }">
    <div class="side-panel-header">
      <h2>{{ title }}</h2>
      <button class="close" @click="$emit('close')" aria-label="Close" title="Close">
        <Icon name="close" />
      </button>
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
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-panel);
  transition: margin-right 220ms ease;
}

.side-panel.collapsed {
  margin-right: -340px;
}

/* A phone: the panel is drawn over what is beside it, across its whole width, because 340px
   beside anything does not fit. It is positioned against the caller's row, which is why that row
   is `position: relative` (Text.vue's .editor-row, LoreView.vue's .graph-area). */
@media (max-width: 640px) {
  .side-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    z-index: 10;
    transition: transform 220ms ease, visibility 0s;
  }

  .side-panel.collapsed {
    margin-right: 0;
    transform: translateX(100%);
    visibility: hidden;
    transition: transform 220ms ease, visibility 0s 220ms;
  }
}

.side-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}

.side-panel-header h2 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
}

.close {
  background: none;
  border: none;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 0 var(--space-1);
}

.close:hover {
  color: var(--color-text);
}

.side-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}
</style>
