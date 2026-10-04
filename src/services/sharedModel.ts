import { ref } from 'vue'
import type { ModelProtocol } from './model'

/**
 * Module-level singleton: the model chosen in ModelSelector, read by Text when
 * generating. Shared by importing this module rather than through a store.
 */
const selectedModelName = ref<string | null>(null)
/**
 * The selected model's protocol, set alongside its name. Only `ollama` honours
 * `think`, so this is what a caller checks before sending it -- without re-fetching
 * or re-searching the model list for an entry it already saw once.
 */
const selectedModelProtocol = ref<ModelProtocol | null>(null)
/**
 * Whether to ask a reasoning model to think, for the next generation. Kept beside
 * the model selection, not the open file, so switching chapters does not reset it.
 */
const thinkEnabled = ref(false)

/** Sets the active model and its protocol together, or both to null to clear it. */
export function setSelectedModel(name: string | null, protocol: ModelProtocol | null = null) {
  selectedModelName.value = name
  selectedModelProtocol.value = protocol
}

export function setThinkEnabled(value: boolean) {
  thinkEnabled.value = value
}

/** Clears the selection. Used by tests to isolate the shared singleton. */
export function resetSharedModel() {
  selectedModelName.value = null
  selectedModelProtocol.value = null
  thinkEnabled.value = false
}

export const useSharedModel = () => ({
  selectedModelName,
  selectedModelProtocol,
  thinkEnabled,
  setSelectedModel,
  setThinkEnabled
})
