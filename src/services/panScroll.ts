import { ref, type Ref } from 'vue'

/**
 * Click-and-drag panning for a scrolling element (frontend#34).
 *
 * Moves the element's own `scrollLeft`/`scrollTop`, so its native scrollbars follow a drag and
 * keep working for a long jump. Only a mouse's primary button pans: a touch screen already
 * scrolls natively, and a second button means something else.
 *
 * A gesture is a click until the pointer has moved `PAN_THRESHOLD_PX`, so a link inside the
 * element still opens. Past that, the pointer is captured -- not before, because capture
 * redirects the click that follows to the element and a plain click on a link would be lost --
 * and the click that ends the drag is swallowed.
 *
 * Kept out of the view so it can be tested without mounting anything.
 */

/** How far the pointer has to move before a press stops being a click and becomes a pan. */
export const PAN_THRESHOLD_PX = 4

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  startLeft: number
  startTop: number
  moved: boolean
}

export function usePanScroll(target: Ref<HTMLElement | null>) {
  /** True while a drag is under way (past the threshold), for the `grabbing` cursor. */
  const panning = ref(false)
  let gesture: Gesture | null = null
  let swallowClick = false

  const onPointerDown = (event: PointerEvent): void => {
    const element = target.value
    if (element === null || event.pointerType !== 'mouse' || event.button !== 0) return
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: element.scrollLeft,
      startTop: element.scrollTop,
      moved: false,
    }
    // A click that was never swallowed (the browser sent none) must not eat the next real one.
    swallowClick = false
  }

  const onPointerMove = (event: PointerEvent): void => {
    const element = target.value
    if (element === null || gesture === null || event.pointerId !== gesture.pointerId) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    if (!gesture.moved) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return
      gesture.moved = true
      panning.value = true
      element.setPointerCapture?.(event.pointerId)
    }
    element.scrollLeft = gesture.startLeft - dx
    element.scrollTop = gesture.startTop - dy
  }

  const onPointerUp = (event: PointerEvent): void => {
    const element = target.value
    if (gesture === null || event.pointerId !== gesture.pointerId) return
    if (gesture.moved) {
      swallowClick = true
      element?.releasePointerCapture?.(event.pointerId)
    }
    gesture = null
    panning.value = false
  }

  /** Bound in the capture phase, so it runs before a link inside the element sees the click. */
  const onClickCapture = (event: MouseEvent): void => {
    if (!swallowClick) return
    swallowClick = false
    event.stopPropagation()
    event.preventDefault()
  }

  return { panning, onPointerDown, onPointerMove, onPointerUp, onClickCapture }
}
