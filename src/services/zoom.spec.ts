import { describe, it, expect } from 'vitest'
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  anchoredScroll,
  clampZoom,
  stepZoom,
  wheelZoom
} from './zoom'

describe('clampZoom', () => {
  it('leaves a zoom inside the range alone', () => {
    expect(clampZoom(1)).toBe(1)
  })

  it('holds a zoom to the limits', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN)
    expect(clampZoom(10)).toBe(ZOOM_MAX)
  })
})

describe('stepZoom', () => {
  it('multiplies by the step to zoom in and divides to zoom out', () => {
    expect(stepZoom(1, 1)).toBe(ZOOM_STEP)
    expect(stepZoom(1, -1)).toBeCloseTo(1 / ZOOM_STEP)
  })

  it('stops at the limits', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  })

  it('returns to the start after a step in and a step out', () => {
    expect(stepZoom(stepZoom(1, 1), -1)).toBeCloseTo(1)
  })
})

describe('wheelZoom', () => {
  it('zooms in on a wheel scrolled up, and out on one scrolled down', () => {
    expect(wheelZoom(1, -100, 0)).toBeGreaterThan(1)
    expect(wheelZoom(1, 100, 0)).toBeLessThan(1)
  })

  it('moves about one button step for one mouse wheel notch', () => {
    expect(wheelZoom(1, -100, 0)).toBeCloseTo(ZOOM_STEP, 1)
  })

  it('moves by about the same for a Firefox line-based notch', () => {
    expect(wheelZoom(1, -3, 1)).toBeCloseTo(wheelZoom(1, -99, 0), 1)
  })

  it('moves less for a small trackpad event than for a notch', () => {
    expect(wheelZoom(1, -4, 0)).toBeLessThan(wheelZoom(1, -100, 0))
  })

  it('stops at the limits', () => {
    expect(wheelZoom(ZOOM_MAX, -1000, 0)).toBe(ZOOM_MAX)
    expect(wheelZoom(ZOOM_MIN, 1000, 0)).toBe(ZOOM_MIN)
  })
})

describe('anchoredScroll', () => {
  it('keeps the point under the anchor in place', () => {
    // 300px scrolled, anchor 100px in from the edge: the content point under it is 400.
    // Doubled, that point is 800, and showing it at 100 means scrolling to 700.
    expect(anchoredScroll(300, 100, 2)).toBe(700)
  })

  it('scrolls back toward the start when zooming out', () => {
    // The point 400 becomes 200; at an anchor of 100 the scroll is 100.
    expect(anchoredScroll(300, 100, 0.5)).toBe(100)
  })

  it('does not move when the zoom does not change', () => {
    expect(anchoredScroll(300, 100, 1)).toBe(300)
  })

  it('anchored at the left edge of an unscrolled view, stays at the start', () => {
    expect(anchoredScroll(0, 0, 2)).toBe(0)
  })
})
