<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { modelService, type Model } from '../services/model'
import { useSharedModel } from '../services/sharedModel'
import { useSharedFiles } from '../services/sharedFiles'
import { refusedBy } from '../services/tags'
import { isLoggedIn } from '../services/api'

const { selectedModelName, setSelectedModel } = useSharedModel()
const { selectedTags } = useSharedFiles()
const models = ref<Model[]>([])
const error = ref<string | null>(null)

/**
 * The list is read again when the select or the window gets focus, so a provider that
 * has come on since the page loaded (a machine that was switched off) is offered without a
 * reload. Not more often than this: the server asks a provider it could not reach again at
 * every request, and an unreachable one can take a few seconds to give up.
 */
const REFRESH_AFTER_MS = 10_000
let lastRead = 0
let reading = false

/**
 * Loads the model list and, when nothing is selected yet, selects the first one
 * so generation works without the user having to open the dropdown.
 */
const fetchModels = async () => {
  if (!isLoggedIn()) return

  reading = true
  lastRead = Date.now()
  try {
    const data = await modelService.getModels()
    models.value = data
    error.value = null
    const firstModel = models.value[0]
    if (firstModel && !selectedModelName.value) {
      setSelectedModel(firstModel.name, firstModel.protocol, firstModel.refused_tags ?? [])
    }
  } catch (e: any) {
    error.value = e.message
    console.error('Failed to load models', e)
  } finally {
    reading = false
  }
}

/** Reads the list again unless one read is running or the last one was just now. The
 *  selected model is never changed by it: a model that has left the list is still the
 *  one a generation will ask for, and the server says if its provider is unreachable. */
const refresh = () => {
  if (reading || Date.now() - lastRead < REFRESH_AFTER_MS) return
  fetchModels()
}

/** The select box only carries a name, so the matching model's protocol is looked
 *  up here and the two are set together, the same as the auto-selection above. */
const onSelect = (name: string) => {
  const model = models.value.find((candidate) => candidate.name === name)
  setSelectedModel(name, model?.protocol ?? null, model?.refused_tags ?? [])
}

/**
 * The tag of the open file that keeps this model's provider away from it, or `null`. A
 * model like that stays in the list but cannot be picked while the file is open: the API
 * would refuse it, and saying so here saves the request.
 */
const refusal = (model: Model) => refusedBy(model.refused_tags ?? [], selectedTags.value)

onMounted(() => {
  fetchModels()
  window.addEventListener('focus', refresh)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', refresh)
})
</script>

<template>
  <div class="model-selector">
    <div v-if="error" class="error">{{ error }}</div>
    <select
      aria-label="Model"
      title="Model"
      :value="selectedModelName"
      @focus="refresh"
      @change="onSelect(($event.target as HTMLSelectElement).value)">
      <option
        v-for="model in models"
        :key="model.name"
        :value="model.name"
        :disabled="refusal(model) !== null"
      >
        {{ model.name }}{{ refusal(model) !== null ? ` (not for "${refusal(model)}")` : '' }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.model-selector {
  padding: var(--space-3);
  border-top: 1px solid var(--color-divider);
  background-color: var(--color-panel);
}

select {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color var(--transition), box-shadow var(--transition);
}

select:hover {
  border-color: var(--color-border-hover);
}

select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.error {
  color: var(--color-danger);
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}
</style>
