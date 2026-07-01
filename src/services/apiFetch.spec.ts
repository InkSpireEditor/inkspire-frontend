import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch } from './apiFetch'

/**
 * The refresh-retry state machine is the linchpin of cookie-based auth, so the
 * cases that bite in production are pinned here: the happy path, the bounded
 * retry (no infinite loop), refresh failure, and concurrent de-duplication.
 */
describe('apiFetch', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Simulate an active session via the readable auth flag cookie.
    document.cookie = 'auth_status=1; Path=/'
    fetchMock = vi.spyOn(window, 'fetch')
  })

  afterEach(() => {
    document.cookie = 'auth_status=; Path=/; Max-Age=0'
    vi.restoreAllMocks()
  })

  it('returns the response unchanged when status is not 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const response = await apiFetch('/api/data')

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // A live session flag is untouched on a non-401.
    expect(document.cookie).toContain('auth_status=1')
  })

  it('refreshes then retries once on 401, returning the retried response', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 })) // original
      .mockResolvedValueOnce(new Response('', { status: 200 })) // POST /auth/refresh
      .mockResolvedValueOnce(new Response('retried', { status: 200 })) // retry

    const expiredHandler = vi.fn()
    window.addEventListener('auth:expired', expiredHandler)

    const response = await apiFetch('/api/data')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('retried')
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // The refresh must be a POST that sends the httpOnly cookie.
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    // A recovered request is not an expiry.
    expect(expiredHandler).not.toHaveBeenCalled()

    window.removeEventListener('auth:expired', expiredHandler)
  })

  it('does not loop when the retried request also returns 401', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 })) // original
      .mockResolvedValueOnce(new Response('', { status: 200 })) // refresh ok
      .mockResolvedValueOnce(new Response('', { status: 401 })) // retry still 401

    const expiredHandler = vi.fn()
    window.addEventListener('auth:expired', expiredHandler)

    const response = await apiFetch('/api/data')

    expect(response.status).toBe(401)
    // Exactly one retry: original + refresh + retry === 3 calls, no more.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(expiredHandler).toHaveBeenCalledOnce()
    expect(document.cookie).not.toContain('auth_status=1')

    window.removeEventListener('auth:expired', expiredHandler)
  })

  it('expires the session and does not retry when the refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 })) // original
      .mockResolvedValueOnce(new Response('', { status: 401 })) // refresh fails

    const expiredHandler = vi.fn()
    window.addEventListener('auth:expired', expiredHandler)

    const response = await apiFetch('/api/data')

    expect(response.status).toBe(401)
    // No retry attempted: original + failed refresh === 2 calls.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(expiredHandler).toHaveBeenCalledOnce()
    expect(document.cookie).not.toContain('auth_status=1')

    window.removeEventListener('auth:expired', expiredHandler)
  })

  it('treats a rejected refresh request as a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 })) // original
      .mockRejectedValueOnce(new Error('network down')) // refresh throws

    const expiredHandler = vi.fn()
    window.addEventListener('auth:expired', expiredHandler)

    const response = await apiFetch('/api/data')

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(expiredHandler).toHaveBeenCalledOnce()

    window.removeEventListener('auth:expired', expiredHandler)
  })

  it('shares a single refresh across concurrent 401s', async () => {
    let releaseRefresh!: () => void
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })

    // Per-URL call count: first hit 401, subsequent (retry) 200.
    const counts: Record<string, number> = {}

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/refresh')) {
        await refreshGate
        return new Response('', { status: 200 })
      }
      counts[url] = (counts[url] ?? 0) + 1
      return new Response('', { status: counts[url] === 1 ? 401 : 200 })
    })

    const p1 = apiFetch('/api/a')
    const p2 = apiFetch('/api/b')

    // Let both originals resolve to 401 and register their refresh interest.
    await Promise.resolve()
    await Promise.resolve()
    releaseRefresh()

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)

    const refreshCalls = fetchMock.mock.calls.filter(([input]: [RequestInfo | URL, ...unknown[]]) =>
      String(input).includes('/auth/refresh'),
    )
    expect(refreshCalls).toHaveLength(1)
  })
})
