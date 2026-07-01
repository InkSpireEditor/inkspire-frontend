export const API_URL = import.meta.env.VITE_API_URL;
export const AUTH_URL = import.meta.env.VITE_AUTH_URL;

const TOKEN_KEY = 'jwt_token';

export const getToken = (): string | null => sessionStorage.getItem(TOKEN_KEY)
export const setToken = (token: string): void => sessionStorage.setItem(TOKEN_KEY, token)
export const clearToken = (): void => sessionStorage.removeItem(TOKEN_KEY)

/**
 * Logs the user out by discarding the session token and notifying the app.
 * Dispatches 'auth:expired' so App.vue reactively returns to the login screen
 * without a full page reload. JWT is stateless — server-side revocation
 * requires a token blocklist (see S-10).
 */
export const logout = (): void => {
  clearToken()
  window.dispatchEvent(new Event('auth:expired'))
}

export const getAuthHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
})
