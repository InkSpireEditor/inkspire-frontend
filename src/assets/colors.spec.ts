/// <reference types="node" />
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// docs/colors.md is the chart of every colour token in base.css. These tests fail when the two
// disagree, so a colour cannot be added, removed or changed without the chart changing too.

// Vitest runs from the project root (vitest.config.ts sets `root`).
const root = process.cwd()
const css = readFileSync(resolve(root, 'src/assets/base.css'), 'utf8')
const chart = readFileSync(resolve(root, 'docs/colors.md'), 'utf8')

type Theme = 'light' | 'dark'
type Tokens = Record<string, string>

const declarations = (body: string): Tokens => {
  const tokens: Tokens = {}
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]!] = m[2]!.trim()
  }
  return tokens
}

const light: Tokens = {}
const dark: Tokens = {}
for (const m of css.matchAll(/(:root|body\.dark-theme)\s*\{([\s\S]*?)\n\}/g)) {
  Object.assign(m[1] === ':root' ? light : dark, declarations(m[2]!))
}

const resolveToken = (token: string, theme: Theme): string => {
  const env = theme === 'dark' ? { ...light, ...dark } : light
  let value = env[token] ?? ''
  for (let m = value.match(/^var\((--[a-z0-9-]+)\)$/); m; m = value.match(/^var\((--[a-z0-9-]+)\)$/)) {
    value = env[m[1]!] ?? ''
  }
  return value
}

const isColour = (value: string): boolean => /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(value)

const colourTokens = Object.keys(light).filter((t) => isColour(resolveToken(t, 'light')))
const baseTokens = colourTokens.filter((t) => t.startsWith('--ink-c-'))
const semanticTokens = colourTokens.filter((t) => !t.startsWith('--ink-c-'))

/** The fill a swatch SVG should carry for a resolved value. */
const expectedFill = (value: string): string => {
  const rgba = value.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/)
  return rgba
    ? `fill="rgb(${rgba[1]},${rgba[2]},${rgba[3]})" fill-opacity="${rgba[4]}"`
    : `fill="${value.toLowerCase()}"`
}

const swatch = (file: string): string =>
  readFileSync(resolve(root, 'docs/colors', file), 'utf8')

describe('docs/colors.md', () => {
  it('has a row for every colour token in base.css', () => {
    for (const token of colourTokens) {
      expect(chart, `${token} is missing from the chart`).toContain(`| \`${token}\` |`)
    }
  })

  it('has no row for a token base.css no longer defines', () => {
    const rows = [...chart.matchAll(/^\| `(--[a-z0-9-]+)` \|/gm)].map((m) => m[1]!)
    const known = new Set([...Object.keys(light), ...Object.keys(dark)])
    for (const token of rows) {
      expect(known.has(token), `${token} is in the chart but not in base.css`).toBe(true)
    }
  })

  it('shows each base colour with its value', () => {
    for (const token of baseTokens) {
      const file = `${token.slice(2)}.svg`
      expect(chart).toContain(`colors/${file}`)
      expect(existsSync(resolve(root, 'docs/colors', file)), file).toBe(true)
      expect(swatch(file), file).toContain(expectedFill(resolveToken(token, 'light')))
    }
  })

  it('shows each semantic token in both themes, with the right fill', () => {
    for (const token of semanticTokens) {
      for (const theme of ['light', 'dark'] as const) {
        const file = `${token.slice(2)}-${theme}.svg`
        expect(chart).toContain(`colors/${file}`)
        expect(existsSync(resolve(root, 'docs/colors', file)), file).toBe(true)
        expect(swatch(file), file).toContain(expectedFill(resolveToken(token, theme)))
      }
    }
  })
})
