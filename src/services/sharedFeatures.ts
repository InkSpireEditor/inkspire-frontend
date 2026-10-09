import { ref } from 'vue'
import { llmService } from './llm'

/**
 * Module-level singleton: which optional, small-model-backed features this
 * installation offers -- today, only `title` (frontend#30). Shared by importing
 * this module rather than through a store, the way `sharedSettings` is.
 *
 * Unlike `sharedSettings`, nothing here is persisted: this is the server's own
 * answer about itself, not a writer's preference, so there is nothing to
 * remember between sessions and nothing a reload should keep.
 */
const title = ref(false)
/** Whether `ensureLoaded` has already run once. */
const loaded = ref(false)

/**
 * Loads the server's features once. Safe to call from every component that
 * might mount first -- only the first call does anything.
 */
async function ensureLoaded(): Promise<void> {
  if (loaded.value) return
  const features = await llmService.getFeatures()
  title.value = features.title
  loaded.value = true
}

/** Clears everything. Used by tests to isolate the shared singleton. */
export function resetSharedFeatures() {
  title.value = false
  loaded.value = false
}

export const useSharedFeatures = () => ({
  title,
  loaded,
  ensureLoaded,
})
