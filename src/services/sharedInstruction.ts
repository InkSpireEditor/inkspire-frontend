import { ref } from 'vue'

/**
 * The writer's own one-off steering for the next Generate or Rewrite
 * (api#19/frontend#24) -- e.g. "make this more neutral". Module-level singleton,
 * the same "shared state without a store" pattern `sharedModel.ts`/`sharedFiles.ts`
 * already use, so `GenerationInstruction.vue` (wherever it ends up mounted) and
 * `Text.vue` read and write the one value with no prop or event between them.
 *
 * Deliberately not part of `sharedSettings.ts`: that module is durable preferences
 * restored from a server default and persisted to `localStorage`; this is neither --
 * ephemeral per-file content with no server default at all. `Text.vue` clears it
 * whenever the selected file changes, not after each generation, so a writer can
 * click Generate several times under the same instruction without retyping it.
 */
const instruction = ref('')

export function setInstruction(value: string) {
  instruction.value = value
}

export function clearInstruction() {
  instruction.value = ''
}

/** Clears the singleton. Used by tests to isolate it between runs. */
export function resetSharedInstruction() {
  instruction.value = ''
}

export const useSharedInstruction = () => ({
  instruction,
  setInstruction,
  clearInstruction
})
