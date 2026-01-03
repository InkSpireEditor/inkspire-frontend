import { ref } from 'vue'

const selectedFileId = ref<number | null>(null)

/**
 * Sets the currently selected file ID.
 * @param id The ID of the file or null to deselect.
 */
export function setSelectedFile(id: number | null) {
  selectedFileId.value = id
}

export const useSharedFiles = () => ({
  selectedFileId,
  setSelectedFile
})
