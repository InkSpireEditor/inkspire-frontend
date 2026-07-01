export const API_URL = import.meta.env.VITE_API_URL;
export const AUTH_URL = import.meta.env.VITE_AUTH_URL;

/** Non-httpOnly flag cookie the backend sets alongside the httpOnly JWT cookie. */
const AUTH_STATUS_COOKIE = 'auth_status';

/**
 * True when the backend's non-httpOnly `auth_status` cookie is present. The JWT
 * itself lives in an httpOnly cookie that JS cannot read, so this flag is the
 * only client-visible signal of an active session.
 */
export const isLoggedIn = (): boolean =>
  document.cookie.split('; ').some((c) => c === `${AUTH_STATUS_COOKIE}=1`)

/**
 * Expires the client-readable auth flag. The httpOnly jwt_token / refresh_token
 * cookies can only be cleared by the server (via /auth/logout); this just drops
 * the flag so isLoggedIn() reports the session as ended.
 */
export const clearAuthStatus = (): void => {
  document.cookie = `${AUTH_STATUS_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`
}

/**
 * Logs out: asks the server to revoke the refresh token and clear its httpOnly
 * cookies, then drops the local auth flag and notifies the app via 'auth:expired'
 * so App.vue returns to the login screen. Local state is cleared even if the
 * network call fails.
 */
export const logout = async (): Promise<void> => {
  try {
    await fetch(`${AUTH_URL}/logout`, { method: 'POST', credentials: 'include' })
  } catch {
    // Ignore network failure — the client session is cleared regardless.
  }
  clearAuthStatus()
  window.dispatchEvent(new Event('auth:expired'))
}

/**
 * Standard JSON headers for API requests. No Authorization header: the JWT is
 * sent automatically as an httpOnly cookie via `credentials: 'include'`.
 */
export const jsonHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
})
