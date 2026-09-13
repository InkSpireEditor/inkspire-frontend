import { ref } from 'vue'

/**
 * Module-level singleton: the file selected in Tree and loaded by Text. Shared
 * by importing this module rather than through a store.
 */
const selectedFileId = ref<string | null>(null)

/**
 * Sets the currently selected file ID.
 * @param id The ID of the file or null to deselect.
 */
function setSelectedFile(id: string | null) {
  selectedFileId.value = id
}

export const useSharedFiles = () => ({
  selectedFileId,
  setSelectedFile
})
