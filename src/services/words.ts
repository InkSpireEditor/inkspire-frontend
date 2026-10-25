/**
 * How many words a text has: runs of characters between whitespace. The API sends no count
 * (the scan reads only a file's header, so a count would mean reading every file on every
 * save), so the pages that show one fetch the prose and count it here.
 */
export const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length
