<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { modelService, type Model } from '../services/model'
import { useSharedModel } from '../services/sharedModel'
import { isLoggedIn } from '../services/api'

const { selectedModelName, selectedModelProtocol, thinkEnabled, setSelectedModel, setThinkEnabled } =
  useSharedModel()
const models = ref<Model[]>([])
const error = ref<string | null>(null)

/**
 * Loads the model list and, when nothing is selected yet, selects the first one
 * so generation works without the user having to open the dropdown.
 */
const fetchModels = async () => {
  if (!isLoggedIn()) return

  try {
    const data = await modelService.getModels()
    models.value = data
    const firstModel = models.value[0]
    if (firstModel && !selectedModelName.value) {
      setSelectedModel(firstModel.name, firstModel.protocol)
    }
  } catch (e: any) {
    error.value = e.message
    console.error('Failed to load models', e)
  }
}

/** The select box only carries a name, so the matching model's protocol is looked
 *  up here and the two are set together, the same as the auto-selection above. */
const onSelect = (name: string) => {
  const model = models.value.find((candidate) => candidate.name === name)
  setSelectedModel(name, model?.protocol ?? null)
}

onMounted(() => {
  fetchModels()
})
</script>

<template>
  <div class="model-selector">
    <h3>Models</h3>
    <div v-if="error" class="error">{{ error }}</div>
    <select :value="selectedModelName" @change="onSelect(($event.target as HTMLSelectElement).value)">
      <option v-for="model in models" :key="model.name" :value="model.name">
        {{ model.name }}
      </option>
    </select>
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
  </div>
</template>

<style scoped>
.model-selector {
  padding: 1rem;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-background);
}

h3 {
  margin-top: 0;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
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

.think-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--color-text);
  cursor: pointer;
}
</style>
