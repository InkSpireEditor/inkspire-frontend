<script setup lang="ts">
/**
 * A one-off instruction for the next Generate or Rewrite (api#19/frontend#24) --
 * "make this more neutral", "continue as if a day has passed". Its own component,
 * not a field inline in `GenerationSettings.vue`, so it can be mounted somewhere
 * else later with no change to that file's template -- it reads `useSharedInstruction`
 * directly, the same "no props, read the singleton" shape `GenerationSettings.vue`
 * itself already has for `sharedSettings`/`sharedModel`.
 *
 * A single-line `input`, `:value`/`@input` calling `setInstruction` -- the house
 * pattern this panel uses throughout (never `v-model`), chosen over `Tree.vue`'s
 * own `v-model` textarea for the title-instruction field (frontend#30) because this
 * sits beside, and should read like, the panel it is mounted in, not that modal.
 */
import { useSharedInstruction } from '../services/sharedInstruction'

const { instruction, setInstruction } = useSharedInstruction()

//: Mirrors `inkspire_api/llm.py`'s own `MAX_INSTRUCTION_LENGTH` -- not imported,
//: since nothing here can reach across the two repositories; kept in step by hand.
const MAX_INSTRUCTION_LENGTH = 300
</script>

<template>
  <label class="field">
    <span class="field-label">Instruction</span>
    <input
      type="text"
      :maxlength="MAX_INSTRUCTION_LENGTH"
      placeholder='e.g. "make this more neutral"'
      :value="instruction"
      @input="setInstruction(($event.target as HTMLInputElement).value)"
    />
    <span class="field-hint">
      A one-off nudge for the next Generate or Rewrite. Kept until you open a
      different file.
    </span>
  </label>
</template>

<style scoped>
/* Duplicated from GenerationSettings.vue rather than shared, to keep this
   component mountable on its own with no CSS dependency on where it lives --
   a few lines, worth revisiting only if a third consumer needs the same rules. */
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  font-size: 0.85rem;
  color: var(--color-text);
}

.field-hint {
  font-size: 0.75rem;
  opacity: 0.7;
}

input[type='text'] {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-background-soft);
  color: var(--color-text);
}
</style>
