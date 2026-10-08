<script setup lang="ts">
/**
 * The generation settings panel's content: sliders and a number input over the
 * writer's own overrides (`sharedSettings.ts`), hosted in `Text.vue`'s `SidePanel`.
 *
 * The thinking checkbox lives here too, from `sharedModel.ts` rather than
 * `sharedSettings.ts` -- it is a per-generation choice tied to the selected model's
 * protocol (only `ollama` can honour it), not one of the writer's own overrides, so
 * `selectedModelProtocol` decides whether it renders at all.
 */
import { onMounted } from 'vue'
import { useSharedSettings } from '../services/sharedSettings'
import { useSharedModel } from '../services/sharedModel'

const {
  temperature,
  promptBudget,
  prefixShare,
  numCtx,
  sendSelection,
  ensureLoaded,
  setTemperature,
  setPromptBudget,
  setPrefixShare,
  setNumCtx,
  setSendSelection,
  reset,
} = useSharedSettings()

const { selectedModelProtocol, thinkEnabled, setThinkEnabled } = useSharedModel()

onMounted(() => {
  ensureLoaded()
})

/**
 * English prose runs roughly 4.78 characters per token (`docs/prompt.md`) -- the
 * same figure the budget's own choice was measured against. Shown so the budget
 * stops being an opaque character count and the warning below has a number to
 * compare against `numCtx` with. Not exact for every script: a CJK-heavy file runs
 * closer to one token per character, which this estimate does not know.
 */
const CHARS_PER_TOKEN = 4.78

const estimatedTokens = () => Math.round(promptBudget.value / CHARS_PER_TOKEN)

/** Whether the budget's own estimate would already fill or overrun the allocated
 *  window -- the one case `docs/prompt.md` names as a real hazard: Ollama drops
 *  tokens off the front of the prompt and answers an ordinary 200 regardless. */
const overNumCtx = () => numCtx.value !== null && estimatedTokens() >= numCtx.value

const onNumCtxInput = (raw: string) => {
  const trimmed = raw.trim()
  setNumCtx(trimmed === '' ? null : Number(trimmed))
}
</script>

<template>
  <div class="generation-settings">
    <label class="field">
      <span class="field-label">Temperature <output>{{ temperature.toFixed(2) }}</output></span>
      <input
        type="range"
        min="0"
        max="2"
        step="0.05"
        :value="temperature"
        @input="setTemperature(Number(($event.target as HTMLInputElement).value))"
      />
    </label>

    <label class="field">
      <span class="field-label">
        Prompt budget <output>{{ promptBudget.toLocaleString() }} chars</output>
      </span>
      <input
        type="range"
        min="500"
        max="50000"
        step="500"
        :value="promptBudget"
        @input="setPromptBudget(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="field-hint">
        ~{{ estimatedTokens().toLocaleString() }} tokens of English prose
      </span>
    </label>

    <label class="field">
      <span class="field-label">Prefix share <output>{{ Math.round(prefixShare * 100) }}%</output></span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        :value="prefixShare"
        @input="setPrefixShare(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="field-hint">How much of the budget goes before the caret, once there is one.</span>
    </label>

    <label class="field">
      <span class="field-label">Context window (num_ctx)</span>
      <input
        type="number"
        min="1"
        placeholder="model default"
        :value="numCtx ?? ''"
        @input="onNumCtxInput(($event.target as HTMLInputElement).value)"
      />
      <span v-if="overNumCtx()" class="field-warning">
        The budget's own estimate is at or past this window -- the provider may
        silently drop the start of the prompt rather than answer about all of it.
      </span>
    </label>

    <label class="field field-checkbox">
      <input
        type="checkbox"
        :checked="sendSelection"
        @change="setSendSelection(($event.target as HTMLInputElement).checked)"
      />
      <span class="field-label">Show the model the passage being rewritten</span>
      <span class="field-hint">
        Only matters for a rewrite. Off asks the model to replace text it cannot
        see, which asks for the right length but not the right content.
      </span>
    </label>

    <!-- Only ollama honours `think` -- the chat-completions path ignores it, so a
         checkbox there would appear to work and silently do nothing. -->
    <label v-if="selectedModelProtocol === 'ollama'" class="think-toggle">
      <input
        type="checkbox"
        :checked="thinkEnabled"
        @change="setThinkEnabled(($event.target as HTMLInputElement).checked)"
      />
      Think before writing
    </label>

    <button type="button" class="reset" @click="reset">Reset to server defaults</button>
  </div>
</template>

<style scoped>
.generation-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--color-text);
}

.field-label output {
  color: var(--color-heading);
  font-weight: var(--font-weight-medium);
}

.field-hint {
  font-size: 0.75rem;
  opacity: 0.7;
}

.field-checkbox {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: var(--space-2);
  row-gap: var(--space-1);
}

.field-checkbox input[type='checkbox'] {
  grid-row: 1;
  margin-top: 2px;
}

.field-checkbox .field-hint {
  grid-column: 2;
}

.field-warning {
  font-size: 0.75rem;
  color: var(--color-danger);
}

.think-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--color-text);
  cursor: pointer;
}

input[type='range'] {
  width: 100%;
}

input[type='number'] {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-background-soft);
  color: var(--color-text);
}

.reset {
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background-soft);
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.85rem;
}

.reset:hover {
  border-color: var(--color-border-hover);
}
</style>
