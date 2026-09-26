/**
 * Drawing decisions for the lore graph, kept out of the component so each can be
 * tested on its own without mounting a canvas or running a simulation.
 *
 * Ported from the `lorebook view` CLI page (`lorebook/templates/view.html.j2`),
 * which draws the same payload with the same library: the colouring, the node
 * radius and the type filtering are deliberately the same arithmetic, so the two
 * views of one lorebook look like the same graph.
 */
import type { LoreGraph, LoreNode } from './lore'

/**
 * A node once force-graph has had it: the simulation writes a position and a
 * velocity onto each one in place. Optional because they are absent until the
 * first tick.
 */
export type PositionedNode = LoreNode & {
  x?: number
  y?: number
  vx?: number
  vy?: number
  index?: number
}

/** Node radius force-graph draws for `nodeRelSize(5)` and `nodeVal(1 + degree)`. */
export const NODE_REL_SIZE = 5

/**
 * An evenly spaced hue per key, alphabetically. Deterministic for a given set of
 * keys, and used for node types and link predicates alike. Adding a key re-hues
 * everything, which is why this is always built from the whole dataset rather than
 * from whatever subset is currently visible.
 */
export function palette(keys: string[]): Record<string, string> {
  const sorted = [...keys].sort()
  const map: Record<string, string> = {}
  sorted.forEach((key, i) => {
    map[key] = `hsl(${Math.round((360 * i) / sorted.length)}, 62%, 55%)`
  })
  return map
}

/** The same colour at 12% alpha, for a node a search has not matched. */
export function faded(color: string): string {
  return color.replace(/^hsl\((.*)\)$/, 'hsla($1, 0.12)')
}

/**
 * Radius in graph units, matching what force-graph itself draws for this node.
 *
 * `relSize` is a parameter because it shrinks as the reader zooms in -- see
 * `relSizeAt`.
 */
export function nodeRadius(degree: number, relSize: number = NODE_REL_SIZE): number {
  return relSize * Math.sqrt(1 + degree)
}

/**
 * How much a node resists growing as the reader zooms in. Tune this to taste: at 1.0
 * a node holds exactly one size on screen at every zoom, and lower values let it
 * grow a little, so zooming in still reads as zooming in.
 */
export const NODE_ZOOM_DAMPING = 0.25

/**
 * The base node size to draw at a given zoom.
 *
 * force-graph sizes nodes in graph coordinates, so an undamped node at 4x zoom is
 * drawn four times as wide -- while its label, set at `12 / zoom`, holds the same
 * size on screen. The dot ends up swallowing the name it is meant to be labelled
 * with, so the base size shrinks by `zoom ** NODE_ZOOM_DAMPING` to hold that back.
 *
 * Only zooming *in* is damped: zoomed out, nodes shrink to specks, which is what an
 * overview wants.
 */
export function relSizeAt(zoom: number): number {
  return NODE_REL_SIZE / Math.pow(Math.max(1, zoom), NODE_ZOOM_DAMPING)
}

/**
 * force-graph inserts a tooltip string as innerHTML, so text reaching it is escaped
 * here by hand. Vue's own templates need none of this -- they escape by default.
 */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** How long a description may run in a hover tooltip before it is cut. */
const TOOLTIP_DESCRIPTION_LIMIT = 160

/** The hover tooltip for one node: its label, its classes, a little prose, its degree. */
export function tooltipHtml(node: LoreNode): string {
  const lines = [`<b>${esc(node.label)}</b>`, `<i>${esc(node.types.join(', ') || '—')}</i>`]
  const description = node.attrs?.description?.[0]
  if (description) {
    lines.push(esc(String(description).slice(0, TOOLTIP_DESCRIPTION_LIMIT)))
  }
  lines.push(`degree: ${node.degree}`)
  return lines.join('<br>')
}

/**
 * A link's endpoint id. force-graph replaces `source`/`target` in place, turning the
 * IRI strings it was given into references to the node objects themselves once the
 * simulation runs -- so a filter has to read an endpoint either way round.
 */
export function endpointId(endpoint: string | LoreNode): string {
  return typeof endpoint === 'object' ? endpoint.id : endpoint
}

/**
 * The graph with every hidden type's nodes dropped, and every link that touched one
 * dropped with them.
 *
 * Returns the *same* node and link objects, filtered rather than mapped: force-graph
 * has written each node's position onto the object itself, so handing it a copy would
 * restart that node from nothing and make the layout jump on every filter change.
 */
export function filterGraph(graph: LoreGraph, hiddenTypes: Set<string>): LoreGraph {
  if (hiddenTypes.size === 0) return graph
  const nodes = graph.nodes.filter((node) => !hiddenTypes.has(node.type))
  const kept = new Set(nodes.map((node) => node.id))
  const links = graph.links.filter(
    (link) => kept.has(endpointId(link.source)) && kept.has(endpointId(link.target))
  )
  return { nodes, links }
}

/** How many nodes carry each type, for the legend's counts. */
export function countByType(nodes: LoreNode[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const node of nodes) counts[node.type] = (counts[node.type] ?? 0) + 1
  return counts
}

/**
 * Ids of the nodes a search term matches, by label or by any of their classes, or
 * `null` for an empty term -- which means "no search running", not "nothing matched".
 *
 * Plain lowercase substring matching, deliberately not a RegExp: a stray
 * metacharacter in a search box should never throw or hang.
 */
export function matchingNodeIds(nodes: LoreNode[], term: string): Set<string> | null {
  const needle = term.trim().toLowerCase()
  if (!needle) return null
  return new Set(
    nodes
      .filter(
        (node) =>
          node.label.toLowerCase().includes(needle) ||
          node.types.join(' ').toLowerCase().includes(needle)
      )
      .map((node) => node.id)
  )
}
