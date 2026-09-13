import { computed, ref } from 'vue'
import type { Space } from './spaces'

/**
 * Module-level singleton: the file selected in Tree and loaded by Text. Shared by
 * importing this module rather than through a store.
 *
 * A file is named by the space it is in as well as by its id, since the two roots
 * answer on different routes and an id alone does not say which to ask.
 */
export interface FileSelection {
  space: Space
  id: string
}

const selectedFile = ref<FileSelection | null>(null)

/** The selected file's id, for anything that only has to tell one file from another. */
const selectedFileId = computed(() => selectedFile.value?.id ?? null)

function setSelectedFile(space: Space, id: string) {
  selectedFile.value = { space, id }
}

function clearSelectedFile() {
  selectedFile.value = null
}

export const useSharedFiles = () => ({
  selectedFile,
  selectedFileId,
  setSelectedFile,
  clearSelectedFile
})
