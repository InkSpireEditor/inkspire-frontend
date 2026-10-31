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
 * The tags the selected model's provider refuses, set alongside its name: a file carrying
 * one of them cannot be sent to this model (`refusedBy`, `services/tags.ts`).
 */
const selectedModelRefusedTags = ref<string[]>([])
/**
 * Whether to ask a reasoning model to think, for the next generation. Kept beside
 * the model selection, not the open file, so switching chapters does not reset it.
 */
const thinkEnabled = ref(false)

/** Sets the active model, its protocol and the tags its provider refuses together, or clears them. */
export function setSelectedModel(
  name: string | null,
  protocol: ModelProtocol | null = null,
  refusedTags: string[] = []
) {
  selectedModelName.value = name
  selectedModelProtocol.value = protocol
  selectedModelRefusedTags.value = refusedTags
}

export function setThinkEnabled(value: boolean) {
  thinkEnabled.value = value
}

/** Clears the selection. Used by tests to isolate the shared singleton. */
export function resetSharedModel() {
  selectedModelName.value = null
  selectedModelProtocol.value = null
  selectedModelRefusedTags.value = []
  thinkEnabled.value = false
}

export const useSharedModel = () => ({
  selectedModelName,
  selectedModelProtocol,
  selectedModelRefusedTags,
  thinkEnabled,
  setSelectedModel,
  setThinkEnabled
})
