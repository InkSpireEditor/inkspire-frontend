import { watch } from 'vue'
import { useSharedFiles, type FileSelection } from './sharedFiles'
import { SPACES } from './spaces'

/**
 * The files opened most recently in this browser, newest first, kept in `localStorage` so the
 * homepage can link back to them. Nothing in the API says when a file was last edited
 * (frontend#12), so this is what was opened here, not what was changed.
 */
const STORAGE_KEY = 'inkspire.recentFiles'

/** How many files the list keeps. */
export const MAX_RECENT = 8

/** `list` with `entry` at the head, once, and no more than `MAX_RECENT` entries long. */
export function remember(list: FileSelection[], entry: FileSelection): FileSelection[] {
  const others = list.filter((one) => !(one.space === entry.space && one.id === entry.id))
  return [entry, ...others].slice(0, MAX_RECENT)
}

const isEntry = (value: unknown): value is FileSelection => {
  if (typeof value !== 'object' || value === null) return false
  const { space, id } = value as Record<string, unknown>
  return typeof id === 'string' && SPACES.includes(space as FileSelection['space'])
}

/** The stored list; empty when nothing is stored, storage is blocked, or what is there is not a list. */
export function loadRecent(): FileSelection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

export function saveRecent(list: FileSelection[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage blocked or full: the list is a convenience, so it is simply not kept.
  }
}

/**
 * Records every file the shared selection moves to, whichever way it was opened: from the
 * tree, from a URL, by creating it or by renaming it. Called once, from `main.ts`. Answers
 * the function that stops it.
 */
export function trackRecentFiles(): () => void {
  const { selectedFile } = useSharedFiles()
  return watch(selectedFile, (selection) => {
    if (selection) saveRecent(remember(loadRecent(), selection))
  })
}
