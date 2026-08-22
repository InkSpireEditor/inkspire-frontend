import { ref } from 'vue'

/**
 * Module-level singleton: the Ollama model chosen in ModelSelector, read by Text
 * when generating. Shared by importing this module rather than through a store.
 */
const selectedModelName = ref<string | null>(null)

/** Sets the active model, or null to clear the selection. */
export function setSelectedModel(name: string | null) {
  selectedModelName.value = name
}

/** Clears the selection. Used by tests to isolate the shared singleton. */
export function resetSharedModel() {
  selectedModelName.value = null
}

export const useSharedModel = () => ({
  selectedModelName,
  setSelectedModel
})
