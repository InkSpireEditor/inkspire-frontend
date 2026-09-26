import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { timelineService } from './timeline'

const API_URL = 'http://localhost:8000/api'

const jsonHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
}

describe('timelineService', () => {
    const fetchSpy = vi.spyOn(window, 'fetch')

    beforeEach(() => {
        fetchSpy.mockReset()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('get', () => {
        it('sends a GET request to the story\'s timeline route', async () => {
            const storyId = '5f0a1b2c3d4e5f60'
            const mockResponse = {
                title: 'Example Timeline',
                maxHeight: 8.0,
                widthStep: 1,
                characters: [{ key: 'alpha', name: 'Jane Doe', color: 'blue', events: ['first'] }],
                events: [
                    {
                        key: 'first', date: '2001-01-01', description: 'First event',
                        characters: ['alpha'], href: '', x1: 1, y1: 0, x2: 3.75, y2: 1.5,
                    },
                ],
                arcs: [],
            }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await timelineService.get(storyId)

            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/dir/${storyId}/timeline`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('surfaces the body\'s message on a non-ok response', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ code: 404, message: 'This story has no timeline.yaml.' }),
            } as Response)

            await expect(timelineService.get('a1b2c3d4e5f60718')).rejects.toThrow(
                'This story has no timeline.yaml.'
            )
        })

        it('falls back to a plain message when the response carries no body', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error('not JSON')
                },
            } as unknown as Response)

            await expect(timelineService.get('a1b2c3d4e5f60718')).rejects.toThrow(
                'Failed to load the timeline'
            )
        })
    })
})
