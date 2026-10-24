/**
 * The arithmetic behind zooming a scrolling drawing (frontend#45), as plain functions so it is
 * testable without a DOM -- the same split as `panScroll.ts` and `cursor.ts`.
 */

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 2
/** What one press of the + or - button multiplies the zoom by. */
export const ZOOM_STEP = 1.25

/** How much one wheel unit changes the zoom, as an exponent: a mouse wheel notch is 100 units. */
const WHEEL_SENSITIVITY = 0.002
/** Firefox reports a wheel notch as about 3 lines rather than 100 pixels. */
const LINES_TO_PIXELS = 33

export const clampZoom = (zoom: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))

/** The zoom one button press away: `1` zooms in, `-1` out. */
export const stepZoom = (zoom: number, direction: 1 | -1): number =>
  clampZoom(direction === 1 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP)

/**
 * The zoom after one wheel event. Exponential in the wheel's distance, so a trackpad pinch (many
 * small events) and a mouse wheel (a few large ones) both move at a sensible rate. Scrolling
 * the wheel up (negative `deltaY`) zooms in.
 */
export const wheelZoom = (zoom: number, deltaY: number, deltaMode: number): number => {
  const pixels = deltaMode === 1 ? deltaY * LINES_TO_PIXELS : deltaY
  return clampZoom(zoom * Math.exp(-pixels * WHEEL_SENSITIVITY))
}

/**
 * The scroll offset that keeps the point under `anchor` where it is when the content scales by
 * `ratio`. `anchor` is measured from the scrolling element's own edge, not from the content's:
 * the content point under it is `scroll + anchor`, which scales to `(scroll + anchor) * ratio`,
 * and the element has to show that point at `anchor` again.
 */
export const anchoredScroll = (scroll: number, anchor: number, ratio: number): number =>
  (scroll + anchor) * ratio - anchor
