/**
 * Where one paragraph ends, what it hashes to, and the conversion either way.
 *
 * `paragraphs.json` is a byte-for-byte copy of `inkspire-api/tests/data/paragraphs.json`
 * and the API's own suite asserts against the same cases, so a change to either
 * implementation that is not a change to that file breaks one of the two suites.
 * `scripts/check_vectors.py` in the umbrella repository fails if the copies ever differ.
 *
 * The file is a specification, not a recording: its expectations were written by hand and
 * checked to rebuild each body, and its hashes came from Python's `hashlib` directly.
 */
import { describe, it, expect } from 'vitest'
import {
  applyEdit,
  checkModel,
  classify,
  diffText,
  joinParagraphs,
  metadataFromModel,
  modelFromMetadata,
  paragraphHash,
  runsOf,
  splitParagraphs,
  type Kind,
  type Model,
  type ProvenanceMetadata,
} from './provenance'
import vectors from './paragraphs.json'

interface Vector {
  name: string
  body: string
  paragraphs: string[]
  separators: string[]
  hashes: string[]
}

const cases = vectors as Vector[]

// §7.5's worked example, so this file and the API's agree on a concrete case.
const PARA = 'The door creaked. The streets glistened like wet glass under the lamplight.'
const PARA_HASH = '47f57caaa4fb330e'
const PARA_RUNS: [number, number, string][] = [
  [18, 45, 'gen'],
  [45, 54, 'fix'],
  [54, 75, 'gen'],
]

// --- the shared vectors ----------------------------------------------------

describe('the shared vectors', () => {
  it('has the cases the API exported', () => {
    expect(cases).toHaveLength(15)
  })

  it.each(cases)('splits $name exactly as the vectors say', (vector) => {
    const { paras, seps } = splitParagraphs(vector.body)
    expect(paras).toEqual(vector.paragraphs)
    expect(seps).toEqual(vector.separators)
  })

  it.each(cases)('rebuilds $name byte for byte', (vector) => {
    const { paras, seps } = splitParagraphs(vector.body)
    expect(joinParagraphs(paras, seps)).toBe(vector.body)
  })

  it.each(cases)('hashes $name as the vectors say', (vector) => {
    const { paras } = splitParagraphs(vector.body)
    expect(paras.map(paragraphHash)).toEqual(vector.hashes)
  })

  it.each(cases)('leaves $name with one more separator than paragraphs', (vector) => {
    const { paras, seps } = splitParagraphs(vector.body)
    expect(seps).toHaveLength(paras.length + 1)
  })
})

// --- the split, where the vectors do not reach -----------------------------

describe('splitParagraphs', () => {
  it('keeps a closing newline out of the last paragraph', () => {
    // Which is the whole reason the separators number one more than the paragraphs: the
    // API adds a closing newline where a section follows the body, so a hash that
    // counted it would move on the first save.
    expect(splitParagraphs('One.').paras).toEqual(['One.'])
    expect(splitParagraphs('One.\n').paras).toEqual(['One.'])
    expect(splitParagraphs('One.\n').paras.map(paragraphHash)).toEqual([paragraphHash('One.')])
  })

  it('separates on two line endings of any flavour', () => {
    for (const separator of ['\n\n', '\r\n\r\n', '\r\n\n', '\n\r\n']) {
      expect(splitParagraphs(`One.${separator}Two.`).paras).toEqual(['One.', 'Two.'])
    }
  })

  it('keeps a paragraph whole across a single line break', () => {
    expect(splitParagraphs('One.\nStill one.').paras).toEqual(['One.\nStill one.'])
  })

  it('does not separate on a blank line holding a space', () => {
    expect(splitParagraphs('One.\n \nTwo.').paras).toEqual(['One.\n \nTwo.'])
  })

  it('does not treat a bare carriage return as a line ending', () => {
    expect(splitParagraphs('One.\r\rTwo.').paras).toEqual(['One.\r\rTwo.'])
  })

  it('answers the same thing however many times it is called', () => {
    // Worth asserting, but it does not prove the regex is per-call: `exec` resets
    // `lastIndex` when it returns null, so the loop is safe with a shared one too. What
    // would break it is an early exit from that loop, which no test can reach from here.
    expect(splitParagraphs('One.\n\nTwo.\n').paras).toEqual(['One.', 'Two.'])
    expect(splitParagraphs('One.\n\nTwo.\n').paras).toEqual(['One.', 'Two.'])
    expect(splitParagraphs('A.\n\nB.\n\nC.').paras).toEqual(['A.', 'B.', 'C.'])
  })
})

describe('joinParagraphs', () => {
  it('refuses the wrong number of separators rather than losing text', () => {
    expect(() => joinParagraphs(['One.', 'Two.'], ['', '\n\n'])).toThrow('need 3 separators')
  })

  it('gives back the separator it was handed when there are no paragraphs', () => {
    expect(joinParagraphs([], ['\n\n\n'])).toBe('\n\n\n')
  })
})

// --- metadata to a model ---------------------------------------------------

describe('modelFromMetadata', () => {
  it('is all user with no metadata at all', () => {
    const body = 'One.\n\nTwo.\n'
    const model = modelFromMetadata(body, null)
    expect(model.text).toBe(body)
    expect(model.prov).toHaveLength(body.length)
    expect(new Set(model.prov)).toEqual(new Set(['user']))
  })

  it('is all user for an empty body', () => {
    expect(modelFromMetadata('', null)).toEqual({ text: '', prov: [] })
    expect(modelFromMetadata('', {})).toEqual({ text: '', prov: [] })
  })

  it('applies a matching entry at the right offsets', () => {
    const model = modelFromMetadata(`${PARA}\n`, { [PARA_HASH]: PARA_RUNS })
    expect(model.prov).toHaveLength(PARA.length + 1)
    expect(model.prov.slice(0, 18)).toEqual(new Array(18).fill('user'))
    expect(model.prov.slice(18, 45)).toEqual(new Array(27).fill('gen'))
    expect(model.prov.slice(45, 54)).toEqual(new Array(9).fill('fix'))
    expect(model.prov.slice(54, 75)).toEqual(new Array(21).fill('gen'))
    // The closing newline is a separator, so it belongs to no paragraph.
    expect(model.prov[75]).toBe('user')
  })

  it('offsets a second paragraph by everything before it', () => {
    const body = `Untouched.\n\n${PARA}\n`
    const model = modelFromMetadata(body, { [PARA_HASH]: PARA_RUNS })
    const base = 'Untouched.\n\n'.length
    expect(model.prov.slice(0, base)).toEqual(new Array(base).fill('user'))
    expect(model.prov.slice(base + 18, base + 45)).toEqual(new Array(27).fill('gen'))
  })

  it('treats a separator as user even between two generated paragraphs', () => {
    const body = `${PARA}\n\n${PARA}\n`
    const model = modelFromMetadata(body, { [PARA_HASH]: PARA_RUNS })
    expect(model.prov.slice(PARA.length, PARA.length + 2)).toEqual(['user', 'user'])
  })

  it('leaves a paragraph whose hash is absent all user', () => {
    const body = 'One.\n\nTwo.\n'
    const model = modelFromMetadata(body, { [paragraphHash('One.')]: [[0, 2, 'gen']] })
    expect(model.prov.slice(0, 2)).toEqual(['gen', 'gen'])
    expect(model.prov.slice(6)).toEqual(new Array(body.length - 6).fill('user'))
  })

  it('leaves a paragraph whose hash does not match all user, and its neighbours alone', () => {
    // What a recovery git could not make looks like: one paragraph reset, the rest intact.
    const body = `One.\n\n${PARA}\n`
    const model = modelFromMetadata(body, {
      [paragraphHash('One.')]: [[0, 4, 'gen']],
      deadbeefdeadbeef: [[0, 10, 'fix']],
    })
    expect(model.prov.slice(0, 4)).toEqual(new Array(4).fill('gen'))
    expect(model.prov.slice(6)).toEqual(new Array(body.length - 6).fill('user'))
  })

  it('clamps a run reaching past its paragraph rather than throwing', () => {
    // A `.ink` file edited by hand can say anything, and opening a chapter must not fail.
    const model = modelFromMetadata('One.', { [paragraphHash('One.')]: [[2, 99, 'gen']] })
    expect(model.prov).toEqual(['user', 'user', 'gen', 'gen'])
  })

  it('clamps a negative offset the same way', () => {
    const model = modelFromMetadata('One.', { [paragraphHash('One.')]: [[-5, 2, 'gen']] })
    expect(model.prov).toEqual(['gen', 'gen', 'user', 'user'])
  })

  it('does not let one paragraph\'s run spill into the next', () => {
    const body = 'One.\n\nTwo.\n'
    const model = modelFromMetadata(body, { [paragraphHash('One.')]: [[0, 99, 'gen']] })
    expect(model.prov.slice(0, 4)).toEqual(new Array(4).fill('gen'))
    expect(model.prov.slice(4)).toEqual(new Array(body.length - 4).fill('user'))
  })

  it('reads a kind it does not know as user', () => {
    // The API carries an unknown kind through so `ink reclassify` cannot destroy a newer
    // build's record. Here the kinds are a closed set, so one that is not in it renders
    // as plain prose rather than as something this build cannot draw.
    const model = modelFromMetadata('One.', { [paragraphHash('One.')]: [[0, 4, 'ghost']] })
    expect(model.prov).toEqual(new Array(4).fill('user'))
  })

  it('always leaves one kind per character', () => {
    for (const vector of cases) {
      const model = modelFromMetadata(vector.body, null)
      expect(model.prov).toHaveLength(vector.body.length)
    }
  })
})

// --- a model back to metadata ----------------------------------------------

describe('runsOf', () => {
  it('drops the user stretches', () => {
    expect(runsOf(['user', 'gen', 'gen', 'user'])).toEqual([[1, 3, 'gen']])
    expect(runsOf(['user', 'user'])).toEqual([])
    expect(runsOf([])).toEqual([])
  })

  it('makes one run of neighbouring characters of one kind', () => {
    expect(runsOf(['gen', 'gen', 'fix', 'fix'])).toEqual([
      [0, 2, 'gen'],
      [2, 4, 'fix'],
    ])
  })
})

describe('metadataFromModel', () => {
  it('keys every paragraph, including one with no model-written text', () => {
    // A missing key and an empty list are different things: an empty list says this
    // paragraph is all the writer's, where a missing key says nothing is known and
    // invites the API to recover prose that was never generated.
    const metadata = metadataFromModel(modelFromMetadata('One.\n\nTwo.\n', null))
    expect(Object.keys(metadata)).toEqual([paragraphHash('One.'), paragraphHash('Two.')])
    expect(metadata).toEqual({ [paragraphHash('One.')]: [], [paragraphHash('Two.')]: [] })
  })

  it('writes offsets relative to the paragraph, not to the body', () => {
    const body = `Untouched.\n\n${PARA}\n`
    const metadata = metadataFromModel(modelFromMetadata(body, { [PARA_HASH]: PARA_RUNS }))
    expect(metadata[PARA_HASH]).toEqual(PARA_RUNS)
  })

  it('round-trips a canonical metadata unchanged', () => {
    const body = `${PARA}\n\nUntouched.\n`
    const sent: ProvenanceMetadata = {
      [PARA_HASH]: PARA_RUNS,
      [paragraphHash('Untouched.')]: [],
    }
    expect(metadataFromModel(modelFromMetadata(body, sent))).toEqual(sent)
  })

  it('gives two identical paragraphs one entry', () => {
    const metadata = metadataFromModel(modelFromMetadata('Same.\n\nSame.\n', null))
    expect(Object.keys(metadata)).toEqual([paragraphHash('Same.')])
  })

  it('is empty for a body with no paragraphs', () => {
    expect(metadataFromModel(modelFromMetadata('', null))).toEqual({})
    expect(metadataFromModel(modelFromMetadata('\n\n\n', null))).toEqual({})
  })

  it('refuses a model whose provenance is out of step with its text', () => {
    const broken: Model = { text: 'One.', prov: ['user', 'user'] as Kind[] }
    expect(() => metadataFromModel(broken)).toThrow('out of step')
  })
})

describe('checkModel', () => {
  it('accepts one kind per character and nothing else', () => {
    expect(() => checkModel({ text: '', prov: [] })).not.toThrow()
    expect(() => checkModel({ text: 'ab', prov: ['user', 'gen'] })).not.toThrow()
    expect(() => checkModel({ text: 'ab', prov: ['user'] })).toThrow('out of step')
    expect(() => checkModel({ text: 'a', prov: ['user', 'gen'] })).toThrow('out of step')
  })
})

// --- what one edit did -----------------------------------------------------

describe('diffText', () => {
  it('finds an insertion', () => {
    expect(diffText('abcdef', 'abXYcdef')).toEqual({ start: 2, removedLen: 0, inserted: 'XY' })
  })

  it('finds a deletion', () => {
    expect(diffText('abcdef', 'abef')).toEqual({ start: 2, removedLen: 2, inserted: '' })
  })

  it('finds a replacement', () => {
    expect(diffText('abcdef', 'abXYZef')).toEqual({ start: 2, removedLen: 2, inserted: 'XYZ' })
  })

  it('finds an append', () => {
    expect(diffText('abc', 'abcXY')).toEqual({ start: 3, removedLen: 0, inserted: 'XY' })
  })

  it('finds a prepend', () => {
    expect(diffText('abc', 'XYabc')).toEqual({ start: 0, removedLen: 0, inserted: 'XY' })
  })

  it('handles the text being emptied', () => {
    expect(diffText('abc', '')).toEqual({ start: 0, removedLen: 3, inserted: '' })
  })

  it('handles text appearing from nothing', () => {
    expect(diffText('', 'abc')).toEqual({ start: 0, removedLen: 0, inserted: 'abc' })
  })

  it('reports nothing for no change', () => {
    expect(diffText('abc', 'abc')).toEqual({ start: 3, removedLen: 0, inserted: '' })
  })

  it('does not run the prefix and the suffix into each other', () => {
    // The two scans would otherwise both claim the same characters and report a negative
    // removal: 'aa' -> 'a' has one 'a' matching as a prefix and the same one as a suffix.
    expect(diffText('aa', 'a')).toEqual({ start: 1, removedLen: 1, inserted: '' })
    expect(diffText('a', 'aa')).toEqual({ start: 1, removedLen: 0, inserted: 'a' })
    expect(diffText('aaa', 'aa')).toEqual({ start: 2, removedLen: 1, inserted: '' })
  })

  it('describes the same text whichever reading it picks', () => {
    // The answer is not unique with repeated characters, and does not need to be: applying
    // it has to reproduce `cur`, and that is all.
    for (const [old, cur] of [
      ['aa', 'aaa'],
      ['abab', 'ab'],
      ['One.\n\nOne.', 'One.'],
      ['xxx', 'xyx'],
    ] as const) {
      const { start, removedLen, inserted } = diffText(old, cur)
      expect(old.slice(0, start) + inserted + old.slice(start + removedLen)).toBe(cur)
    }
  })
})

// --- the classification rule -----------------------------------------------

describe('classify', () => {
  // 'abcdef' where [1,4) is generated: index 0 and 4,5 are the writer's.
  const mixed: Kind[] = ['user', 'gen', 'gen', 'gen', 'user', 'user']

  it('gives typing in untagged text to the writer', () => {
    expect(classify(['user', 'user', 'user'], 1, 0)).toBe('user')
  })

  it('gives typing strictly inside a gen run the fix kind', () => {
    expect(classify(mixed, 2, 0)).toBe('fix')
    expect(classify(mixed, 3, 0)).toBe('fix')
  })

  it('gives typing immediately after a gen run to the writer', () => {
    // The trailing-Enter case. Adding a line after a generation is new text, not a
    // correction of what came before it.
    expect(classify(mixed, 4, 0)).toBe('user')
  })

  it('gives typing immediately before a gen run to the writer', () => {
    expect(classify(mixed, 1, 0)).toBe('user')
  })

  it('gives typing at the very end of the document to the writer', () => {
    const allGen: Kind[] = ['gen', 'gen', 'gen']
    expect(classify(allGen, 3, 0)).toBe('user')
  })

  it('gives typing at the very start of the document to the writer', () => {
    const allGen: Kind[] = ['gen', 'gen', 'gen']
    expect(classify(allGen, 0, 0)).toBe('user')
  })

  it('gives replacing the tail of a gen run to the writer', () => {
    // `fix` means an edit within model prose, not wholesale replacement of it.
    expect(classify(mixed, 3, 1)).toBe('user')
  })

  it('gives replacing a whole gen run to the writer', () => {
    expect(classify(mixed, 1, 3)).toBe('user')
  })

  it('gives replacing strictly inside a gen run the fix kind', () => {
    expect(classify(mixed, 2, 1)).toBe('fix')
  })

  it('treats an existing fix as model-written for the purpose of the rule', () => {
    // Which is what lets a correction be corrected again without becoming the writer's.
    const corrected: Kind[] = ['gen', 'fix', 'fix', 'gen']
    expect(classify(corrected, 2, 0)).toBe('fix')
  })

  it('lets declared override the rule entirely', () => {
    expect(classify(['user', 'user'], 1, 0, 'gen')).toBe('gen')
    expect(classify(mixed, 2, 0, 'gen')).toBe('gen')
    expect(classify(mixed, 2, 0, 'user')).toBe('user')
  })
})

// --- applying an edit ------------------------------------------------------

describe('applyEdit', () => {
  const model = (text: string, prov: Kind[]): Model => ({ text, prov })

  it('carries the provenance either side of the edit over untouched', () => {
    const before = model('abcdef', ['user', 'gen', 'gen', 'gen', 'user', 'user'])
    const after = applyEdit(before, 'abXcdef')
    expect(after.text).toBe('abXcdef')
    expect(after.prov).toEqual(['user', 'gen', 'fix', 'gen', 'gen', 'user', 'user'])
  })

  it('marks an insertion after a gen run as written by hand', () => {
    const before = model('abc', ['gen', 'gen', 'gen'])
    expect(applyEdit(before, 'abc\n').prov).toEqual(['gen', 'gen', 'gen', 'user'])
  })

  it('leaves one kind per character after a pure deletion', () => {
    const before = model('abcdef', ['user', 'gen', 'gen', 'gen', 'user', 'user'])
    const after = applyEdit(before, 'abef')
    expect(after.prov).toHaveLength(after.text.length)
    expect(after.prov).toEqual(['user', 'gen', 'user', 'user'])
  })

  it('leaves one kind per character for every shape of edit', () => {
    const before = model('abcdef', ['user', 'gen', 'gen', 'gen', 'user', 'user'])
    for (const cur of ['', 'a', 'abcdef', 'abcdefghij', 'XYZ', 'abXYef', 'aXf']) {
      const after = applyEdit(before, cur)
      expect(after.text).toBe(cur)
      expect(after.prov).toHaveLength(cur.length)
    }
  })

  it('returns the same model when nothing changed', () => {
    const before = model('abc', ['user', 'gen', 'user'])
    expect(applyEdit(before, 'abc')).toBe(before)
  })

  it('marks a declared insertion as generated wherever it lands', () => {
    const before = model('abc', ['user', 'user', 'user'])
    const after = applyEdit(before, 'abcXYZ', 'gen')
    expect(after.prov).toEqual(['user', 'user', 'user', 'gen', 'gen', 'gen'])
  })

  it('refuses a model that is already out of step rather than compounding it', () => {
    expect(() => applyEdit({ text: 'abc', prov: ['user'] }, 'abcd')).toThrow('out of step')
  })

  it('survives a whole typing session with the invariant intact', () => {
    // Character by character, the way the editor will drive it.
    let current = modelFromMetadata('', null)
    for (const char of 'Once, on a cold morning.\n\nShe left.') {
      current = applyEdit(current, current.text + char)
      expect(current.prov).toHaveLength(current.text.length)
    }
    expect(current.text).toBe('Once, on a cold morning.\n\nShe left.')
    expect(new Set(current.prov)).toEqual(new Set(['user']))
  })

  it('round-trips through metadata after an edit', () => {
    // The whole point: an edit, then a save, then a load, and the colours are the same.
    const before = modelFromMetadata(`${PARA}\n`, { [PARA_HASH]: PARA_RUNS })
    const edited = applyEdit(before, `${PARA}\nAnd she left.`)
    const reloaded = modelFromMetadata(edited.text, metadataFromModel(edited))
    expect(reloaded.prov).toEqual(edited.prov)
  })
})
