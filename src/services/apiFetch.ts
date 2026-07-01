import { AUTH_URL, clearAuthStatus } from './api';

/**
 * A single in-flight refresh shared across concurrent callers. A burst of 401s
 * (e.g. Tree.vue firing getTree + several getDirContent in parallel) must
 * trigger exactly one POST /auth/refresh, not one per request — otherwise the
 * refresh token gets rotated several times and all but the first refresh fail.
 */
let refreshPromise: Promise<boolean> | null = null

/**
 * Attempts to mint a fresh JWT from the httpOnly refresh_token cookie.
 * Resolves true on success, false on any failure. Concurrent callers await the
 * same request; the slot is released once it settles so a later 401 can retry.
 */
function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${AUTH_URL}/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function handleAuthExpired(): void {
  clearAuthStatus()
  window.dispatchEvent(new Event('auth:expired'))
}

/**
 * fetch wrapper with transparent JWT refresh.
 *
 * On a 401 it attempts a single refresh via the refresh_token cookie. If that
 * succeeds the original request is retried exactly once; if the retry also 401s,
 * or the refresh itself fails, the session is cleared and an 'auth:expired'
 * event is dispatched so App.vue returns to the login screen. The retry is
 * bounded to one attempt, so an unrecoverable 401 can never spin into a loop.
 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const requestOptions: RequestInit = { ...options, credentials: 'include' }

  const response = await fetch(url, requestOptions)
  if (response.status !== 401) {
    return response
  }

  const refreshed = await refreshSession()
  if (!refreshed) {
    handleAuthExpired()
    return response
  }

  const retryResponse = await fetch(url, requestOptions)
  if (retryResponse.status === 401) {
    handleAuthExpired()
  }
  return retryResponse
}
