<script setup lang="ts">
/**
 * One of the app's icons (`icons.ts`), drawn in the text colour around it and sized with the
 * text: `1em` square, with the outline centred in that square whatever its own proportions.
 *
 * Decorative: it is hidden from assistive technology, so the button or link it sits in has to
 * carry the accessible name (`aria-label`). `data-icon` names it for tests.
 */
import { computed } from 'vue'
import { ICONS, type IconName } from '../icons'

const props = defineProps<{ name: IconName }>()
const icon = computed(() => ICONS[props.name])
</script>

<template>
  <svg
    class="icon-svg"
    :viewBox="icon.viewBox"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    :data-icon="name"
  >
    <path :d="icon.d" />
  </svg>
</template>

<style scoped>
.icon-svg {
  display: inline-block;
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  /* Sits on the text's baseline the way a letter's descender would, not floating above it. */
  vertical-align: -0.125em;
}
</style>
