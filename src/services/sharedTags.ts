import { ref } from 'vue'
import { filesManagerService } from './filesManager'
import { allTags } from './tags'

/**
 * The tags that exist on any file of either root, for an input to suggest. Module-level
 * state like `sharedFiles.ts`: the editor, a directory's page and the sidebar's edit modal
 * all offer the same list.
 */
const knownTags = ref<string[]>([])

/**
 * Reads both trees again. A failure leaves the list as it was: a suggestion that is
 * missing is not worth interrupting anyone for.
 */
const refreshKnownTags = async (): Promise<void> => {
  try {
    const [stories, notes] = await Promise.all([
      filesManagerService.getTree('stories'),
      filesManagerService.getTree('notes')
    ])
    knownTags.value = allTags(stories, notes)
  } catch (e) {
    console.error('Failed to load the known tags', e)
  }
}

export function useKnownTags() {
  return { knownTags, refreshKnownTags }
}
