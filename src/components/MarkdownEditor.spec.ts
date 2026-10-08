/**
 * The editor body as a `contenteditable`.
 *
 * **Nothing here asserts anything about colour.** jsdom has neither `CSS.highlights` nor
 * `Highlight`, so every test in this file runs the unpainted path and none of them can tell
 * whether the painting is right. That is what a hand test in a real browser is for.
 *
 * A test here failing with `CSS is not defined` or `Highlight is not defined` means the
 * feature detection is missing or wrong. That is the bug, not the environment.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MarkdownEditor from './MarkdownEditor.vue'
import { proseFromMetadata, type Kind, type Prose } from '../services/provenance'

/** A file with no provenance recorded, which is what most of these cases open with. */
const plain = (body: string): Prose => proseFromMetadata(body, null)

/**
 * What the browser does when a writer types: it edits the DOM, then tells us.
 *
 * A real edit mutates the existing text node in place, so the caret the browser was
 * already showing survives it, at the end of what was typed. `textContent = text`
 * does not: it replaces the node outright, which the DOM's own range-repair rules
 * then collapse to offset 0 of the element -- nothing like a real edit's caret. The
 * explicit reposition below is what makes the replacement read as one anyway.
 */
const type = (wrapper: ReturnType<typeof mount>, text: string, inputType = 'insertText') => {
  const element = wrapper.find('[contenteditable]').element
  element.textContent = text
  const textNode = element.firstChild
  if (textNode) {
    const range = document.createRange()
    range.setStart(textNode, text.length)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  element.dispatchEvent(new InputEvent('input', { inputType }))
}

/** The prose from the last change the component emitted. */
const emittedProse = (wrapper: ReturnType<typeof mount>, index = 0): Prose =>
  wrapper.emitted('proseChange')![index]![0] as Prose

/**
 * Puts the window selection at character `offset` of `wrapper`'s editor, the way a
 * click or an arrow key would, and fires `selectionchange` the way the browser does.
 *
 * Only correct for text that renders as a single text node under the element, which
 * every case here opens with -- `locate`'s own walk is what `MarkdownEditor` uses to
 * cope with a split one.
 */
const placeCaret = (wrapper: ReturnType<typeof mount>, offset: number) => {
  const element = wrapper.find('[contenteditable]').element
  const range = document.createRange()
  if (element.firstChild) {
    range.setStart(element.firstChild, offset)
  } else {
    range.setStart(element, 0)
  }
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

/**
 * The same, but a real (non-collapsed) selection from `start` to `end` -- only
 * correct for a single text node, the same limitation `placeCaret` documents.
 */
const placeSelection = (wrapper: ReturnType<typeof mount>, start: number, end: number) => {
  const element = wrapper.find('[contenteditable]').element
  const range = document.createRange()
  if (element.firstChild) {
    range.setStart(element.firstChild, start)
    range.setEnd(element.firstChild, end)
  } else {
    range.setStart(element, 0)
  }
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

describe('MarkdownEditor.vue', () => {
  it('is a contenteditable and not a textarea', () => {
    const wrapper = mount(MarkdownEditor, { props: { prose: plain('') } })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('[contenteditable]').exists()).toBe(true)
  })

  it('renders the prose it is given', () => {
    const body = '# Hello World'
    const wrapper = mount(MarkdownEditor, { props: { prose: plain(body) } })
    expect(wrapper.find('[contenteditable]').element.textContent).toBe(body)
  })

  it('emits contentChange on input', () => {
    const wrapper = mount(MarkdownEditor, { props: { prose: plain('') } })
    type(wrapper, 'new content')

    expect(wrapper.emitted()).toHaveProperty('proseChange')
    expect(emittedProse(wrapper).text).toBe('new content')
  })

  it('emits the text as it stands, not the keystroke', () => {
    // The parent owns the text, so what it needs is the whole of it.
    const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once') } })
    type(wrapper, 'Once.')
    type(wrapper, 'Once. Twice.')
    expect(wrapper.emitted('proseChange')!.map(([p]) => (p as Prose).text)).toEqual([
      'Once.',
      'Once. Twice.',
    ])
  })

  it('carries newlines through, since the prose has them', () => {
    const wrapper = mount(MarkdownEditor, { props: { prose: plain('') } })
    type(wrapper, 'One.\n\nTwo.\n', 'insertParagraph')
    expect(emittedProse(wrapper).text).toBe('One.\n\nTwo.\n')
  })

  it('replaces the displayed text when the prose prop changes', async () => {
    const wrapper = mount(MarkdownEditor, { props: { prose: plain('first') } })
    await wrapper.setProps({ prose: plain('second') })
    expect(wrapper.find('[contenteditable]').element.textContent).toBe('second')
  })

  it('does not rewrite the DOM when the prop only echoes what was emitted', async () => {
    // The one case that matters: a parent that stores what it is handed and passes it back
    // would otherwise have every keystroke rewrite the element under the caret, which
    // discards the browser's undo entry for it.
    const wrapper = mount(MarkdownEditor, { props: { prose: plain('') } })
    const element = wrapper.find('[contenteditable]').element
    type(wrapper, 'typed')

    // Exactly what a parent that stores what it is handed passes back. Vue delivers it
    // through a reactive proxy, so this is also what proves the guard does not rely on the
    // object's identity surviving that.
    const spy = vi.spyOn(element, 'textContent', 'set')
    await wrapper.setProps({ prose: emittedProse(wrapper) })
    expect(spy).not.toHaveBeenCalled()
  })

  it('mounts and edits without the highlight API present', () => {
    // jsdom never has it, so this is the path every other test here takes too. Asserted by
    // name anyway, because it is the behaviour a browser without the API also gets.
    expect(typeof CSS).toBe('undefined')
    const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
    expect(() => type(wrapper, 'Once. Twice.')).not.toThrow()
    expect(emittedProse(wrapper).text).toBe('Once. Twice.')
  })

  it('survives being emptied and refilled', () => {
    const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
    expect(() => {
      type(wrapper, '', 'deleteContentBackward')
      type(wrapper, 'A')
    }).not.toThrow()
    expect(wrapper.emitted('proseChange')!.map(([p]) => (p as Prose).text)).toEqual(['', 'A'])
  })

  describe('the placeholder', () => {
    // Driven by the model, not by `:empty`. A browser leaves a stray node behind in an
    // emptied contenteditable, so the selector stops matching while the writer sees
    // nothing -- which is what it did before this was model-driven.
    it('shows when there is no text', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('') } })
      expect(wrapper.find('.placeholder').exists()).toBe(true)
    })

    it('does not show when a file has prose', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
      expect(wrapper.find('.placeholder').exists()).toBe(false)
    })

    it('goes away on the first character and comes back when all of it is deleted', async () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('') } })
      type(wrapper, 'O')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.placeholder').exists()).toBe(false)

      type(wrapper, '', 'deleteContentBackward')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.placeholder').exists()).toBe(true)
    })

    it('is outside the editable element, so it can never become prose', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('') } })
      const editable = wrapper.find('[contenteditable]').element
      expect(editable.textContent).toBe('')
      expect(editable.querySelector('.placeholder')).toBeNull()
    })

    it('comes back when the open file is replaced by an empty one', async () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
      await wrapper.setProps({ prose: plain('') })
      expect(wrapper.find('.placeholder').exists()).toBe(true)
    })
  })

  it('adopts new provenance for the same text without touching the DOM', () => {
    // A repaint is not a rewrite. Painting creates no node, so provenance can change under
    // unchanged text without costing the writer their undo stack.
    const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
    const element = wrapper.find('[contenteditable]').element
    const spy = vi.spyOn(element, 'textContent', 'set')

    const marked: Prose = { text: 'Once.', prov: ['gen', 'gen', 'gen', 'gen', 'gen'] }
    return wrapper.setProps({ prose: marked }).then(() => {
      expect(spy).not.toHaveBeenCalled()
      expect(element.textContent).toBe('Once.')
    })
  })

  describe('shadowing the browser undo', () => {
    // The browser reverts the text itself and reports historyUndo; these stacks exist only
    // to put the provenance back. jsdom can dispatch an InputEvent with any inputType, so
    // all of this is testable here -- what is not is whether the browser's own undo stack
    // survives, which is what the hand test and demo 10 are for.
    const generated = (text: string): Prose => ({
      text,
      prov: new Array<Kind>(text.length).fill('gen'),
    })

    /** Deleting inside a generated run, which is what makes the two paths tell apart. */
    const deleteInside = (wrapper: ReturnType<typeof mount>) =>
      type(wrapper, 'ad', 'deleteContentBackward')

    it('restores the provenance a snapshot holds, rather than diffing back to it', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: generated('abcd') } })
      deleteInside(wrapper)
      expect(emittedProse(wrapper, 0).prov).toEqual(['gen', 'gen'])

      type(wrapper, 'abcd', 'historyUndo')

      // Restored. Diffing forward would read the reinstated characters as an insertion
      // strictly inside generated text and call them a correction -- gen, fix, fix, gen.
      expect(emittedProse(wrapper, 1).prov).toEqual(['gen', 'gen', 'gen', 'gen'])
    })

    it('redoes back to the state the undo left', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: generated('abcd') } })
      deleteInside(wrapper)
      type(wrapper, 'abcd', 'historyUndo')
      type(wrapper, 'ad', 'historyRedo')

      expect(emittedProse(wrapper, 2).text).toBe('ad')
      expect(emittedProse(wrapper, 2).prov).toEqual(['gen', 'gen'])
    })

    it('undoes and redoes repeatedly without drifting', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: generated('abcd') } })
      deleteInside(wrapper)
      for (let round = 0; round < 3; round += 1) {
        type(wrapper, 'abcd', 'historyUndo')
        type(wrapper, 'ad', 'historyRedo')
      }
      const last = emittedProse(wrapper, wrapper.emitted('proseChange')!.length - 1)
      expect(last.text).toBe('ad')
      expect(last.prov).toEqual(['gen', 'gen'])
    })

    it('diffs forward when no snapshot matches, keeping the invariant', () => {
      // A state older than the ceiling, or one the browser coalesced in a way nothing was
      // recorded for. Approximate by nature and accepted: it can attribute a character to
      // the wrong writer, never be wrong about the text.
      const wrapper = mount(MarkdownEditor, { props: { prose: generated('abcd') } })
      type(wrapper, 'abXd', 'historyUndo')

      const answered = emittedProse(wrapper, 0)
      expect(answered.text).toBe('abXd')
      expect(answered.prov).toHaveLength(4)
    })

    it('drops the redo branch as soon as anything new is typed', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: generated('abcd') } })
      deleteInside(wrapper)
      type(wrapper, 'abcd', 'historyUndo')
      type(wrapper, 'abcdX')

      // Nothing to redo to any more, so this falls through to the diff rather than
      // reinstating the state the undo came from. `['gen', 'user']` is what diffing
      // 'abcdX' down to 'ad' gives; the snapshot would have said `['gen', 'gen']`, and
      // getting that here would mean a dropped branch had been matched against.
      type(wrapper, 'ad', 'historyRedo')
      const last = emittedProse(wrapper, 3)
      expect(last.text).toBe('ad')
      expect(last.prov).toEqual(['gen', 'user'])
    })

    it('forgets the history of a file that is no longer open', async () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: generated('abcd') } })
      deleteInside(wrapper)
      await wrapper.setProps({ prose: plain('Another chapter.') })

      // The old file's states are gone, so this cannot match one -- which is right: the
      // browser's own undo stack did not survive the textContent write either.
      type(wrapper, 'abcd', 'historyUndo')
      expect(emittedProse(wrapper, 1).prov).toEqual(new Array(4).fill('user'))
    })

    it('does not intercept any key', () => {
      // No preventDefault, no keydown handler: the browser is left to do the undoing. A
      // handler here is what would have to be kept in step with every shortcut on every
      // platform.
      const element = mount(MarkdownEditor, { props: { prose: plain('a') } })
        .find('[contenteditable]')
      expect(element.attributes('onkeydown')).toBeUndefined()
      const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true })
      element.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    })
  })

  describe('the selection', () => {
    // Selection only behaves like a browser's in jsdom once the element is actually
    // in the document -- a mount left detached (the default) answers an empty
    // selection for everything, so these all mount with `attachTo`.

    it('is null before any selection has ever landed here', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('hello world') },
        attachTo: document.body,
      })
      expect(wrapper.vm.getSelectionOffsets()).toBeNull()
      wrapper.unmount()
    })

    it('tracks a caret to a collapsed start/end pair', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('hello world') },
        attachTo: document.body,
      })
      placeCaret(wrapper, 5)
      expect(wrapper.vm.getSelectionOffsets()).toEqual({ start: 5, end: 5 })
      wrapper.unmount()
    })

    it('tracks a real selection to its own start and end', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('hello world') },
        attachTo: document.body,
      })
      placeSelection(wrapper, 2, 8)
      expect(wrapper.vm.getSelectionOffsets()).toEqual({ start: 2, end: 8 })
      wrapper.unmount()
    })

    it('emits selectionChange(true) when a selection becomes live, and (false) when it collapses', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('hello world') },
        attachTo: document.body,
      })
      placeSelection(wrapper, 2, 8)
      placeCaret(wrapper, 5)

      expect(wrapper.emitted('selectionChange')).toEqual([[true], [false]])
      wrapper.unmount()
    })

    it('does not re-emit selectionChange while the selection stays (non-)collapsed', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('hello world') },
        attachTo: document.body,
      })
      placeCaret(wrapper, 3)
      placeCaret(wrapper, 5) // still collapsed -- a different caret, not a selection
      expect(wrapper.emitted('selectionChange')).toBeUndefined()
      wrapper.unmount()
    })

    it('survives the selection moving elsewhere, rather than resetting to null', () => {
      // Clicking the Generate button moves focus out of the editor; the selection
      // reported for the generation that follows has to be the one from before that.
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('hello world') },
        attachTo: document.body,
      })
      placeCaret(wrapper, 5)

      const outside = document.createElement('input')
      document.body.appendChild(outside)
      outside.focus()
      document.dispatchEvent(new Event('selectionchange'))

      expect(wrapper.vm.getSelectionOffsets()).toEqual({ start: 5, end: 5 })
      outside.remove()
      wrapper.unmount()
    })

    it('updates after typing, to just past what was typed', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('Once.') },
        attachTo: document.body,
      })
      placeCaret(wrapper, 5)
      type(wrapper, 'Once. Twice.')
      expect(wrapper.vm.getSelectionOffsets()).toEqual({
        start: 'Once. Twice.'.length,
        end: 'Once. Twice.'.length,
      })
      wrapper.unmount()
    })

    it('resets to null when a different file opens', async () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('hello world') },
        attachTo: document.body,
      })
      placeCaret(wrapper, 5)
      expect(wrapper.vm.getSelectionOffsets()).toEqual({ start: 5, end: 5 })

      await wrapper.setProps({ prose: plain('a different file') })
      expect(wrapper.vm.getSelectionOffsets()).toBeNull()
      wrapper.unmount()
    })

    it('emits selectionChange(false) when a live selection is closed by opening a different file', async () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('hello world') },
        attachTo: document.body,
      })
      placeSelection(wrapper, 2, 8)

      await wrapper.setProps({ prose: plain('a different file') })
      expect(wrapper.emitted('selectionChange')).toEqual([[true], [false]])
      wrapper.unmount()
    })
  })

  describe('a generated continuation', () => {
    // `document.execCommand` is absent in jsdom, so these exercise the written-directly
    // fallback. What cannot be checked here is the thing the command exists for -- that the
    // insertion lands on the browser's own undo stack -- which is the hand test.
    it('is absent from this environment, which is why there is a fallback', () => {
      expect(typeof document.execCommand).not.toBe('function')
    })

    it('marks what it appends as written by a model', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
      wrapper.vm.appendGenerated(' Twice.')

      const answered = emittedProse(wrapper)
      expect(answered.text).toBe('Once. Twice.')
      expect(answered.prov.slice(0, 5)).toEqual(new Array(5).fill('user'))
      expect(answered.prov.slice(5)).toEqual(new Array(7).fill('gen'))
    })

    it('marks every chunk of a stream, not only the first', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
      for (const delta of [' and', ' then', ' this.']) {
        wrapper.vm.appendGenerated(delta)
      }

      const answered = emittedProse(wrapper, 2)
      expect(answered.text).toBe('Once. and then this.')
      expect(answered.prov.slice(5)).toEqual(new Array(15).fill('gen'))
    })

    it('does not let the declared kind leak into what the writer types next', () => {
      // `pending` is cleared whatever happens, so the keystroke after a continuation is the
      // writer's. Typing at the end of a generated run is theirs by the rule anyway, which
      // is why this asserts on a leak rather than on the rule.
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
      wrapper.vm.appendGenerated(' Twice.')
      type(wrapper, 'Once. Twice. Thrice.')

      const answered = emittedProse(wrapper, 1)
      expect(answered.prov.slice(12)).toEqual(new Array(8).fill('user'))
    })

    it('can be undone like anything typed', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
      wrapper.vm.appendGenerated(' Twice.')
      type(wrapper, 'Once.', 'historyUndo')

      const answered = emittedProse(wrapper, 1)
      expect(answered.text).toBe('Once.')
      expect(answered.prov).toEqual(new Array(5).fill('user'))
    })

    it('ignores an empty chunk rather than recording a state for it', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
      wrapper.vm.appendGenerated('')
      expect(wrapper.emitted('proseChange')).toBeUndefined()
    })

    it('inserts at the caret rather than always at the end', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('One. Three.') },
        attachTo: document.body,
      })
      placeCaret(wrapper, 'One.'.length)
      wrapper.vm.appendGenerated(' Two.')

      const answered = emittedProse(wrapper)
      expect(answered.text).toBe('One. Two. Three.')
      wrapper.unmount()
    })

    it('marks only the inserted span as generated, wherever it landed', () => {
      // No character of the insertion shares a position with a character already
      // adjacent to it, so the diff has only one place it could possibly read this as
      // an insertion -- unlike " Two." next to "Three.", which also shares a "T".
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('XXXX.ZZZZ.') },
        attachTo: document.body,
      })
      placeCaret(wrapper, 'XXXX.'.length)
      wrapper.vm.appendGenerated(' YYYY.')

      const answered = emittedProse(wrapper)
      // "XXXX." is the writer's, " YYYY." is the model's, "ZZZZ." is the writer's.
      expect(answered.text).toBe('XXXX. YYYY.ZZZZ.')
      expect(answered.prov.slice(0, 5)).toEqual(new Array(5).fill('user'))
      expect(answered.prov.slice(5, 11)).toEqual(new Array(6).fill('gen'))
      expect(answered.prov.slice(11)).toEqual(new Array(5).fill('user'))
      wrapper.unmount()
    })

    it('falls back to the end with no selection recorded, as a direct append did', () => {
      const wrapper = mount(MarkdownEditor, { props: { prose: plain('Once.') } })
      wrapper.vm.appendGenerated(' Twice.')
      expect(emittedProse(wrapper).text).toBe('Once. Twice.')
    })

    it('continues a later chunk from where the previous one finished', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('One. Three.') },
        attachTo: document.body,
      })
      placeCaret(wrapper, 'One.'.length)
      wrapper.vm.appendGenerated(' Two')
      wrapper.vm.appendGenerated('.')

      const answered = emittedProse(wrapper, 1)
      expect(answered.text).toBe('One. Two. Three.')
      wrapper.unmount()
    })

    it('replaces a live selection rather than inserting beside it', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('XXXX.ZZZZ.ZZZZ.') },
        attachTo: document.body,
      })
      // Selects "ZZZZ." (the first one) and rewrites it.
      placeSelection(wrapper, 'XXXX.'.length, 'XXXX.ZZZZ.'.length)
      wrapper.vm.appendGenerated(' YYYY.')

      const answered = emittedProse(wrapper)
      expect(answered.text).toBe('XXXX. YYYY.ZZZZ.')
      wrapper.unmount()
    })

    it('marks only the replacement as generated, not what was kept either side', () => {
      // No character at either boundary of the replaced span is shared with its
      // replacement, so the diff has only one place it could read this as a
      // replacement -- the same reasoning the caret-insertion test above gives for
      // its own choice of letters.
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('AAAABBBBCCCC') },
        attachTo: document.body,
      })
      placeSelection(wrapper, 'AAAA'.length, 'AAAABBBB'.length)
      wrapper.vm.appendGenerated(' DDDD ')

      const answered = emittedProse(wrapper)
      expect(answered.text).toBe('AAAA DDDD CCCC')
      expect(answered.prov.slice(0, 4)).toEqual(new Array(4).fill('user')) // "AAAA"
      expect(answered.prov.slice(4, 10)).toEqual(new Array(6).fill('gen')) // " DDDD "
      expect(answered.prov.slice(10)).toEqual(new Array(4).fill('user')) // "CCCC"
      wrapper.unmount()
    })

    it('leaves the caret collapsed after replacing a selection, for a later chunk to continue from', () => {
      const wrapper = mount(MarkdownEditor, {
        props: { prose: plain('XXXX.ZZZZ.') },
        attachTo: document.body,
      })
      placeSelection(wrapper, 'XXXX.'.length, 'XXXX.ZZZZ.'.length)
      wrapper.vm.appendGenerated(' YYYY')
      wrapper.vm.appendGenerated('.')

      const answered = emittedProse(wrapper, 1)
      expect(answered.text).toBe('XXXX. YYYY.')
      wrapper.unmount()
    })
  })

  describe('reroll (api#5)', () => {
    /** A gen run in the middle, surrounded by the writer's own text either side. */
    const withGenRun = (): Prose => ({
      text: 'AAAABBBBCCCC',
      prov: [
        ...new Array<Kind>(4).fill('user'),
        ...new Array<Kind>(4).fill('gen'),
        ...new Array<Kind>(4).fill('user'),
      ],
    })

    describe('rerollTarget', () => {
      it('finds the gen run the caret sits inside', () => {
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        placeCaret(wrapper, 6)
        expect(wrapper.vm.rerollTarget()).toEqual({ start: 4, end: 8 })
        wrapper.unmount()
      })

      it('finds it from either boundary too, not only strictly inside', () => {
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        placeCaret(wrapper, 4)
        expect(wrapper.vm.rerollTarget()).toEqual({ start: 4, end: 8 })
        placeCaret(wrapper, 8)
        expect(wrapper.vm.rerollTarget()).toEqual({ start: 4, end: 8 })
        wrapper.unmount()
      })

      it('answers null for a live selection, even one entirely inside the run', () => {
        // A real selection already means Rewrite, which the primary button offers --
        // offering both at once would be two buttons for one intent.
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        placeSelection(wrapper, 5, 7)
        expect(wrapper.vm.rerollTarget()).toBeNull()
        wrapper.unmount()
      })

      it('answers null in text the writer typed', () => {
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        placeCaret(wrapper, 2)
        expect(wrapper.vm.rerollTarget()).toBeNull()
        wrapper.unmount()
      })

      it('answers null before any selection has ever landed here', () => {
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        expect(wrapper.vm.rerollTarget()).toBeNull()
        wrapper.unmount()
      })
    })

    describe('rerollableChange', () => {
      it('fires true when the caret lands in a gen run, false when it leaves', () => {
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        placeCaret(wrapper, 6)
        placeCaret(wrapper, 2)
        expect(wrapper.emitted('rerollableChange')).toEqual([[true], [false]])
        wrapper.unmount()
      })

      it('does not re-emit while the caret stays inside the same run', () => {
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        placeCaret(wrapper, 5)
        placeCaret(wrapper, 7)
        expect(wrapper.emitted('rerollableChange')).toEqual([[true]])
        wrapper.unmount()
      })

      it('does not fire for a live selection landing inside the run', () => {
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        placeSelection(wrapper, 5, 7)
        expect(wrapper.emitted('rerollableChange')).toBeUndefined()
        wrapper.unmount()
      })

      it('resets to false when a different file opens', async () => {
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        placeCaret(wrapper, 6)
        await wrapper.setProps({ prose: plain('a different file') })
        expect(wrapper.emitted('rerollableChange')).toEqual([[true], [false]])
        wrapper.unmount()
      })
    })

    describe('removeRange', () => {
      // Same environment gap as appendGenerated's: no execCommand in jsdom, so these
      // exercise the written-directly fallback. Whether the deletion lands on the
      // browser's own undo stack is the hand test.
      it('is absent from this environment too, which is why there is a fallback', () => {
        expect(typeof document.execCommand).not.toBe('function')
      })

      it('deletes the span and leaves the surrounding provenance intact', () => {
        const wrapper = mount(MarkdownEditor, { props: { prose: withGenRun() } })
        wrapper.vm.removeRange(4, 8)

        const answered = emittedProse(wrapper)
        expect(answered.text).toBe('AAAACCCC')
        expect(answered.prov).toEqual(new Array(8).fill('user'))
      })

      it('leaves the caret collapsed at the start of the deleted span', () => {
        const wrapper = mount(MarkdownEditor, {
          props: { prose: withGenRun() },
          attachTo: document.body,
        })
        wrapper.vm.removeRange(4, 8)
        expect(wrapper.vm.getSelectionOffsets()).toEqual({ start: 4, end: 4 })
        wrapper.unmount()
      })

      it('does nothing for a collapsed range', () => {
        const wrapper = mount(MarkdownEditor, { props: { prose: withGenRun() } })
        wrapper.vm.removeRange(4, 4)
        expect(wrapper.emitted('proseChange')).toBeUndefined()
      })
    })
  })
})
