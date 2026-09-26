<script setup lang="ts">
/**
 * A story's lorebook as a force-directed graph.
 *
 * The API answers topology only -- nodes and links, with each node's most specific
 * class already picked server-side -- and the layout runs here, in force-graph. That
 * is the opposite of the timeline, which arrives fully laid out; both are deliberate
 * (ARCHITECTURE.md §9).
 *
 * The graph payload is held outside Vue's reactivity on purpose. force-graph mutates
 * what it is given: a node gains x/y/vx/vy, and a link's source/target are replaced
 * in place by references to the node objects. Behind a ref, every simulation tick
 * would fire reactivity for nothing and fight the library's own writes.
 */
import { nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import ForceGraph from 'force-graph'
import { loreService, type LoreGraph, type LoreLink } from '../services/lore'
import {
  palette,
  nodeRadius,
  tooltipHtml,
  esc,
  type PositionedNode,
} from '../services/loreGraph'
import { useTheme } from '../services/theme'

const route = useRoute()
const { currentTheme, isDarkMode } = useTheme()

const container = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const nodeCount = ref(0)
const linkCount = ref(0)

/** Neither reactive: see the note at the top of this file. */
let graph: ForceGraph<PositionedNode, LoreLink> | null = null
let graphData: LoreGraph | null = null

/** Colours, built from the whole dataset once, so filtering never re-hues anything. */
const colorByType = shallowRef<Record<string, string>>({})
const colorByPred = shallowRef<Record<string, string>>({})

/** The first settle frames the graph; later ones must not yank the view back. */
let fittedOnce = false

// Physics, ported from the CLI viewer so both draw a lorebook the same way.
const GRAVITY = 0.05
const LINK_BASE = 34
const CHARGE_BASE = -55
const SPACING_MULTIPLIER = 1.6
const CHARGE_DISTANCE_MAX = 800
/** Below this on-screen size, labels are dropped rather than drawn as unreadable specks. */
const MIN_LABEL_FONT_SIZE = 3

/** The app's own background token, whichever theme is active. */
const backgroundColor = (): string => {
  const token = getComputedStyle(document.body).getPropertyValue('--color-background').trim()
  return token || (isDarkMode() ? '#181818' : '#f8f8f8')
}

const mountGraph = () => {
  if (!container.value || !graphData) return

  colorByType.value = palette([...new Set(graphData.nodes.map((node) => node.type))])
  colorByPred.value = palette([...new Set(graphData.links.map((link) => link.label))])

  graph = new ForceGraph<PositionedNode, LoreLink>(container.value)
    .graphData(graphData)
    .backgroundColor(backgroundColor())
    .nodeId('id')
    .nodeRelSize(5)
    // Area, not radius -- so a well-connected entity reads as bigger without one
    // hub dwarfing everything around it.
    .nodeVal((node) => 1 + node.degree)
    .nodeColor((node) => colorByType.value[node.type] ?? '#999')
    .nodeLabel((node) => tooltipHtml(node))
    .nodeCanvasObjectMode(() => 'after')
    .nodeCanvasObject((node, ctx, scale) => {
      const fontSize = 12 / scale
      if (fontSize < MIN_LABEL_FONT_SIZE) return
      ctx.font = `${fontSize}px sans-serif`
      ctx.fillStyle = colorByType.value[node.type] ?? '#999'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(node.label, node.x ?? 0, (node.y ?? 0) + nodeRadius(node.degree) + 1)
    })
    .linkColor((link) => colorByPred.value[link.label] ?? '#999')
    .linkLabel((link) => esc(link.label))
    .linkDirectionalArrowLength(3.5)
    .linkDirectionalArrowRelPos(1)
    .onEngineStop(() => {
      if (!fittedOnce) {
        graph?.zoomToFit(400, 60)
        fittedOnce = true
      }
    })

  // An entity with no relations is repelled by the charge force and pulled back by
  // nothing, so it drifts off the canvas. forceCenter recentres the centroid rather
  // than reeling individuals in, so a gentle pull toward the origin is what works --
  // and a lorebook is full of stubs with no edges, so this is not optional.
  const gravity = (alpha: number) => {
    for (const node of graphData!.nodes as PositionedNode[]) {
      node.vx! -= node.x! * GRAVITY * alpha
      node.vy! -= node.y! * GRAVITY * alpha
    }
  }
  graph.d3Force('gravity', gravity)
  graph.d3Force('link')?.distance(LINK_BASE * SPACING_MULTIPLIER)
  graph
    .d3Force('charge')
    ?.strength(CHARGE_BASE * SPACING_MULTIPLIER)
    .distanceMax(CHARGE_DISTANCE_MAX)

  sizeToContainer()
}

const sizeToContainer = () => {
  if (!container.value || !graph) return
  graph.width(container.value.clientWidth).height(container.value.clientHeight)
}

const load = async () => {
  const id = route.params.id
  if (typeof id !== 'string') return

  loading.value = true
  error.value = null
  try {
    graphData = await loreService.getGraph(id)
    nodeCount.value = graphData.nodes.length
    linkCount.value = graphData.links.length
    fittedOnce = false
    // The container is behind `v-if="!loading"`, so it only exists once this
    // resolves and Vue has patched the DOM.
    loading.value = false
    await nextTick()
    mountGraph()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the knowledge graph'
    loading.value = false
  }
}

// The canvas also changes size when something opens beside it, which is not a window
// resize -- so this observes the element rather than listening on window.
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(sizeToContainer)
  load()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  graph?._destructor()
  graph = null
})

watch(container, (element) => {
  if (element && resizeObserver) resizeObserver.observe(element)
})

// The app owns the theme, so the canvas follows it rather than the OS setting the
// standalone CLI page has to read.
watch(currentTheme, () => graph?.backgroundColor(backgroundColor()))

// A lorebook link elsewhere can be clicked while this view is already open, which
// changes the param without remounting the component.
watch(
  () => route.params.id,
  () => {
    graph?._destructor()
    graph = null
    load()
  }
)
</script>

<template>
  <div class="lore-view">
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else>
      <p v-if="nodeCount === 0" class="empty">This lorebook has no entities yet.</p>
      <template v-else>
        <p class="counts">{{ nodeCount }} entities · {{ linkCount }} relations</p>
        <div class="graph-canvas" ref="container"></div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.lore-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.error {
  color: var(--color-danger);
}

.empty {
  color: var(--color-text);
  opacity: 0.7;
}

.counts {
  color: var(--color-text);
  opacity: 0.7;
  font-size: 0.85rem;
  margin: 0;
}

.graph-canvas {
  flex: 1;
  /* Both needed so this can actually shrink inside the flex column, and later
     beside a panel, rather than forcing the page to grow. */
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
</style>
