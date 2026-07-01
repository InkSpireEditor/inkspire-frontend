import { clearToken } from './api';

/**
 * Thin fetch wrapper that intercepts 401 responses globally.
 * When a 401 is received the stored token is cleared and an 'auth:expired'
 * event is dispatched so App.vue can return the user to the login screen.
 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options)
  if (response.status === 401) {
    clearToken()
    window.dispatchEvent(new Event('auth:expired'))
  }
  return response
}
