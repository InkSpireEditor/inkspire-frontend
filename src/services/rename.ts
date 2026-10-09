import { useRoute, useRouter } from 'vue-router'
import { filesManagerService } from './filesManager'
import { useSharedFiles } from './sharedFiles'
import type { Space } from './spaces'

/**
 * A composable renaming a file, and following it to its new id.
 *
 * A file's id is derived from its path, so renaming one *usually* changes it. Anything
 * still naming the old id is then pointing at something the API no longer has: the shared
 * selection, whose next save would fail, and the editor's own URL. Both are moved across
 * here. A directory keeps its id through a rename, so this is files only.
 *
 * A rename that only changes case or spacing leaves the filename, and so the id, alone --
 * "first chapter" and "First Chapter" are one filename and two names. `setSelectedFile` is
 * still called in that case: it is the open file's title that changed, not its identity,
 * and `Text.vue`'s watch on the selection is what makes it re-read that title. Assigning a
 * fresh `{space, id}` even when both fields already hold those values is what triggers it,
 * since the watch is on the ref's reference, not a deep comparison of its contents.
 *
 * One implementation for both call sites that need this rule -- `Tree.vue`'s "Edit"
 * context-menu action and `Text.vue`'s title-proposal button (frontend#30) -- rather than
 * two copies of the same follow-the-new-id logic.
 *
 * Calls `useRoute`/`useRouter`/`useSharedFiles` itself, so a caller just invokes this in
 * `setup` and gets back one function to call on a rename. Answers the renamed id, or
 * `null` if the API gave back none.
 */
export function useRename() {
  const { selectedFileId, setSelectedFile } = useSharedFiles()
  const route = useRoute()
  const router = useRouter()

  return async (space: Space, id: string, name: string): Promise<string | null> => {
    const renamed = await filesManagerService.editFile(space, id, name)
    if (!renamed?.id) return null

    if (selectedFileId.value === id) {
      setSelectedFile(space, renamed.id)
    }
    if (renamed.id !== id && route.name === 'write' && route.params.fileId === id) {
      // The story id comes from the route being replaced rather than from the
      // caller: it is the one place it is certainly present, and it cannot disagree.
      router.replace({
        name: 'write',
        params: { id: route.params.id, fileId: renamed.id },
      })
    }
    return renamed.id
  }
}
