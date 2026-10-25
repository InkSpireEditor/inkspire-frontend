/**
 * The numbers on the homepage, worked out from the two `tree` responses as plain functions so
 * they are testable without a DOM -- the same split as `zoom.ts` and `cursor.ts`.
 */
import type { TreeApiResponse } from './filesManager'

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
