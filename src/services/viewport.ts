import { getCurrentInstance, onUnmounted, ref, type Ref } from 'vue'

/**
 * The one width below which the layout is the phone layout (frontend#51).
 *
 * A stylesheet cannot read a variable in a media query, so each component that changes at this
 * width writes the same `@media (max-width: 640px)`, and `viewport.spec.ts` fails if one of them
 * says another number. The script side asks the browser the same question through `useNarrow`.
 * Above this width the layout is the desktop one, tablets in portrait included.
 */
export const NARROW_QUERY = '(max-width: 640px)'

/**
 * Whether the window is narrow now, kept up to date while the calling component is mounted.
 *
 * Reads `matchMedia` when it is called, not when the module loads. A browser without it (jsdom,
 * for one) is never narrow.
 */
export function useNarrow(): Ref<boolean> {
  const narrow = ref(false)
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return narrow

  const query = window.matchMedia(NARROW_QUERY)
  narrow.value = query.matches
  const onChange = (event: MediaQueryListEvent): void => {
    narrow.value = event.matches
  }
  query.addEventListener('change', onChange)
  if (getCurrentInstance() !== null) {
    onUnmounted(() => query.removeEventListener('change', onChange))
  }
  return narrow
}
