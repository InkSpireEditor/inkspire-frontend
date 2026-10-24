import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { PAN_THRESHOLD_PX, usePanScroll } from './panScroll'

/** What the composable reads and writes on an element; jsdom does no layout, so a plain object. */
function fakeElement(scrollLeft = 100, scrollTop = 50) {
  return {
    scrollLeft,
    scrollTop,
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  }
}

function pointer(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: 200,
    clientY: 120,
    ...overrides,
  } as PointerEvent
}

function click() {
  return { stopPropagation: vi.fn(), preventDefault: vi.fn() } as unknown as MouseEvent
}

function setup(element = fakeElement()) {
  const pan = usePanScroll(ref(element as unknown as HTMLElement))
  return { element, ...pan }
}

describe('usePanScroll', () => {
  it('scrolls the element opposite to the pointer, on both axes', () => {
    const { element, onPointerDown, onPointerMove } = setup()

    onPointerDown(pointer())
    onPointerMove(pointer({ clientX: 150, clientY: 130 }))

    // The pointer moved 50 left and 10 down, so the content follows it: scroll right 50, up 10.
    expect(element.scrollLeft).toBe(150)
    expect(element.scrollTop).toBe(40)
  })

  it('does nothing until the pointer has moved past the threshold', () => {
    const { element, panning, onPointerDown, onPointerMove } = setup()

    onPointerDown(pointer())
    onPointerMove(pointer({ clientX: 200 - (PAN_THRESHOLD_PX - 1) }))

    expect(element.scrollLeft).toBe(100)
    expect(panning.value).toBe(false)
    expect(element.setPointerCapture).not.toHaveBeenCalled()
  })

  it('captures the pointer once the drag starts, and releases it at the end', () => {
    const { element, panning, onPointerDown, onPointerMove, onPointerUp } = setup()

    onPointerDown(pointer())
    onPointerMove(pointer({ clientX: 150 }))
    expect(panning.value).toBe(true)
    expect(element.setPointerCapture).toHaveBeenCalledWith(1)

    onPointerUp(pointer({ clientX: 150 }))
    expect(panning.value).toBe(false)
    expect(element.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('lets the click through when the press never became a drag', () => {
    const { onPointerDown, onPointerMove, onPointerUp, onClickCapture } = setup()

    onPointerDown(pointer())
    onPointerMove(pointer({ clientX: 198 }))
    onPointerUp(pointer({ clientX: 198 }))

    const event = click()
    onClickCapture(event)
    expect(event.stopPropagation).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('swallows the click that ends a drag, and only that one', () => {
    const { onPointerDown, onPointerMove, onPointerUp, onClickCapture } = setup()

    onPointerDown(pointer())
    onPointerMove(pointer({ clientX: 150 }))
    onPointerUp(pointer({ clientX: 150 }))

    const ending = click()
    onClickCapture(ending)
    expect(ending.stopPropagation).toHaveBeenCalled()
    expect(ending.preventDefault).toHaveBeenCalled()

    const next = click()
    onClickCapture(next)
    expect(next.stopPropagation).not.toHaveBeenCalled()
  })

  it('does not let a click the browser never sent swallow the next real one', () => {
    const { onPointerDown, onPointerMove, onPointerUp, onClickCapture } = setup()

    onPointerDown(pointer())
    onPointerMove(pointer({ clientX: 150 }))
    onPointerUp(pointer({ clientX: 150 }))
    // No click arrives for that drag. The next press starts afresh.
    onPointerDown(pointer())
    onPointerUp(pointer())

    const event = click()
    onClickCapture(event)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('starts nothing for a touch pointer or a non-primary button', () => {
    const { element, panning, onPointerDown, onPointerMove } = setup()

    onPointerDown(pointer({ pointerType: 'touch' }))
    onPointerMove(pointer({ pointerType: 'touch', clientX: 100 }))
    onPointerDown(pointer({ button: 2 }))
    onPointerMove(pointer({ clientX: 100 }))

    expect(element.scrollLeft).toBe(100)
    expect(panning.value).toBe(false)
  })

  it('ignores moves from a different pointer than the one that pressed', () => {
    const { element, onPointerDown, onPointerMove } = setup()

    onPointerDown(pointer({ pointerId: 1 }))
    onPointerMove(pointer({ pointerId: 2, clientX: 100 }))

    expect(element.scrollLeft).toBe(100)
  })

  it('stops following the pointer after it is released', () => {
    const { element, onPointerDown, onPointerMove, onPointerUp } = setup()

    onPointerDown(pointer())
    onPointerMove(pointer({ clientX: 150 }))
    onPointerUp(pointer({ clientX: 150 }))
    onPointerMove(pointer({ clientX: 0 }))

    expect(element.scrollLeft).toBe(150)
  })

  it('does nothing when there is no element yet', () => {
    const pan = usePanScroll(ref(null))

    expect(() => {
      pan.onPointerDown(pointer())
      pan.onPointerMove(pointer({ clientX: 100 }))
      pan.onPointerUp(pointer())
    }).not.toThrow()
  })
})
