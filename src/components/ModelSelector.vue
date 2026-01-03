<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { modelService, type Model } from '../services/model'

const models = ref<Model[]>([])
const selectedModelName = ref<string | null>(null)
const error = ref<string | null>(null)

const fetchModels = async () => {
  const token = localStorage.getItem('jwt_token')
  if (!token) return

  try {
    const data = await modelService.getModels(token)
    models.value = data
    if (models.value.length > 0 && models.value[0]) {
      selectedModelName.value = models.value[0].name
    }
  } catch (e: any) {
    error.value = e.message
    console.error('Failed to load models', e)
  }
}

onMounted(() => {
  fetchModels()
})
</script>

<template>
  <div class="model-selector">
    <h3>Models</h3>
    <div v-if="error" class="error">{{ error }}</div>
    <select v-model="selectedModelName">
      <option v-for="model in models" :key="model.name" :value="model.name">
        {{ model.name }}
      </option>
    </select>
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
}

select {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
}

select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.error {
  color: var(--color-danger);
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}
</style>
