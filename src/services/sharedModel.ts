import { ref } from 'vue'

const selectedModelName = ref<string | null>(null)

export function setSelectedModel(name: string | null) {
  selectedModelName.value = name
}

export function resetSharedModel() {
  selectedModelName.value = null
}

export const useSharedModel = () => ({
  selectedModelName,
  setSelectedModel
})
