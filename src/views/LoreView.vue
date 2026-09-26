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
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import ForceGraph from 'force-graph'
import { loreService, type LoreGraph, type LoreLink } from '../services/lore'
import {
  palette,
  nodeRadius,
  tooltipHtml,
  esc,
  faded,
  filterGraph,
  countByType,
  matchingNodeIds,
  relSizeAt,
  type PositionedNode,
} from '../services/loreGraph'
import { useTheme } from '../services/theme'
import { filesManagerService } from '../services/filesManager'
import BackLink from '../components/BackLink.vue'

const route = useRoute()
const { currentTheme, isDarkMode } = useTheme()

/** Whatever the URL names, for the way back to the dashboard. */
const storyId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))

const container = ref<HTMLDivElement | null>(null)
const storyName = ref('')
const storySummary = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const nodeCount = ref(0)
const linkCount = ref(0)

/** Bumped whenever `graphData` is replaced, so the computeds that read it -- which
 *  cannot track a plain variable -- know to run again. */
const graphVersion = ref(0)

/** Types the legend has switched off, and the search box's current term. */
const hiddenTypes = ref<Set<string>>(new Set())
const searchTerm = ref('')
/** How many nodes carry each type. Drives the legend, so it is reactive. */
const typeCounts = shallowRef<Record<string, number>>({})
const legendTypes = computed(() => Object.keys(typeCounts.value).sort())

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
const CHARGE_DISTANCE_MAX = 800
/** Multiplies link distance and charge strength together, so one slider spreads the
 *  whole layout out or packs it back in. The CLI page's own default. */
const DEFAULT_SPACING = 1.6
const SPACING_MIN = 0.5
const SPACING_MAX = 4
const SPACING_STEP = 0.1
const spacing = ref(DEFAULT_SPACING)
/**
 * A node drawn smaller than this on screen is not worth naming: at that size a
 * crowd of labels overlaps into noise, and the dot's own colour already says what
 * it is. Measured against what the reader sees, not against graph units, so
 * zooming *in* can never take a label away. A search match keeps its label
 * whatever its size.
 */
const MIN_LABELLED_RADIUS_PX = 3

/**
 * Ids the search matches, or null when no search is running.
 *
 * `graphData` is deliberately not reactive, so this reads `searchTerm` and
 * `graphVersion` before touching it: a computed only re-runs for the reactive values
 * it actually read, and short-circuiting on a null `graphData` would leave it with no
 * dependencies at all and cached as null for good.
 */
const highlighted = computed(() => {
  const term = searchTerm.value
  void graphVersion.value
  if (!graphData) return null
  return matchingNodeIds(graphData.nodes, term)
})

/** The app's own background token, whichever theme is active. */
const backgroundColor = (): string => {
  const token = getComputedStyle(document.body).getPropertyValue('--color-background').trim()
  return token || (isDarkMode() ? '#181818' : '#f8f8f8')
}

const mountGraph = () => {
  if (!container.value || !graphData) return

  typeCounts.value = countByType(graphData.nodes)
  // Built from the whole dataset, never from what is currently visible, so hiding a
  // type never re-hues the ones that stayed.
  colorByType.value = palette(Object.keys(typeCounts.value))
  colorByPred.value = palette([...new Set(graphData.links.map((link) => link.label))])

  graph = new ForceGraph<PositionedNode, LoreLink>(container.value)
    .graphData(graphData)
    .backgroundColor(backgroundColor())
    .nodeId('id')
    // Damped as the reader zooms in -- see relSizeAt. force-graph derives both the
    // circle it paints and the area it treats as clickable from this one number, so
    // damping it here keeps dragging and clicking exactly in step with what is on
    // screen, which painting undamped circles by hand would not.
    .nodeRelSize(relSizeAt(1))
    // Area, not radius -- so a well-connected entity reads as bigger without one
    // hub dwarfing everything around it.
    .nodeVal((node) => 1 + node.degree)
    .nodeColor((node) => nodeColor(node))
    .nodeLabel((node) => tooltipHtml(node))
    .nodeCanvasObjectMode(() => 'after')
    .nodeCanvasObject((node, ctx, scale) => {
      const matches = highlighted.value
      if (matches && !matches.has(node.id)) return

      // Hugs the circle's edge, so it has to use the same damped size the circle
      // was drawn at rather than the undamped base.
      const radius = nodeRadius(node.degree, relSizeAt(scale))
      // The canvas is already scaled by the zoom, so `radius * scale` is what the
      // reader sees, and dividing the font by the scale is what holds it at a
      // steady size on screen.
      if (radius * scale < MIN_LABELLED_RADIUS_PX && !matches) return

      ctx.font = `${12 / scale}px sans-serif`
      ctx.fillStyle = nodeColor(node)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(node.label, node.x ?? 0, (node.y ?? 0) + radius + 1)
    })
    .linkColor((link) => colorByPred.value[link.label] ?? '#999')
    .linkLabel((link) => esc(link.label))
    .linkDirectionalArrowLength(3.5)
    .linkDirectionalArrowRelPos(1)
    .onZoom(({ k }) => graph?.nodeRelSize(relSizeAt(k)))
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
  applySpacing()

  sizeToContainer()
}

/**
 * A node's colour: its type's, or the same hue at low alpha when a search is running
 * and this node is not one of the matches.
 */
const nodeColor = (node: PositionedNode): string => {
  const color = colorByType.value[node.type] ?? '#999'
  const matches = highlighted.value
  return matches && !matches.has(node.id) ? faded(color) : color
}

/**
 * Pushes the spacing multiplier into the two forces it scales, then reheats -- the
 * simulation has already settled, so without a reheat the new distances would only
 * take effect the next time something else disturbed it. Re-arms the one-time fit so
 * the view reframes once the layout settles at its new size.
 */
const applySpacing = () => {
  if (!graph) return
  graph.d3Force('link')?.distance(LINK_BASE * spacing.value)
  graph.d3Force('charge')?.strength(CHARGE_BASE * spacing.value).distanceMax(CHARGE_DISTANCE_MAX)
  fittedOnce = false
  graph.d3ReheatSimulation()
}

/** Redraws without re-running the layout, for a change that is only about colour. */
const repaint = () => graph?.nodeColor(graph.nodeColor())

const toggleType = (type: string) => {
  const next = new Set(hiddenTypes.value)
  next.has(type) ? next.delete(type) : next.add(type)
  hiddenTypes.value = next
  applyFilter()
}

/** The legend's own heading: hide everything, or show everything back. */
const toggleAllTypes = () => {
  const allHidden = hiddenTypes.value.size >= legendTypes.value.length
  hiddenTypes.value = allHidden ? new Set() : new Set(legendTypes.value)
  applyFilter()
}

const applyFilter = () => {
  if (!graph || !graphData) return
  graph.graphData(filterGraph(graphData, hiddenTypes.value))
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
    // The graph payload names no story, so the story itself is asked for too --
    // in parallel, since neither waits on the other.
    const [graph, story] = await Promise.all([
      loreService.getGraph(id),
      filesManagerService.getDirContent('stories', id),
    ])
    storyName.value = story.name
    storySummary.value = story.summary ?? ''
    graphData = graph
    nodeCount.value = graphData.nodes.length
    linkCount.value = graphData.links.length
    // A previous story's hidden types and search term mean nothing here.
    hiddenTypes.value = new Set()
    searchTerm.value = ''
    graphVersion.value++
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

// Searching only changes what is emphasised, so it repaints rather than re-laying
// out, then frames whatever matched.
watch(highlighted, (matches) => {
  repaint()
  if (matches && matches.size > 0) {
    graph?.zoomToFit(500, 60, (node) => matches.has(node.id))
  }
})

watch(spacing, applySpacing)

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
    <BackLink v-if="storyId" :story-id="storyId" />
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else>
      <h1>{{ storyName }}</h1>
      <p v-if="storySummary" class="synopsis">{{ storySummary }}</p>
      <p v-if="nodeCount === 0" class="empty">This lorebook has no entities yet.</p>
      <template v-else>
        <div class="controls">
          <p class="counts">{{ nodeCount }} entities · {{ linkCount }} relations</p>
          <label class="control">
            <span>Search</span>
            <input v-model="searchTerm" type="search" placeholder="name or type" />
          </label>
          <label class="control">
            <span>Spacing</span>
            <input
              v-model.number="spacing"
              type="range"
              :min="SPACING_MIN"
              :max="SPACING_MAX"
              :step="SPACING_STEP"
            />
          </label>
        </div>

        <div class="graph-area">
          <div class="graph-canvas" ref="container"></div>

          <div class="legend">
            <h2 @click="toggleAllTypes" role="button" tabindex="0" @keyup.enter="toggleAllTypes">
              Types
            </h2>
            <p class="legend-hint">click a type to show or hide it</p>
            <ul>
              <li
                v-for="type in legendTypes"
                :key="type"
                class="legend-item"
                :class="{ hidden: hiddenTypes.has(type) }"
                role="button"
                tabindex="0"
                :aria-pressed="!hiddenTypes.has(type)"
                @click="toggleType(type)"
                @keyup.enter="toggleType(type)"
                @keyup.space.prevent="toggleType(type)"
              >
                <span class="swatch" :style="{ backgroundColor: colorByType[type] }"></span>
                <span class="legend-name">{{ type }}</span>
                <span class="legend-count">{{ typeCounts[type] }}</span>
              </li>
            </ul>
          </div>
        </div>
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

h1 {
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
  margin: 0;
}

.synopsis {
  color: var(--color-text);
  margin: 0;
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

.controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
  color: var(--color-text);
}

.control input[type='search'] {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background-soft);
  color: var(--color-text);
}

.graph-area {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: var(--space-3);
}

.legend {
  width: 180px;
  flex-shrink: 0;
  overflow-y: auto;
}

.legend h2 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
}

.legend-hint {
  margin: 0 0 var(--space-2) 0;
  font-size: 0.75rem;
  color: var(--color-text);
  opacity: 0.6;
}

.legend ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 2px 0;
  cursor: pointer;
  color: var(--color-text);
  font-size: 0.85rem;
}

.legend-item.hidden {
  opacity: 0.4;
  text-decoration: line-through;
}

.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}

.legend-count {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
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
