/**
 * The two roots the API serves.
 *
 * A chapter and a note are the same kind of file, with the same routes over them; which
 * root a file is in is the only difference. It is the first argument of every call in
 * filesManager, and it is the tab the sidebar shows the file under.
 */
export type Space = 'stories' | 'notes'

export const SPACES: readonly Space[] = ['stories', 'notes']

export const SPACE_LABELS: Record<Space, string> = {
  stories: 'Stories',
  notes: 'Notes',
}

/** A directory under the stories is a story; one in the other root is a plain folder. */
export const DIR_ICONS: Record<Space, string> = {
  stories: '📖',
  notes: '🗁',
}

/**
 * Whether a file may sit at the root of the space.
 *
 * A chapter belongs to a story, so `POST /api/stories/file` with no directory is a 422.
 * A note has nowhere it has to be.
 */
export function allowsRootFiles(space: Space): boolean {
  return space === 'notes'
}

/** A space read back from storage, or the stories when there is nothing to read. */
export function asSpace(value: string | null): Space {
  return SPACES.includes(value as Space) ? (value as Space) : 'stories'
}
