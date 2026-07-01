import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch } from './apiFetch'

describe('apiFetch', () => {
  beforeEach(() => {
    sessionStorage.setItem('jwt_token', 'test-token')
    vi.spyOn(window, 'fetch')
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('returns the response unchanged when status is not 401', async () => {
    vi.mocked(window.fetch).mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const response = await apiFetch('/test')

    expect(response.status).toBe(200)
    expect(sessionStorage.getItem('jwt_token')).toBe('test-token')
  })

  it('clears the token and dispatches auth:expired on 401', async () => {
    vi.mocked(window.fetch).mockResolvedValueOnce(new Response('', { status: 401 }))

    const expiredHandler = vi.fn()
    window.addEventListener('auth:expired', expiredHandler)

    await apiFetch('/test')

    expect(sessionStorage.getItem('jwt_token')).toBeNull()
    expect(expiredHandler).toHaveBeenCalledOnce()

    window.removeEventListener('auth:expired', expiredHandler)
  })
})
