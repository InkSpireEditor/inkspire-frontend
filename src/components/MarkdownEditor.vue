<script setup lang="ts">
/**
 * The editor body: a `contenteditable` div that colours text by who wrote it.
 *
 * Deliberately uncontrolled beyond the initial value, exactly as the textarea it replaces
 * was: it emits every change and the parent stores it, so typing is never interrupted by a
 * re-render.
 *
 * **This component owns the provenance.** It is the only place that can: a correction is
 * decided from the characters either side of an edit, which only the `input` handler sees;
 * an undo has to put an older provenance back, which only a snapshot taken here can do; and
 * a generated insertion is known to be generated only at the moment it is inserted. A parent
 * handed nothing but the text could not work any of that out, so it is handed the prose
 * instead and stores it.
 *
 * **Nothing here writes to the element's DOM while the writer is editing**, and that is the
 * whole design rather than an optimisation. Colour is drawn with the CSS Custom Highlight
 * API, which creates no node: a `Highlight` holds `Range` objects and `::highlight()` paints
 * them. Wrapping characters in coloured spans was measured instead and does not work — the
 * one region a re-wrap ever touches is the text just typed, and re-wrapping it discards the
 * browser's undo entry for it. Highlights cost nothing, so Ctrl+Z keeps working.
 *
 * Provenance is held as one kind per character in a plain array, not in the ranges. A live
 * `Range` survives text being typed into it but is destroyed by any edit to the paragraph
 * structure — pressing Enter inside a coloured run, or merging two paragraphs with backspace
 * — which was measured too. So the array is the store and the ranges are only a render
 * target, rebuilt from it after every edit.
 *
 * All of it was measured by hand in two browsers before any of this was written, because none
 * of it is reproducible by reading: a `Range` looks like the obvious place to keep provenance
 * right up until a paragraph break destroys one.
 */
import { onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import {
  applyEdit,
  dropFrom,
  findSnapshot,
  genRunAt,
  pushSnapshot,
  runsOf,
  type Kind,
  type Prose,
  type Snapshots,
} from '../services/provenance'

/**
 * The prose to show, text and provenance together.
 *
 * One prop rather than a string and a provenance map side by side: they are one value, and
 * two props that have to change together is two chances to change only one of them.
 */
const props = defineProps<{
  prose: Prose
}>()

/**
 * Every change, as the whole prose.
 *
 * **This component is the only owner of provenance**, so it is the only thing that may
 * compute it, and the parent's job is to store what it is handed. Emitting just the text
 * would force the parent to derive provenance a second time, from a string that cannot say
 * whether an insertion was generated or whether an undo put an older state back — and a
 * second derivation is a second answer.
 */
const emit = defineEmits<{
  proseChange: [Prose]
  /** Whether a non-collapsed selection is now live in this editor. Fired only when
   *  the answer changes, not on every `selectionchange` -- the one piece of
   *  selection state a sibling needs (`Text.vue`'s Rewrite-vs-Generate label,
   *  frontend#25), without handing out the offsets themselves for something this
   *  cheap. */
  selectionChange: [boolean]
  /** Whether `rerollTarget()` would answer a span right now. Fired only when the
   *  answer changes, mirroring `selectionChange`'s own contract -- the one piece of
   *  state `Text.vue`'s Reroll **and Discard** buttons need (api#5, frontend#33),
   *  without exposing the run itself for something this cheap. */
  rerollableChange: [boolean]
  /** Whether a completion proposal is showing right now (frontend#9). Fired only
   *  when the answer changes, mirroring the two contracts above. */
  proposalChange: [boolean]
}>()

const editor = ref<HTMLDivElement | null>(null)

/**
 * Whether to draw the placeholder, decided by the prose rather than by the element.
 *
 * `:empty` cannot answer this. A browser leaves a stray node behind in an emptied
 * `contenteditable`, so the selector stops matching while the writer sees nothing — which is
 * what it did. The prose is the only thing that knows the text is empty, so it is what says
 * so, and the placeholder is a sibling element: drawn over the editable one, never inside it,
 * because anything inside would become part of the prose.
 *
 * Initialised from the prop rather than defaulted to `true` and corrected on mount, or the
 * first paint of an existing chapter draws the placeholder over its prose for one frame.
 */
const empty = ref(props.prose.text.length === 0)

/**
 * The prose as this component has it.
 *
 * Plain, not a `ref`: nothing in the template reads it, and making it reactive would invite
 * a re-render on every keystroke — which is the one thing this component must never do.
 */
let prose: Prose = props.prose

/**
 * Provenance for states the browser can undo and redo back to.
 *
 * **The browser keeps owning undo.** It reverts the text itself and reports `historyUndo` or
 * `historyRedo` on the `input` event; nothing here intercepts a key, calls `preventDefault`
 * or maintains a command log. These two stacks hold only the thing the browser cannot know:
 * which characters were whose at each of those states.
 */
let undoStack: Snapshots = []
let redoStack: Snapshots = []

/**
 * The selection's character offsets into `prose.text`, the last time it was inside
 * this editor -- `null` before any selection has ever landed here. A caret is the
 * degenerate case, `start === end`.
 *
 * **Tracked rather than read on demand.** Clicking the Generate button moves focus
 * out of the `contenteditable` before this component hears about it, so reading
 * `window.getSelection()` at that point would answer for whatever has focus by then,
 * not for where the writer last left it. Updated on every `input` and on
 * `selectionchange` while the selection is inside this element; left alone the rest
 * of the time, so focus moving elsewhere does not erase it.
 */
let lastSelection: { start: number; end: number } | null = null

/** Whether a non-collapsed selection was live last time `lastSelection` changed --
 *  what `selectionChange` compares against, so it fires only on an actual change
 *  rather than on every `selectionchange` event. */
let selectionWasLive = false

/** Whether `rerollTarget()` answered non-null last time it was checked -- what
 *  `rerollableChange` compares against, for the same reason `selectionWasLive`
 *  exists. */
let rerollWasPossible = false

/** Whether a completion proposal was showing last time it changed -- what
 *  `proposalChange` compares against, mirroring `selectionWasLive`/
 *  `rerollWasPossible`'s own contract (frontend#9). */
let proposalWasShown = false

/**
 * The completion proposal showing right now, or `''` for none (frontend#9).
 *
 * A `ref`, unlike `prose` -- it changes only when a proposal appears or is
 * resolved, never on a keystroke, so making it reactive costs nothing of what
 * keeping `prose` plain protects.
 */
const proposal = ref('')

/**
 * Where the proposal's own span is drawn, in pixels relative to `.surface`'s
 * own box -- `positionGhost()` is the only writer. Measured directly from the
 * caret's real on-screen position (`measureCaretRect`) rather than mirroring
 * the whole document in flow to push the span into place: a mirror can only
 * ever reproduce what `prose.text` says, and the real surface can differ from
 * that in ways with no textual representation at all -- a blank line's own
 * `<br>` is one (§8.4's `offsetOf` fix), and deleting a character or a line
 * can create or remove one of these without the mirror ever finding out,
 * which is what put the ghost above or left of the caret rather than on it.
 */
const ghostTop = ref(0)
/**
 * The proposal's own box spans the full width between `.surface`'s own left
 * and right padding -- the same width a real paragraph wraps within -- rather
 * than starting at the caret's own column. `ghostLeft`/`ghostWidth` place
 * that box; `ghostIndent`, a `text-indent`, is what actually pushes the
 * *first* line over to the caret. `text-indent` only ever indents a block's
 * first line, wrapped or not, so a second line this produces returns to the
 * paragraph's own margin on its own -- exactly what a caret mid-line needs,
 * and what positioning the whole span at the caret's column could not give:
 * that put every wrapped line under the caret's own column instead.
 */
const ghostLeft = ref(0)
const ghostWidth = ref(0)
const ghostIndent = ref(0)

/**
 * The kind to give the next insertion, where it is not the writer's own.
 *
 * Set around `appendGenerated`'s insertion and read by the `input` handler, because the
 * insertion goes through the browser's own editing command and so comes back as an ordinary
 * `input` event. There is nothing in that event to say a model wrote it — the only moment
 * that is known is the moment it is inserted, which is why this exists at all.
 */
let pending: Kind | undefined

/**
 * Whether this browser can paint highlights at all.
 *
 * Checked rather than assumed, because jsdom has neither `CSS.highlights` nor `Highlight`
 * (§8.3), so every automated test runs the unpainted path. That is also honest degradation:
 * a browser without the API shows uncoloured prose and stays completely usable.
 */
const canPaint =
  typeof CSS !== 'undefined' &&
  CSS.highlights !== undefined &&
  typeof Highlight !== 'undefined'

/**
 * Registry names. `CSS.highlights` is a global registry shared by the whole page, so these
 * are prefixed rather than named `gen` and `fix`.
 */
const GEN = 'ink-gen'
const FIX = 'ink-fix'

/**
 * An offset into the text as a position in the DOM, whatever node structure editing left
 * behind.
 *
 * A `contenteditable` is free to split its text across several nodes, and does: typing,
 * pasting and pressing Enter each restructure it differently. Walking the text nodes and
 * counting is what makes a character offset meaningful without caring how.
 */
function locate(target: number): { node: Node; offset: number } | null {
  const root = editor.value
  if (root === null) {
    return null
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let position = 0
  let node = walker.nextNode()
  while (node !== null) {
    const length = node.textContent?.length ?? 0
    if (position + length >= target) {
      return { node, offset: target - position }
    }
    position += length
    node = walker.nextNode()
  }
  return null
}

/**
 * A node/offset pair from `window.getSelection()`, as a character offset into the
 * whole text -- `null` if `container` is not inside `root` at all.
 *
 * **Not a `TreeWalker` over `SHOW_TEXT`, unlike `locate` (its nominal inverse).**
 * A text node is where the caret sits most of the time, but not always: a trailing
 * blank line has nothing to put a caret "inside", so the browser gives it a `<br>`
 * instead -- even in `plaintext-only` mode, which governs what typing and pasting
 * produce, not how an otherwise-empty line is made clickable. The caret then
 * anchors on `root` itself, at a child offset pointing past that `<br>`, which a
 * `SHOW_TEXT`-only walk never matches -- it was previously read as "the editor is
 * empty" (the one case a root-anchored caret was built for) and answered `0`
 * regardless of how much text came before it, which silently read a caret on a
 * trailing blank line as being at the very start of the file (found investigating
 * why a completion proposal, frontend#9, would never fire there).
 *
 * `Range.toString()` answers both cases correctly and every ordinary one in
 * between, because it serialises exactly what lies between two boundary points --
 * a `<br>` contributes nothing to it, the same way it contributes nothing to
 * `textContent` -- without this function needing to know anything about how the
 * node structure got that way.
 */
function offsetOf(root: HTMLElement, container: Node, containerOffset: number): number | null {
  if (!root.contains(container)) {
    return null
  }
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(container, containerOffset)
  return range.toString().length
}

/**
 * The current selection's start and end as character offsets into the whole text,
 * or `null` where the selection is not inside this editor at all.
 *
 * Reads `window.getSelection()` directly, so this answers for right now;
 * `lastSelection` is what remembers it past the point focus moves away.
 */
function selectionOffsets(): { start: number; end: number } | null {
  const root = editor.value
  const selection = window.getSelection()
  if (root === null || selection === null || selection.rangeCount === 0) {
    return null
  }
  const range = selection.getRangeAt(0)
  const start = offsetOf(root, range.startContainer, range.startOffset)
  const end = offsetOf(root, range.endContainer, range.endOffset)
  return start === null || end === null ? null : { start, end }
}

/** Records `start`/`end` as `lastSelection`, emitting `selectionChange` when
 *  whether it is collapsed has changed since the last call -- the one place that
 *  writes `lastSelection`, so the emit can never be forgotten at a call site. */
function setLastSelection(start: number, end: number): void {
  lastSelection = { start, end }
  const live = start !== end
  if (live !== selectionWasLive) {
    selectionWasLive = live
    emit('selectionChange', live)
  }
  updateRerollability()
}

/** Updates `lastSelection` from the live selection, leaving it alone where the
 *  selection is not inside this editor right now. Also dismisses a showing
 *  proposal once the caret no longer sits at the very end of the text (frontend#9)
 *  -- a proposal only ever applies there, so moving away from it makes the ghost
 *  stale rather than merely unaccepted. */
function updateLastSelection(): void {
  const offsets = selectionOffsets()
  if (offsets !== null) {
    setLastSelection(offsets.start, offsets.end)
  }
  if (proposal.value !== '' && !isCaretAtEnd()) {
    clearProposal()
  }
}

/**
 * Whether `lastSelection` is a caret collapsed at the very end of the text --
 * the one position a completion proposal (frontend#9) may be shown at.
 *
 * Not a strict `=== prose.text.length`: a single trailing newline is not its
 * own reachable caret position in most browsers, so the caret at the visual
 * end of a file ending in one lands right *before* it, one short of the
 * text's own length, not after it. Nothing meaningful follows either
 * position, so both count -- found from a real chapter ending in exactly one
 * `\n`, where the strict check rejected the caret every single time.
 */
function isCaretAtEnd(): boolean {
  return (
    lastSelection !== null &&
    lastSelection.start === lastSelection.end &&
    /^\n*$/.test(prose.text.slice(lastSelection.end))
  )
}

/**
 * Draws the prose: one `Range` per non-`user` run, handed to the two registries.
 *
 * Writes no DOM. `document.createRange` and `CSS.highlights.set` both mutate nothing, which
 * is why this can run after every keystroke without touching undo.
 */
function paint(): void {
  if (!canPaint) {
    return
  }
  const gen = new Highlight()
  const fix = new Highlight()
  for (const [start, end, kind] of runsOf(prose.prov)) {
    const from = locate(start)
    const to = locate(end)
    if (from === null || to === null) {
      continue
    }
    const range = document.createRange()
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
    ;(kind === 'gen' ? gen : fix).add(range)
  }
  // A correction sits inside generated text, so where the two overlap the correction is the
  // one worth seeing.
  fix.priority = 1
  CSS.highlights.set(GEN, gen)
  CSS.highlights.set(FIX, fix)
}

/**
 * Puts provenance back to the state the browser just restored.
 *
 * Where no snapshot matches — the state is older than the ceiling, or the browser coalesced
 * steps in a way nothing was recorded for — the provenance is diffed forward to the restored
 * text instead. That is approximate by nature and accepted: it can attribute a character to
 * the wrong writer, but it can never be wrong about the text, and the invariant holds either
 * way.
 */
function rewind(current: string, undoing: boolean): void {
  const take = undoing ? undoStack : redoStack
  const give = undoing ? redoStack : undoStack

  const at = findSnapshot(take, current)
  const restored = at >= 0 ? take[at] : undefined
  const nextTake = dropFrom(take, at)
  const nextGive = pushSnapshot(give, prose)

  prose = restored ?? applyEdit(prose, current)
  if (undoing) {
    undoStack = nextTake
    redoStack = nextGive
  } else {
    redoStack = nextTake
    undoStack = nextGive
  }
}

/**
 * The writer typed, pasted, deleted, or undid something.
 *
 * **Snapshots are pushed here, on `input`, and not on `beforeinput`.**
 * `document.execCommand` — which is how a generated continuation is inserted — fires `input`
 * but *not* `beforeinput`, so pushing there misses every programmatic insertion and leaves
 * the stack describing states that never existed.
 *
 * Enter is not intercepted, and neither is anything else. With provenance held per character
 * in an array, a newline is just another character.
 */
function handleInput(event: Event): void {
  const current = editor.value?.textContent ?? ''
  const inputType = (event as InputEvent).inputType

  if (inputType === 'historyUndo' || inputType === 'historyRedo') {
    rewind(current, inputType === 'historyUndo')
  } else {
    recordEdit(current, pending)
  }
  settle()
  // After an `execCommand`-driven insertion as much as after a keystroke: the
  // browser has already moved the caret to just past whatever landed, which is
  // exactly where the next streamed chunk should continue from.
  updateLastSelection()
}

/** One new state: the one before it becomes a snapshot, and the redo branch is gone. */
function recordEdit(current: string, declared?: Kind): void {
  undoStack = pushSnapshot(undoStack, prose)
  // Anything new makes the redo branch unreachable, exactly as the browser's own stack
  // does — so it is dropped rather than left to be matched against later.
  redoStack = []
  prose = applyEdit(prose, current, declared)
}

/** What every change ends with, however it arrived. */
function settle(): void {
  empty.value = prose.text.length === 0
  paint()
  emit('proseChange', prose)
  // Belt and suspenders alongside `setLastSelection`'s own call: an edit can change
  // which run the caret sits in (typing inside a `gen` run turns part of it `fix`)
  // even on the rare path where `handleInput`'s own `updateLastSelection` finds the
  // selection outside this element and so never calls it.
  updateRerollability()
}

/**
 * Selects the span from character `start` to character `end` of the prose -- a
 * caret, with `start === end`; the end of the element, with no narrower target,
 * which is also what either offset past the end of the text collapses to.
 *
 * Positioning before a generated insertion lands it where the writer's caret or
 * selection was (api#14's caret-anchored prompt, api#20's rewrite of a selection),
 * rather than always at the end the way a direct append did before there was
 * anything to ask the server about.
 */
function selectRange(element: HTMLElement, start: number, end: number): boolean {
  const selection = window.getSelection()
  if (selection === null) {
    return false
  }
  const range = document.createRange()
  const from = locate(start)
  if (from === null) {
    range.selectNodeContents(element)
    range.collapse(false)
  } else {
    range.setStart(from.node, from.offset)
    const to = start === end ? null : locate(end)
    if (to === null) {
      range.collapse(true)
    } else {
      range.setEnd(to.node, to.offset)
    }
  }
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

/**
 * Inserts `delta` at the caret, or in place of the selection, as text a model wrote.
 *
 * **At the caret or over the selection, not always at the end**: the first chunk of
 * a generation is positioned with `selectRange`, using `lastSelection` -- no
 * selection recorded yet means the end, which is both the fallback and the common
 * case (api#14, api#21, api#20, frontend#25). `execCommand('insertText')` replaces a
 * non-collapsed selection natively, so a rewrite's first chunk overwrites what was
 * selected the same way typing over a selection would. Every chunk after the first
 * continues from wherever the previous one left the caret, which `execCommand`
 * already does on its own; nothing here repositions between chunks.
 *
 * **Inserted through `document.execCommand('insertText')`, not by writing the DOM**, so it
 * lands on the browser's own undo stack and can be undone like anything the writer typed.
 * Only its provenance is ours to declare, and `pending` is how that reaches the `input`
 * handler the command itself triggers.
 *
 * One call per streamed chunk, so one undo step per chunk: undoing a long continuation takes
 * several presses. Accepted, because the alternative is to buffer the whole generation and
 * show the writer nothing until it ends, which is the feature.
 *
 * Where `execCommand` is missing — jsdom, and any browser that has dropped it — the text is
 * spliced into `prose.text` between the same two offsets directly instead. That costs the
 * browser's undo entry for this insertion alone; everything else keeps working, which is the
 * point of not making it a hard requirement.
 */
function appendGenerated(delta: string): void {
  const element = editor.value
  if (element === null || delta === '') {
    return
  }

  const length = prose.text.length
  const target = lastSelection ?? { start: length, end: length }
  const start = Math.min(target.start, length)
  const end = Math.min(target.end, length)
  pending = 'gen'
  try {
    const inserted =
      typeof document.execCommand === 'function' &&
      selectRange(element, start, end) &&
      document.execCommand('insertText', false, delta)
    if (inserted) {
      // `execCommand` fired `input` synchronously, so the handler -- and with it
      // `updateLastSelection` -- has already run.
      return
    }
    const next = prose.text.slice(0, start) + delta + prose.text.slice(end)
    element.textContent = next
    recordEdit(next, pending)
    setLastSelection(start + delta.length, start + delta.length)
    settle()
  } finally {
    pending = undefined
  }
}

/**
 * Where the selection last was in this editor, as character offsets into the text,
 * or `null` if a selection has never landed here. A caret is `start === end`. For
 * the parent to convert to a paragraph and an in-paragraph offset (or two, for a
 * real selection) before generating (frontend#21, frontend#25) -- this component
 * knows nothing about paragraphs, only about DOM positions.
 */
function getSelectionOffsets(): { start: number; end: number } | null {
  return lastSelection
}

/**
 * The `gen` run a reroll (api#5) would replace, or a discard (frontend#33) would
 * remove outright -- the one the caret sits in or at either end of -- or `null`
 * where there is none to act on.
 *
 * Only a caret, never a live selection: a real selection already means Rewrite,
 * which the primary button offers, and offering both at once would be two buttons
 * for one intent. The caret is the only locator available at all -- provenance
 * records who wrote each character, not when, so "the last generation" is not a
 * question `prose` can answer without one (`genRunAt`'s own doc comment).
 */
function rerollTarget(): { start: number; end: number } | null {
  if (lastSelection === null || lastSelection.start !== lastSelection.end) {
    return null
  }
  const run = genRunAt(prose.prov, lastSelection.start)
  if (run === null) {
    return null
  }
  const [start, end] = run
  return { start, end }
}

/** Recomputes whether `rerollTarget()` would answer a span, emitting
 *  `rerollableChange` only when that answer has changed since the last call --
 *  the same contract `setLastSelection` keeps for `selectionChange`. */
function updateRerollability(): void {
  const possible = rerollTarget() !== null
  if (possible !== rerollWasPossible) {
    rerollWasPossible = possible
    emit('rerollableChange', possible)
  }
}

/**
 * Deletes the span from character `start` to character `end`, as one undo step --
 * the undoable half of a reroll (api#5), and the whole of a discard (frontend#33),
 * which calls this and generates nothing after. `Text.vue` calls this with
 * `rerollTarget()`'s own answer; a reroll then generates again with a caret where
 * `start` now sits -- the existing `appendGenerated` needs no change to insert
 * there, since this leaves the caret collapsed at exactly that position -- and a
 * discard stops here.
 *
 * Mirrors `appendGenerated`'s own structure: `document.execCommand('delete')` where
 * it exists, so the deletion lands on the browser's own undo stack, and the same
 * `textContent`-splice fallback where it does not. No `pending` kind is set around
 * either path -- `applyEdit` fills zero characters for an empty insertion, so
 * `classify`'s answer here is never read.
 */
function removeRange(start: number, end: number): void {
  const element = editor.value
  if (element === null || start === end) {
    return
  }
  const deleted =
    typeof document.execCommand === 'function' &&
    selectRange(element, start, end) &&
    document.execCommand('delete')
  if (deleted) {
    // `execCommand` fired `input` synchronously, so the handler -- and with it
    // `updateLastSelection` -- has already run.
    return
  }
  const next = prose.text.slice(0, start) + prose.text.slice(end)
  element.textContent = next
  recordEdit(next)
  setLastSelection(start, start)
  settle()
}

/**
 * The caret's own on-screen rectangle, or `null` where it cannot be measured
 * right now (no live selection inside this element).
 *
 * Not the collapsed selection Range's own `getBoundingClientRect()` -- that
 * answers all-zero in exactly the case this feature cares about most: a caret
 * on a blank line, with no text on either side of it to measure against. A
 * zero-width marker briefly inserted at the caret always has *something* to
 * report a box for, wherever the caret actually is.
 *
 * Non-destructive to the DOM structure: the caret sits at the very end of the
 * whole text whenever this is called (the one place a proposal may be shown),
 * so the marker always lands at the end of a text node -- or directly on the
 * root element, if the browser gave a trailing blank line its own `<br>` --
 * rather than splitting one in the middle. `Text.splitText` at a text node's
 * own length leaves that node's data untouched and only adds an empty
 * sibling, so any existing `CSS.highlights` Range still describes exactly
 * what it did before; removing the marker and normalising removes that empty
 * sibling again, leaving the node the marker was inserted beside exactly as
 * it was.
 *
 * **Not non-destructive to the live selection, which is why this restores it
 * explicitly.** `insertNode` mutates the one shared DOM tree, and the
 * selection's own range is live over exactly the spot the marker lands on --
 * a browser is free to shift or collapse it as a side effect of that
 * insertion (and of the removal and `normalize()` after), silently, with
 * nothing to throw. Left alone, that showed up as every completion after the
 * first never firing again: a caret nudged somewhere `isCaretAtEndOfText()`
 * no longer recognised fails silently by this feature's own design, which is
 * exactly what made it look like nothing was happening at all. `selectRange`
 * puts the caret back by character offset -- `text.length`, since that is
 * where it always is here -- rather than trusting whatever node reference
 * the selection was left holding.
 */
function measureCaretRect(): DOMRect | null {
  const root = editor.value
  const selection = window.getSelection()
  if (root === null || selection === null || selection.rangeCount === 0) {
    return null
  }
  const live = selection.getRangeAt(0)
  if (!root.contains(live.startContainer)) {
    return null
  }
  const range = live.cloneRange()
  range.collapse(true)
  const marker = document.createElement('span')
  // A zero-width space, not an empty span: an empty element's own box can
  // measure as degenerate in some browsers, where one with real (if
  // invisible) text content reliably reports its actual position.
  marker.textContent = '\u200b'
  range.insertNode(marker)
  const rect = marker.getBoundingClientRect()
  const parent = marker.parentNode
  marker.remove()
  parent?.normalize()
  // The marker's own insertion and removal may have shifted or collapsed the
  // live selection -- put the caret back by offset rather than trust whatever
  // node reference it was left holding (this function's own doc comment).
  selectRange(root, prose.text.length, prose.text.length)
  return rect
}

/**
 * Measures the caret and moves the proposal's own span to sit exactly on it,
 * leaving the previous position alone if the caret cannot be measured right
 * now (a stale position is better than one that jumps to the origin).
 *
 * Called once when a proposal first appears, and again on the surface's own
 * `scroll` event -- scrolling moves the caret's on-screen position without
 * moving the caret itself, so this is a full re-measurement each time rather
 * than a cheaper scrollTop copy, which is what the previous approach did and
 * which only this component's own scrolling could ever invalidate.
 */
function positionGhost(): void {
  const root = editor.value
  if (root === null) {
    return
  }
  const caret = measureCaretRect()
  if (caret === null) {
    return
  }
  const surface = root.getBoundingClientRect()
  const style = getComputedStyle(root)
  const leftPadding = Number.parseFloat(style.paddingLeft) || 0
  const rightPadding = Number.parseFloat(style.paddingRight) || 0
  const contentLeft = surface.left + leftPadding

  ghostTop.value = caret.top - surface.top
  ghostLeft.value = leftPadding
  ghostWidth.value = Math.max(0, surface.width - leftPadding - rightPadding)
  ghostIndent.value = Math.max(0, caret.left - contentLeft)
}

/** Repositions a showing proposal when the surface scrolls -- a no-op with
 *  none showing, so this costs nothing on every ordinary scroll. */
function syncGhostScroll(): void {
  if (proposal.value !== '') {
    positionGhost()
  }
}

/** Resolves a showing proposal, Tab accepting it and Escape or anything else
 *  dismissing it. Added to the editor element only while a proposal is
 *  showing (`showProposal`/`clearProposal`), never left standing -- the editor
 *  intercepts no key otherwise, which a keydown handler sitting here always
 *  would. */
function handleProposalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Tab') {
    event.preventDefault()
    acceptProposal()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    clearProposal()
    return
  }
  // Any other key dismisses the proposal without preventing anything, so the
  // keystroke lands exactly as it would with no proposal showing.
  clearProposal()
}

/** Shows `text` in grey immediately after the current end of the prose
 *  (frontend#9). `Text.vue` decides *when* to ask and fetches the text; this
 *  only draws what it is given, and only once there is something to draw. */
function showProposal(text: string): void {
  if (editor.value === null || text === '') {
    return
  }
  // Measured before `proposal.value` is set, not after: positioning only
  // reads the live selection and `.surface`'s own box, neither of which
  // depends on the overlay's own (not yet painted) DOM existing, so there is
  // nothing to defer to a tick here the way the scroll-position approach
  // this replaced had to.
  positionGhost()
  proposal.value = text
  editor.value.addEventListener('keydown', handleProposalKeydown)
  if (!proposalWasShown) {
    proposalWasShown = true
    emit('proposalChange', true)
  }
}

/** Dismisses a showing proposal without inserting it. Idempotent, so every
 *  caller -- a keystroke, a blur, the caret moving off the end, a different
 *  file loading -- can call it unconditionally. */
function clearProposal(): void {
  if (proposal.value === '') {
    return
  }
  proposal.value = ''
  editor.value?.removeEventListener('keydown', handleProposalKeydown)
  if (proposalWasShown) {
    proposalWasShown = false
    emit('proposalChange', false)
  }
}

/** Accepts a showing proposal: resolves it the same way a keystroke would,
 *  then inserts its text exactly as a streamed generation chunk would
 *  (`appendGenerated`) -- so it is marked `gen`, lands on the browser's own
 *  undo stack, and Ctrl+Z removes it like any other insertion. A no-op with no
 *  proposal showing. */
function acceptProposal(): void {
  if (proposal.value === '') {
    return
  }
  const text = proposal.value
  clearProposal()
  appendGenerated(text)
}

defineExpose({
  appendGenerated,
  getSelectionOffsets,
  rerollTarget,
  removeRange,
  showProposal,
  clearProposal,
  acceptProposal,
})

/**
 * Replaces everything, which is what opening a different file is.
 *
 * The only place that writes `textContent`. Doing that discards the browser's undo stack
 * for everything in the element, so it is reached only when the text itself has changed
 * from outside — never on the way back from something this component emitted.
 */
function reset(next: Prose): void {
  prose = toRaw(next)
  // A different file has no shared history with the one that was open, and the browser's own
  // undo stack does not survive the `textContent` write below either.
  undoStack = []
  redoStack = []
  // A proposal for the file just closed describes text that is no longer here.
  clearProposal()
  // Wherever the selection was in the file just closed is meaningless in this one.
  lastSelection = null
  if (selectionWasLive) {
    selectionWasLive = false
    emit('selectionChange', false)
  }
  updateRerollability()
  empty.value = prose.text.length === 0
  if (editor.value !== null) {
    editor.value.textContent = prose.text
  }
  paint()
}

onMounted(() => {
  const element = editor.value
  if (element !== null) {
    // The template declares `contenteditable="true"`, which every browser understands, and
    // this upgrades it: `plaintext-only` is what keeps pasted markup out of the prose. A
    // browser that does not accept the value throws rather than ignoring it, and is left on
    // the plain setting. Declaring the attribute rather than only setting the property also
    // means it is really in the markup — jsdom accepts the property and reflects nothing.
    try {
      element.contentEditable = 'plaintext-only'
    } catch {
      element.contentEditable = 'true'
    }
  }
  reset(props.prose)
  // The writer can move the caret or drag out a selection with the mouse or the
  // keyboard, neither of which fires `input` -- this is what catches those.
  // Document-wide because a selection change is not dispatched on the element that
  // contains it.
  document.addEventListener('selectionchange', updateLastSelection)
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', updateLastSelection)
  editor.value?.removeEventListener('keydown', handleProposalKeydown)
})

/** Dismisses a showing proposal on blur -- the writer's attention has left the
 *  editor, so a stale ghost waiting for a Tab that may never come is worse
 *  than none. */
function handleBlur(): void {
  clearProposal()
}

watch(
  () => props.prose,
  (next) => {
    if (next.text === prose.text) {
      // The same text, so the DOM already shows it and must not be rewritten — that is the
      // whole question this guard answers, and it is why the comparison is on the text
      // rather than on the object. The provenance may still differ, so it is adopted and
      // repainted; painting writes nothing.
      //
      // Not compared by identity: a prop reaches this through a reactive proxy, so the
      // object a parent stores and hands back is never the one that was emitted.
      prose = toRaw(next)
      paint()
      return
    }
    reset(next)
  },
)
</script>

<template>
  <div class="markdown-editor">
    <div
      ref="editor"
      class="surface"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      aria-label="Chapter text"
      @input="handleInput"
      @blur="handleBlur"
      @scroll="syncGhostScroll"
    ></div>
    <!-- A sibling, never a child: anything inside the editable element is prose. -->
    <div v-if="empty" class="placeholder" aria-hidden="true">Start writing...</div>
    <!-- The completion proposal (frontend#9): a clipping box matching `.surface`'s
         own, with the proposal's span placed inside it at the caret's measured
         position (`positionGhost`) rather than pushed there by mirroring the
         document in flow. -->
    <div v-if="proposal" class="ghost" aria-hidden="true">
      <span
        class="ghost-proposal"
        :style="{
          top: `${ghostTop}px`,
          left: `${ghostLeft}px`,
          width: `${ghostWidth}px`,
          textIndent: `${ghostIndent}px`,
        }"
      >{{ proposal }}</span>
    </div>
  </div>
</template>

<style scoped>
.markdown-editor {
  width: 100%;
  /* Fill the space the editor-container gives us instead of a fixed 80vh,
     so the page never overflows and the action buttons keep steady spacing. */
  flex: 1;
  min-height: 0;
  display: flex;
  /* So the placeholder can be laid over the writing surface. */
  position: relative;
}

.surface {
  width: 100%;
  flex: 1;
  min-height: 240px;
  padding: 1.25rem 1.5rem;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code',
    Menlo, Consolas, monospace;
  font-size: 1rem;
  line-height: 1.7;
  /* The prose carries its own newlines, so they have to be honoured rather than collapsed;
     `pre-wrap` is what a textarea did implicitly. `break-word` keeps a long unbroken string
     from widening the pane. */
  white-space: pre-wrap;
  overflow-wrap: break-word;
  overflow-y: auto;
  /* The writing zone is the page itself: no border, shadow or fill of its own, and no focus
     indicator either -- the caret is the indication. */
}

.surface:focus {
  outline: none;
}

/* A contenteditable has no placeholder attribute, so it is drawn rather than declared.
   `:empty` is false the moment the browser leaves a stray <br> behind, which is why this is
   also guarded on the element not being focused. */
/* Laid over the surface at exactly its own padding, font and line-height, so the first
   character lands where the placeholder's first character was. Click-through, so clicking it
   puts the caret in the editor underneath. */
.placeholder {
  position: absolute;
  top: 0;
  left: 0;
  padding: 1.25rem 1.5rem;
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code',
    Menlo, Consolas, monospace;
  font-size: 1rem;
  line-height: 1.7;
  color: var(--color-text);
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
}

/* Generated text, and generated text the writer has since corrected.

   `::highlight()` accepts only a narrow set of properties -- `color`, `background-color`,
   `text-decoration` and its longhands, `text-shadow`, `-webkit-text-stroke` -- so anything
   else declared here is ignored rather than applied.

   A background tint rather than a foreground colour, so the prose keeps full contrast
   whichever kind it is. Low enough alpha to sit on either theme's background: green for what a
   model wrote, amber for what the writer has corrected in it. Literal rather than drawn from the theme's custom
   properties, because neither of these means "primary" or "danger" -- they are their own
   thing and have to stay distinguishable from both. */
.surface::highlight(ink-gen) {
  background-color: rgba(111, 209, 139, 0.22);
}

.surface::highlight(ink-fix) {
  background-color: rgba(255, 180, 84, 0.26);
}

/* The completion proposal's overlay (frontend#9): a clipping box matching
   `.surface`'s own outer bounds exactly, so content positioned past its edge is
   cropped the same way the surface's own `overflow-y: auto` would crop it, and
   none of this needs to duplicate `.surface`'s padding or border -- `positionGhost`
   measures against the surface's own box directly, so that is already folded
   into `ghostTop`/`ghostLeft`. */
.ghost {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
}

/* The proposal itself. Its own box spans the paragraph's full width (`left`/
   `width`, measured in `positionGhost` to match `.surface`'s own padding) so a
   wrapped second line returns to the paragraph's own margin, the way real text
   wraps; `text-indent` alone is what pushes the *first* line over to the
   caret's actual column, since indenting the whole box's `left` instead carried
   every later line along with it under the caret -- see `ghostLeft`'s own doc
   comment for why. */
.ghost-proposal {
  position: absolute;
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code',
    Menlo, Consolas, monospace;
  font-size: 1rem;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  color: var(--color-text);
  opacity: 0.45;
}
</style>
