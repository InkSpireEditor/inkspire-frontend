/**
 * Per-character provenance: which characters a writer typed, which a model wrote, and
 * which a writer then corrected.
 *
 * The editor holds one `Kind` per character of the open file. The `.ink` file stores it
 * per paragraph instead, keyed by a hash of that paragraph's text, so editing one
 * paragraph leaves every other paragraph's provenance alone (`ARCHITECTURE.md` §7.3).
 * This module is the conversion between those two shapes, and nothing else: no DOM, no
 * fetch, no component. That is deliberate — the renderer cannot be unit-tested in jsdom
 * (§8.3), so every decision that can be made here is made here, the same reason
 * `loreGraph.ts` exists.
 *
 * Two rules have to mean the same thing here as in the Python, down to the byte: where
 * one paragraph ends, and what it hashes to. `paragraphs.json` is that agreement written
 * down, and `provenance.spec.ts` asserts against it. It is a byte-for-byte copy of the
 * API's own fixture, and `scripts/check_vectors.py` in the umbrella repository fails if
 * the two copies ever differ.
 *
 * There is no tag parsing and no escaping anywhere in this file. Provenance is separate
 * metadata, not markup in the prose, so a writer who types `<gen>` types four
 * characters and nothing more.
 */
import { blake2b } from '@noble/hashes/blake2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/** Written by hand, written by a model, or written by a model and corrected by hand. */
export type Kind = 'user' | 'gen' | 'fix'

/** The default, and the only kind that is never stored: absence means `user`. */
export const USER: Kind = 'user'

/** One stretch of one kind within a paragraph, `end` exclusive, offsets paragraph-relative. */
export type Run = [start: number, end: number, kind: Kind]

/**
 * The `metadata` field of `GET /file/{id}/document`: a paragraph's hash to its runs.
 *
 * The kind is `string` rather than `Kind` because this is what arrived over the wire. A
 * kind this build does not know is read as `user` — see `normaliseKind`.
 */
export type ProvenanceMetadata = Record<string, [number, number, string][]>

/**
 * The editor's own shape: the whole open text, and one kind per character of it.
 *
 * `prov.length === text.length` always, with no exception. Every function here either
 * preserves that or builds it from scratch, and `checkModel` is what says so out loud.
 */
export interface Model {
  text: string
  prov: Kind[]
}

/** How many hex characters of the digest a paragraph is keyed by. Matches §7.3. */
export const HASH_LENGTH = 16

/**
 * A run of two or more line endings, or the single one that closes a body.
 *
 * Not "two or more `\n`": under CRLF a blank line is `\r\n\r\n`, whose newlines are not
 * adjacent, so counting consecutive `\n` would never separate anything in a file written
 * on Windows. A bare `\r` is text. `$` without the `m` flag asserts the end of the whole
 * string, which is Python's `\Z` and not its `$`.
 */
const SEPARATOR = String.raw`(?:\r?\n){2,}|\r?\n$`

/** A kind this build understands, or `user` for anything it does not. */
function normaliseKind(kind: string): Kind {
  return kind === 'gen' || kind === 'fix' ? kind : USER
}

/**
 * `body` as its paragraphs and the separators around them.
 *
 * `seps` holds one more entry than `paras` — one before the first paragraph and one
 * after the last, either possibly empty — so `joinParagraphs` rebuilds the body exactly.
 * That is what carries a body's leading blank lines and its closing newline without
 * either landing inside a paragraph's text, and the closing newline has to stay out: the
 * API adds one where a section follows the body, so a hash that counted it would move on
 * the first save (§7.2, round trip).
 *
 * A body of nothing but blank lines has no paragraphs and one separator.
 */
export function splitParagraphs(body: string): { paras: string[]; seps: string[] } {
  const paras: string[] = []
  const seps: string[] = []
  let pending = ''
  let position = 0

  // A fresh regex per call. `exec` resets `lastIndex` to 0 when it returns null, so the
  // loop below is safe with a shared one as it stands -- but only because it always runs
  // to null. Anyone adding an early exit would leave the cursor mid-string for the next
  // caller, and this costs an allocation per load to make that impossible.
  const separator = new RegExp(SEPARATOR, 'g')
  let match = separator.exec(body)
  while (match !== null) {
    const text = body.slice(position, match.index)
    if (text) {
      seps.push(pending)
      paras.push(text)
      pending = match[0]
    } else {
      pending += match[0]
    }
    position = match.index + match[0].length
    match = separator.exec(body)
  }

  const tail = body.slice(position)
  if (tail) {
    seps.push(pending)
    paras.push(tail)
    pending = ''
  }
  seps.push(pending)

  return { paras, seps }
}

/**
 * The body `splitParagraphs` took apart, exactly as it was.
 *
 * Throws where there is not one separator more than there are paragraphs, since the
 * result would silently lose or invent text.
 */
export function joinParagraphs(paras: string[], seps: string[]): string {
  if (seps.length !== paras.length + 1) {
    throw new Error(
      `${paras.length} paragraphs need ${paras.length + 1} separators, not ${seps.length}`,
    )
  }
  // Driven from `seps`, which is the longer list: the last iteration has no paragraph
  // after it, which is exactly what the extra separator is.
  let text = ''
  seps.forEach((sep, index) => {
    text += sep + (paras[index] ?? '')
  })
  return text
}

/**
 * The key a paragraph's runs are stored under: `blake2b` of its UTF-8 bytes, truncated.
 *
 * From `@noble/hashes`, never hand-written. Its default digest is 64 bytes, as Python's
 * `hashlib.blake2b` is, so truncating to `HASH_LENGTH` hex characters is the same
 * operation on both sides.
 */
export function paragraphHash(text: string): string {
  return bytesToHex(blake2b(new TextEncoder().encode(text))).slice(0, HASH_LENGTH)
}

/** One paragraph of `body` and where it begins in it. */
interface Placed {
  para: string
  start: number
}

/**
 * Each of `body`'s paragraphs with its own offset into `body`.
 *
 * A paragraph carries where it is rather than a caller indexing two parallel arrays,
 * which is what keeps the offset arithmetic in one place: a model is per character of the
 * whole body, while a stored run is relative to its paragraph, and this is the only thing
 * that converts between the two.
 */
function placed(body: string): Placed[] {
  const { paras, seps } = splitParagraphs(body)
  const found: Placed[] = []
  let position = 0
  seps.forEach((sep, index) => {
    position += sep.length
    const para = paras[index]
    if (para !== undefined) {
      found.push({ para, start: position })
      position += para.length
    }
  })
  return found
}

/**
 * `metadata` as one kind per character of `body`.
 *
 * A paragraph whose hash is absent from `metadata`, or whose hash does not match,
 * contributes all-`user`. That should be rare, because `GET /document` reconciles
 * server-side before answering (§7.5) — but it has to be handled, because a recovery git
 * cannot make resets the paragraph, and nothing here may assume every hash matches. When
 * it happens, only that paragraph is affected; its neighbours keep their own runs.
 *
 * Offsets outside the paragraph are clamped rather than thrown on. A `.ink` file can be
 * edited by hand and can say anything, and opening a chapter must not fail because it
 * does — the same rule the API's `expand_runs` follows.
 *
 * Separators are always `user`: a blank line between two paragraphs belongs to neither.
 */
export function modelFromMetadata(body: string, metadata: ProvenanceMetadata | null): Model {
  const prov: Kind[] = new Array(body.length).fill(USER)
  if (metadata === null) {
    return { text: body, prov }
  }

  for (const { para, start: base } of placed(body)) {
    const runs = metadata[paragraphHash(para)]
    if (runs === undefined) {
      continue
    }
    for (const [start, end, kind] of runs) {
      const first = Math.max(0, Math.min(Math.trunc(start), para.length))
      const last = Math.max(first, Math.min(Math.trunc(end), para.length))
      prov.fill(normaliseKind(kind), base + first, base + last)
    }
  }

  return { text: body, prov }
}

/** Neighbouring characters of one kind as one run, dropping the `user` stretches. */
export function runsOf(prov: Kind[]): Run[] {
  const runs: Run[] = []
  let start = 0
  // `undefined` is the "nothing open yet" marker, which is unambiguous because a `Kind`
  // can never be undefined.
  let open: Kind | undefined
  prov.forEach((kind, index) => {
    if (open === kind) {
      return
    }
    if (open !== undefined && open !== USER) {
      runs.push([start, index, open])
    }
    open = kind
    start = index
  })
  if (open !== undefined && open !== USER) {
    runs.push([start, prov.length, open])
  }
  return runs
}

/**
 * `model` as the `metadata` field of `PUT /file/{id}/document`.
 *
 * **Every paragraph gets an entry, including one with no model-written text**, whose
 * entry is an empty list. A missing key and an empty list are different things: an empty
 * list says the editor has been here and this paragraph is all the writer's, while a
 * missing key says nothing is known, which is what makes the paragraph a candidate for
 * recovery from history. Writing nothing for a hand-written paragraph would have the API
 * try to recover prose that was never generated.
 *
 * Two identical paragraphs share one key, and so one entry (§7.3). They cannot be told
 * apart, so they cannot hold different runs.
 */
export function metadataFromModel(model: Model): ProvenanceMetadata {
  checkModel(model)
  const metadata: ProvenanceMetadata = {}
  for (const { para, start } of placed(model.text)) {
    metadata[paragraphHash(para)] = runsOf(model.prov.slice(start, start + para.length))
  }
  return metadata
}

/**
 * Throws unless `model` holds exactly one kind per character.
 *
 * The invariant everything else is allowed to assume. A model that has drifted out of
 * step renders the wrong characters in colour and saves runs over the wrong offsets, and
 * both are quiet failures — so this is loud instead, and called wherever a model crosses
 * into or out of this module.
 */
export function checkModel(model: Model): void {
  if (model.prov.length !== model.text.length) {
    throw new Error(
      `provenance is out of step with the text: ${model.prov.length} kinds for ` +
        `${model.text.length} characters`,
    )
  }
}
