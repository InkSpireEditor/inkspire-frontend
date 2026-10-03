<script setup lang="ts">
/**
 * The editor body: a `contenteditable` div that colours text by who wrote it.
 *
 * Deliberately uncontrolled beyond the initial value, exactly as the textarea it replaces
 * was: it emits every keystroke as `contentChange` and lets the parent own the text, so
 * typing is never interrupted by a re-render. The public contract is unchanged — prop
 * `content`, emit `contentChange` with the plain text.
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
 * All of that was settled in `contenteditable-demo/index.html`, demos 4 to 10, by hand in
 * two browsers. `ARCHITECTURE.md` §8.1 records what each one showed.
 */
import { onMounted, ref, watch } from 'vue'
import { applyEdit, proseFromMetadata, runsOf, type Prose } from '../services/provenance'

const props = defineProps<{
  content: string
}>()

const emit = defineEmits(['contentChange'])

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
const empty = ref(props.content.length === 0)

/**
 * The text and one kind per character of it.
 *
 * Plain, not a `ref`: nothing in the template reads it, and making it reactive would invite
 * a re-render on every keystroke — which is the one thing this component must never do.
 */
let prose: Prose = { text: '', prov: [] }

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

/** The writer typed, pasted, deleted, or undid something. */
function handleInput(): void {
  const current = editor.value?.textContent ?? ''
  prose = applyEdit(prose, current)
  empty.value = prose.text.length === 0
  paint()
  emit('contentChange', prose.text)
}

/**
 * Replaces everything, which is what opening a different file is.
 *
 * The only place that writes `textContent`, and it is reached only when the prop says
 * something the prose does not already say. The parent echoes back what this component just
 * emitted, so without that guard every keystroke would rewrite the DOM underneath the caret
 * and throw the browser's undo stack away.
 */
function reset(body: string): void {
  prose = proseFromMetadata(body, null)
  empty.value = prose.text.length === 0
  if (editor.value !== null) {
    editor.value.textContent = body
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
  reset(props.content)
})

watch(
  () => props.content,
  (next) => {
    if (next === prose.text) {
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
    ></div>
    <!-- A sibling, never a child: anything inside the editable element is prose. -->
    <div v-if="empty" class="placeholder" aria-hidden="true">Start writing...</div>
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
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-background-soft);
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
  /* Raised writing surface above the recessed canvas. */
  box-shadow: var(--shadow-card);
  transition: border-color var(--transition), box-shadow var(--transition);
}

.surface:focus {
  outline: none;
  border-color: var(--color-primary);
  /* Keep the card elevation, add the focus ring on top. */
  box-shadow: var(--focus-ring), var(--shadow-card);
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
   whichever kind it is. The hues are the ones `contenteditable-demo` demo 10 used, at a low
   enough alpha to sit on either theme's background: green for what a model wrote, amber for
   what the writer has corrected in it. Literal rather than drawn from the theme's custom
   properties, because neither of these means "primary" or "danger" -- they are their own
   thing and have to stay distinguishable from both. */
.surface::highlight(ink-gen) {
  background-color: rgba(111, 209, 139, 0.22);
}

.surface::highlight(ink-fix) {
  background-color: rgba(255, 180, 84, 0.26);
}
</style>
