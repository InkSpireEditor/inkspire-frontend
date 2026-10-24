/// <reference types="node" />
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { ICONS } from './icons'

// docs/icons.md is the chart of every icon in icons.ts. These tests fail when the two disagree, so
// an icon cannot be added, removed or changed without the chart changing too.

// Vitest runs from the project root (vitest.config.ts sets `root`).
const root = process.cwd()
const chart = readFileSync(resolve(root, 'docs/icons.md'), 'utf8')
const names = Object.keys(ICONS) as (keyof typeof ICONS)[]

describe('icons.ts', () => {
  it('gives every icon a Unicode codepoint, a viewBox and an outline', () => {
    for (const name of names) {
      const icon = ICONS[name]
      expect(icon.codepoint, name).toMatch(/^U\+[0-9A-F]{4,6}$/)
      expect(icon.viewBox, name).toMatch(/^0 0 [\d.]+ [\d.]+$/)
      expect(icon.d, name).toMatch(/^M[-\d. LQZM]+Z$/)
    }
  })

  it('has no two icons with the same outline', () => {
    const outlines = names.map((name) => ICONS[name].d)
    expect(new Set(outlines).size).toBe(outlines.length)
  })
})

describe('docs/icons.md', () => {
  it('has a row for every icon, with its codepoint', () => {
    for (const name of names) {
      expect(chart, `${name} is missing from the chart`).toContain(
        `| \`${name}\` | \`${ICONS[name].codepoint}\` |`
      )
    }
  })

  it('has no row for an icon that icons.ts no longer defines', () => {
    const rows = [...chart.matchAll(/^\| !\[\]\(icons\/[^)]+\) \| `([^`]+)` \|/gm)].map((m) => m[1]!)
    for (const name of rows) {
      expect(name in ICONS, `${name} is in the chart but not in icons.ts`).toBe(true)
    }
  })

  it("has a swatch for every icon, drawn from the same outline", () => {
    for (const name of names) {
      const file = `docs/icons/${name}.svg`
      expect(chart).toContain(`icons/${name}.svg`)
      expect(existsSync(resolve(root, file)), file).toBe(true)
      expect(readFileSync(resolve(root, file), 'utf8'), file).toContain(`d="${ICONS[name].d}"`)
    }
  })
})
