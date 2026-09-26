import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    loreService,
    sectionHeadingsFor,
    CHARACTER_SECTION_HEADINGS,
    LOCATION_SECTION_HEADINGS,
    type LoreEntity,
} from './lore'

const API_URL = 'http://localhost:8000/api'

const jsonHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
}

describe('loreService', () => {
    const fetchSpy = vi.spyOn(window, 'fetch')

    beforeEach(() => {
        fetchSpy.mockReset()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('getGraph', () => {
        it("sends a GET request to the story's lore graph route", async () => {
            const storyId = '5f0a1b2c3d4e5f60'
            const mockResponse = {
                nodes: [{ id: 'https://example.test/entity#Doe', label: 'Jane Doe', type: 'Character', types: ['Character'], attrs: {}, degree: 1 }],
                links: [],
            }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await loreService.getGraph(storyId)

            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/dir/${storyId}/lore/graph`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it("surfaces the body's message on a non-ok response", async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ code: 404, message: "This story has no lorebook/lorebook.yaml." }),
            } as Response)

            await expect(loreService.getGraph('a1b2c3d4e5f60718')).rejects.toThrow(
                'This story has no lorebook/lorebook.yaml.'
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

            await expect(loreService.getGraph('a1b2c3d4e5f60718')).rejects.toThrow(
                'Failed to load the knowledge graph'
            )
        })
    })

    describe('getEntity', () => {
        it("sends a GET request to the entity's own route", async () => {
            const storyId = '5f0a1b2c3d4e5f60'
            const mockResponse = {
                id: 'https://example.test/entity#Doe', local: 'Doe', types: ['Entity', 'Character'],
                aka: [], sections: { personality: 'Steady.' }, name: 'Jane Doe', memberOf: ['Example Guild'],
            }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await loreService.getEntity(storyId, 'Doe')

            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/dir/${storyId}/lore/entity/Doe`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it("surfaces the body's message on a non-ok response", async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ code: 404, message: 'Nothing in this lorebook is called "Ghost".' }),
            } as Response)

            await expect(loreService.getEntity('a1b2c3d4e5f60718', 'Ghost')).rejects.toThrow(
                'Nothing in this lorebook is called "Ghost".'
            )
        })
    })
})

describe('sectionHeadingsFor', () => {
    function entity(types: string[]): LoreEntity {
        return { id: 'x', local: 'x', types, aka: [], sections: {} }
    }

    it('picks the character headings for a Character', () => {
        expect(sectionHeadingsFor(entity(['Entity', 'Character']))).toBe(CHARACTER_SECTION_HEADINGS)
    })

    it('picks the character headings for a SecondaryCharacter, since its ancestors are materialised', () => {
        expect(sectionHeadingsFor(entity(['Entity', 'Character', 'SecondaryCharacter']))).toBe(
            CHARACTER_SECTION_HEADINGS
        )
    })

    it('picks the location headings for a Location', () => {
        expect(sectionHeadingsFor(entity(['Entity', 'Location']))).toBe(LOCATION_SECTION_HEADINGS)
    })

    it('answers an empty map for neither', () => {
        expect(sectionHeadingsFor(entity(['Entity', 'Organization']))).toEqual({})
    })
})
