/**
 * The numbers on the homepage, worked out from the two `tree` responses as plain functions so
 * they are testable without a DOM -- the same split as `zoom.ts` and `cursor.ts`.
 */
import type { TreeApiResponse } from './filesManager'
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

/** A file shown under "Last edited": what to call it, where it is, and when it last changed. */
export interface EditedFile {
  space: Space
  id: string
  name: string
  /** The story or folder the file is in; `null` for a one-shot or a note at the root. */
  dir: { id: string; name: string } | null
  /** ISO 8601 UTC string, the server's own modification time (inkspire-api#29). */
  modified: string
}

/**
 * Every file of both trees (chapters, one-shots, notes, notes in folders) that has a
 * `modified`, newest first (ties by name), at most `limit`. Files without one (an older
 * server) are left out, and no directory is ever listed: "Last edited" is about files.
 */
export const lastEdited = (
  stories: TreeApiResponse,
  notes: TreeApiResponse,
  limit = 5
): EditedFile[] => {
  const edited: EditedFile[] = []
  for (const space of ['stories', 'notes'] as const) {
    const tree = space === 'stories' ? stories : notes
    for (const file of tree.files) {
      if (file.modified) {
        edited.push({ space, id: file.id, name: file.name, dir: null, modified: file.modified })
      }
    }
    for (const dir of tree.dirs) {
      for (const file of dir.files) {
        if (file.modified) {
          edited.push({
            space,
            id: file.id,
            name: file.name,
            dir: { id: dir.id, name: dir.name },
            modified: file.modified
          })
        }
      }
    }
  }
  return edited
    .sort((a, b) => b.modified.localeCompare(a.modified) || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** One bar of a chart: what it is, how much, and a line of detail for its tooltip. */
export interface Bar {
  label: string
  value: number
  detail?: string
}

/** What a status-less file is counted under. */
export const NO_STATUS = 'No status'

const byValueThenLabel = (a: Bar, b: Bar) => b.value - a.value || a.label.localeCompare(b.label)

/**
 * How many chapters and one-shots carry each status, the most common first. A file with no
 * status is counted under `NO_STATUS`, and where it sorts is where its count puts it.
 */
export const statusBars = (stories: TreeApiResponse): Bar[] => {
  const counts = new Map<string, number>()
  const files = [...stories.dirs.flatMap((dir) => dir.files), ...stories.files]
  for (const file of files) {
    const label = file.status.trim() || NO_STATUS
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts].map(([label, value]) => ({ label, value })).sort(byValueThenLabel)
}

/**
 * Words in each story, the most first. A story's words are its chapters', and a one-shot is its
 * own bar. A file whose prose is not in `words` (it could not be fetched) adds nothing.
 */
export const wordBars = (stories: TreeApiResponse, words: Record<string, number>): Bar[] => {
  const bars: Bar[] = stories.dirs.map((dir) => ({
    label: dir.name,
    value: dir.files.reduce((total, file) => total + (words[file.id] ?? 0), 0),
    detail: dir.files.length === 1 ? '1 chapter' : `${dir.files.length} chapters`
  }))
  for (const file of stories.files) {
    bars.push({ label: file.name, value: words[file.id] ?? 0, detail: 'One-shot' })
  }
  return bars.sort(byValueThenLabel)
}

/**
 * The first `limit - 1` bars, and the rest folded into one called `otherLabel`, when there are
 * more than `limit`. A chart of a dozen bars is a list; folding the tail keeps it a chart, and
 * the table view still has every row.
 */
export const foldTail = (bars: Bar[], limit: number, otherLabel: string): Bar[] => {
  if (bars.length <= limit) return bars
  const kept = bars.slice(0, limit - 1)
  const rest = bars.slice(limit - 1)
  return [
    ...kept,
    {
      label: otherLabel,
      value: rest.reduce((total, bar) => total + bar.value, 0),
      detail: `${rest.length} more`
    }
  ]
}

export const sumBars = (bars: Bar[]): number => bars.reduce((total, bar) => total + bar.value, 0)
