import { describe, it, expect } from 'vitest'
import { palette, faded, nodeRadius, esc, tooltipHtml, endpointId } from './loreGraph'
import type { LoreNode } from './lore'

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
