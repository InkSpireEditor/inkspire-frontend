/**
 * The numbers on the homepage, worked out from the two `tree` responses as plain functions so
 * they are testable without a DOM -- the same split as `zoom.ts` and `cursor.ts`.
 */
import type { TreeApiResponse } from './filesManager'
import type { FileSelection } from './sharedFiles'
import type { Space } from './spaces'

export interface Counts {
  stories: number
  chapters: number
  oneShots: number
  notesFolders: number
  notes: number
}

/**
 * In the stories tree a directory is a story, its files are chapters, and a file at the root is
 * a one-shot. In the notes tree a directory is a folder and a file may sit in it or at the root.
 */
export const countEntries = (stories: TreeApiResponse, notes: TreeApiResponse): Counts => ({
  stories: stories.dirs.length,
  chapters: stories.dirs.reduce((total, dir) => total + dir.files.length, 0),
  oneShots: stories.files.length,
  notesFolders: notes.dirs.length,
  notes: notes.dirs.reduce((total, dir) => total + dir.files.length, notes.files.length)
})

/** A recently opened file, found in a tree: what to call it and which route opens it. */
export interface RecentFile {
  space: Space
  id: string
  name: string
  /** The story or folder the file is in; `null` for a one-shot or a note at the root. */
  dir: { id: string; name: string } | null
}

/**
 * Each recorded file that is still in its tree, in the order recorded. One that is not
 * (deleted, or renamed, which changes its id) is left out.
 */
export const resolveRecent = (
  recorded: FileSelection[],
  trees: Record<Space, TreeApiResponse>
): RecentFile[] => {
  const found: RecentFile[] = []
  for (const { space, id } of recorded) {
    const tree = trees[space]
    const root = tree.files.find((file) => file.id === id)
    if (root) {
      found.push({ space, id, name: root.name, dir: null })
      continue
    }
    for (const dir of tree.dirs) {
      const file = dir.files.find((one) => one.id === id)
      if (file) {
        found.push({ space, id, name: file.name, dir: { id: dir.id, name: dir.name } })
        break
      }
    }
  }
  return found
}
