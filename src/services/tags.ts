/**
 * Tags on files, as plain functions. A tag is a lowercase word: once trimmed and lowercased
 * it uses `a-z`, `0-9`, `-` and `_` and is at most 32 characters, which is the rule the API
 * applies (`inkspire_api/ink.py`, `normalise_tag`). It is checked here only so an input can
 * refuse a tag before sending it; the API refuses one regardless.
 */
import type { TreeApiResponse } from './filesManager'

export const MAX_TAG_LENGTH = 32

/** What the rule says, for a message beside an input. */
export const TAG_RULE = `A tag uses a-z, 0-9, "-" and "_", up to ${MAX_TAG_LENGTH} characters.`

const TAG_PATTERN = /^[a-z0-9_-]+$/

/** `value` as a tag, or `null` when it is empty or not a tag. */
export const normaliseTag = (value: string): string | null => {
  const tag = value.trim().toLowerCase()
  return tag.length > 0 && tag.length <= MAX_TAG_LENGTH && TAG_PATTERN.test(tag) ? tag : null
}

/** `tags` with `tag` added at the end, unless it is already there. */
export const withTag = (tags: readonly string[], tag: string): string[] =>
  tags.includes(tag) ? [...tags] : [...tags, tag]

/** `tags` without `tag`. */
export const withoutTag = (tags: readonly string[], tag: string): string[] =>
  tags.filter((existing) => existing !== tag)

/** Every tag on any file of the given trees, each once, in alphabetical order. */
export const allTags = (...trees: TreeApiResponse[]): string[] => {
  const found = new Set<string>()
  for (const tree of trees) {
    for (const file of [...tree.dirs.flatMap((dir) => dir.files), ...tree.files]) {
      for (const tag of file.tags ?? []) found.add(tag)
    }
  }
  return [...found].sort()
}
