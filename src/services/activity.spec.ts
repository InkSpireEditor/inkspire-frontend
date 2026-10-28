import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { activityService } from './activity'

const API_URL = 'http://localhost:8000/api'

const jsonHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
}

describe('activityService', () => {
    const fetchSpy = vi.spyOn(window, 'fetch')

    beforeEach(() => {
        fetchSpy.mockReset()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('get', () => {
        it('sends a GET request for 364 days by default', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => [],
            } as Response)

            await activityService.get()

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/activity?days=364`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('answers the days the route returns', async () => {
            const days = [
                { date: '2026-10-27', words: 100 },
                { date: '2026-10-28', words: 40 },
            ]
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => days,
            } as Response)

            expect(await activityService.get(30)).toEqual(days)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/activity?days=30`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('surfaces the body\'s message on a non-ok response', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ code: 500, message: 'not a repository' }),
            } as Response)

            await expect(activityService.get()).rejects.toThrow('not a repository')
        })

        it('falls back to a plain message when the response carries no body', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error('not JSON')
                },
            } as unknown as Response)

            await expect(activityService.get()).rejects.toThrow('Failed to load the activity')
        })
    })
})
