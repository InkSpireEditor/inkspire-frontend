/**
 * Drawing decisions for the lore graph, kept out of the component so each can be
 * tested on its own without mounting a canvas or running a simulation.
 *
 * Ported from the `lorebook view` CLI page (`lorebook/templates/view.html.j2`),
 * which draws the same payload with the same library: the colouring, the node
 * radius and the type filtering are deliberately the same arithmetic, so the two
 * views of one lorebook look like the same graph.
 */
import type { LoreNode } from './lore'

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

/** Radius in graph units, matching what force-graph itself draws for this node. */
export function nodeRadius(degree: number): number {
  return NODE_REL_SIZE * Math.sqrt(1 + degree)
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
