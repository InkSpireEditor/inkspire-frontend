import { describe, it, expect } from 'vitest'
import {
    palette,
    faded,
    nodeRadius,
    relSizeAt,
    NODE_REL_SIZE,
    esc,
    tooltipHtml,
    endpointId,
    filterGraph,
    countByType,
    matchingNodeIds,
} from './loreGraph'
import type { LoreGraph, LoreNode } from './lore'

function node(overrides: Partial<LoreNode> = {}): LoreNode {
    return {
        id: 'https://example.test/entity#Doe',
        label: 'Jane Doe',
        type: 'Character',
        types: ['Character'],
        attrs: {},
        degree: 0,
        ...overrides,
    }
}

describe('palette', () => {
    it('spaces hues evenly, in alphabetical order regardless of input order', () => {
        expect(palette(['Location', 'Character'])).toEqual({
            Character: 'hsl(0, 62%, 55%)',
            Location: 'hsl(180, 62%, 55%)',
        })
    })

    it('gives a single key the first hue', () => {
        expect(palette(['Character'])).toEqual({ Character: 'hsl(0, 62%, 55%)' })
    })

    it('answers an empty map for no keys', () => {
        expect(palette([])).toEqual({})
    })
})

describe('faded', () => {
    it('turns a palette colour into the same hue at low alpha', () => {
        expect(faded('hsl(180, 62%, 55%)')).toBe('hsla(180, 62%, 55%, 0.12)')
    })

    it('leaves a colour it does not recognise alone', () => {
        expect(faded('#999')).toBe('#999')
    })
})

describe('nodeRadius', () => {
    it('grows with the square root of degree, so area is what scales', () => {
        expect(nodeRadius(0)).toBe(5)
        expect(nodeRadius(3)).toBe(10)
        expect(nodeRadius(8)).toBe(15)
    })
})

describe('relSizeAt', () => {
    it('leaves the base size alone at 1x zoom', () => {
        expect(relSizeAt(1)).toBe(NODE_REL_SIZE)
    })

    it('leaves the base size alone when zoomed out, where a speck is the point', () => {
        expect(relSizeAt(0.25)).toBe(NODE_REL_SIZE)
    })

    it('shrinks monotonically as zoom increases -- it must never turn around and grow', () => {
        const sizes = [1, 2, 4, 8, 16, 64, 256].map(relSizeAt)
        for (let i = 1; i < sizes.length; i++) {
            expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!)
        }
    })

    it('never lets a node grow past its undamped size just by zooming in', () => {
        for (const zoom of [1, 2, 4, 8, 16, 64]) {
            expect(relSizeAt(zoom)).toBeLessThanOrEqual(NODE_REL_SIZE)
        }
    })
})

describe('esc', () => {
    it('neutralises markup, since force-graph inserts a tooltip as innerHTML', () => {
        expect(esc('<script>alert("x")</script>')).toBe(
            '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
        )
    })

    it('escapes an ampersand before anything that follows it', () => {
        expect(esc('Alden & Bryn')).toBe('Alden &amp; Bryn')
    })
})

describe('tooltipHtml', () => {
    it('names the entity, its classes and its degree', () => {
        const html = tooltipHtml(node({ types: ['Character', 'SecondaryCharacter'], degree: 2 }))
        expect(html).toBe('<b>Jane Doe</b><br><i>Character, SecondaryCharacter</i><br>degree: 2')
    })

    it('includes a description when the entity has one', () => {
        const html = tooltipHtml(node({ attrs: { description: ['Steady.'] } }))
        expect(html).toContain('Steady.')
    })

    it('cuts a long description rather than filling the screen with it', () => {
        const html = tooltipHtml(node({ attrs: { description: ['x'.repeat(400)] } }))
        expect(html).toContain('x'.repeat(160))
        expect(html).not.toContain('x'.repeat(161))
    })

    it('escapes a label that carries markup', () => {
        const html = tooltipHtml(node({ label: '<b>bold</b>' }))
        expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
    })

    it('shows a dash for an entity with no classes at all', () => {
        expect(tooltipHtml(node({ types: [] }))).toContain('<i>—</i>')
    })
})

describe('endpointId', () => {
    it('reads a plain IRI string', () => {
        expect(endpointId('https://example.test/entity#Doe')).toBe('https://example.test/entity#Doe')
    })

    it('reads the id off a node object, since force-graph substitutes one in place', () => {
        expect(endpointId(node())).toBe('https://example.test/entity#Doe')
    })
})

describe('countByType', () => {
    it('counts the nodes carrying each type', () => {
        expect(
            countByType([
                node({ type: 'Character' }),
                node({ type: 'Character' }),
                node({ type: 'Location' }),
            ])
        ).toEqual({ Character: 2, Location: 1 })
    })

    it('answers an empty map for no nodes', () => {
        expect(countByType([])).toEqual({})
    })
})

describe('filterGraph', () => {
    const doe = node({ id: 'doe', type: 'Character' })
    const guild = node({ id: 'guild', type: 'Guild' })
    const keep = node({ id: 'keep', type: 'Location' })
    const graph: LoreGraph = {
        nodes: [doe, guild, keep],
        links: [
            { source: 'doe', target: 'guild', label: 'memberOf' },
            { source: 'doe', target: 'keep', label: 'locatedIn' },
        ],
    }

    it('hands back the very same object when nothing is hidden', () => {
        expect(filterGraph(graph, new Set())).toBe(graph)
    })

    it("drops a hidden type's nodes and every link touching one", () => {
        const filtered = filterGraph(graph, new Set(['Guild']))

        expect(filtered.nodes.map((n) => n.id)).toEqual(['doe', 'keep'])
        expect(filtered.links).toHaveLength(1)
        expect(filtered.links[0]?.label).toBe('locatedIn')
    })

    it('keeps the same node objects, so force-graph does not lose their positions', () => {
        const filtered = filterGraph(graph, new Set(['Guild']))

        expect(filtered.nodes[0]).toBe(doe)
        expect(filtered.nodes[1]).toBe(keep)
    })

    it('reads an endpoint force-graph has already replaced with a node object', () => {
        const substituted: LoreGraph = {
            nodes: [doe, guild],
            // force-graph swaps the id strings for the node objects themselves once
            // the simulation has run.
            links: [{ source: doe as never, target: guild as never, label: 'memberOf' }],
        }

        expect(filterGraph(substituted, new Set(['Guild'])).links).toHaveLength(0)
    })

    it('empties the graph when every type is hidden', () => {
        const filtered = filterGraph(graph, new Set(['Character', 'Guild', 'Location']))

        expect(filtered.nodes).toEqual([])
        expect(filtered.links).toEqual([])
    })
})

describe('matchingNodeIds', () => {
    const nodes = [
        node({ id: 'doe', label: 'Jane Doe', types: ['Character'] }),
        node({ id: 'guild', label: 'Example Guild', types: ['Guild', 'Organization'] }),
    ]

    it('answers null for an empty term -- no search running, not nothing matched', () => {
        expect(matchingNodeIds(nodes, '')).toBeNull()
        expect(matchingNodeIds(nodes, '   ')).toBeNull()
    })

    it('matches on a label, case-insensitively', () => {
        expect(matchingNodeIds(nodes, 'jane')).toEqual(new Set(['doe']))
    })

    it('matches on a class the node carries, not just its label', () => {
        expect(matchingNodeIds(nodes, 'organization')).toEqual(new Set(['guild']))
    })

    it('answers an empty set when a real term matches nothing', () => {
        expect(matchingNodeIds(nodes, 'nobody')).toEqual(new Set())
    })

    it('treats a regex metacharacter as plain text rather than a pattern', () => {
        expect(matchingNodeIds(nodes, '.*')).toEqual(new Set())
    })
})
