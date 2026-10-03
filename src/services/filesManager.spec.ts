import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { filesManagerService, HoldsError, NotFoundError } from './filesManager'
import type { ProvenanceMetadata } from './provenance'

const API_URL = 'http://localhost:8000/api'

// Headers every JSON request carries. The JWT is no longer sent as a bearer
// token — it rides along as an httpOnly cookie via credentials: 'include'.
const jsonHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
}

describe('filesManagerService', () => {
    const fetchSpy = vi.spyOn(window, 'fetch')

    beforeEach(() => {
        fetchSpy.mockReset()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('getTree', () => {
        it('should send GET request with correct URL, headers and credentials', async () => {
            const mockResponse = {
                dirs: [{
                    id: "1", name: "DirA", summary: "",
                    files: [{ id: "3", name: "NestedFileA", status: "" }],
                }],
                files: [{ id: "2", name: "FileRoot", status: "" }],
            }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getTree('stories')

            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/tree`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('should handle empty response', async () => {
            const mockResponse = { dirs: [], files: [] }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getTree('stories')
            expect(response).toEqual(mockResponse)
        })

        it('should handle HTTP error', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Server Error',
            } as Response)

            await expect(filesManagerService.getTree('stories')).rejects.toThrow('Failed to fetch tree')
        })
    })

    describe('getDirContent', () => {
        it('should send GET request with correct URL, headers and credentials', async () => {
            const dirId = '5f0a1b2c3d4e5f60'
            const mockResponse = {
                id: dirId, name: "DirA", summary: "In one line.",
                files: [
                    { id: "10", name: "file1.txt", status: "", summary: "" },
                    { id: "11", name: "file2.txt", status: "draft", summary: "" },
                ],
            }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getDirContent('stories', dirId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/dir/${dirId}`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('should handle directory with no files', async () => {
            const dirId = '3a1b2c3d4e5f6071'
            const mockResponse = { id: dirId, name: "DirA", summary: "", files: [] }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getDirContent('stories', dirId)
            expect(response).toEqual(mockResponse)
        })

        it('should handle HTTP error', async () => {
            const dirId = '999999aabbccddee'

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            } as Response)

            await expect(filesManagerService.getDirContent('stories', dirId)).rejects.toThrow(`Failed to fetch content for dir ${dirId}`)
        })
    })

    describe('addFile', () => {
        it('should send POST request to create a root file', async () => {
            const fileName = 'new-root-file.txt'
            const mockResponse = { id: '100abcdef0123456', name: fileName }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.addFile('stories', fileName, null)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/file`, {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ name: fileName, dir: null }),
                credentials: 'include',
            })
        })

        it('should send POST request to create a nested file', async () => {
            const fileName = 'new-nested-file.txt'
            const dirId = '42abcdef01234567'
            const mockResponse = { id: '101abcdef0123456', name: fileName, dir: dirId }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.addFile('stories', fileName, dirId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/file`, {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ name: fileName, dir: dirId }),
                credentials: 'include',
            })
        })

        it('should handle HTTP error on file creation', async () => {
            const fileName = 'error-file.txt'

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
            } as Response)

            await expect(filesManagerService.addFile('stories', fileName, null)).rejects.toThrow('Failed to create file')
        })
    })

    describe('addDir', () => {
        it('should send POST request to create a root directory', async () => {
            const dirName = 'New Root Dir'
            const dirContext = 'New Dir Context'
            const mockResponse = { id: '200abcdef0123456', name: dirName }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.addDir('stories', dirName, dirContext)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/dir`, {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ name: dirName, summary: dirContext }),
                credentials: 'include',
            })
        })
    })

    describe('delFile', () => {
        it('should send DELETE request to delete a file', async () => {
            const fileId = '123abcdef0123456'
            const mockResponse = { message: "File deleted successfully" }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.delFile('stories', fileId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/file/${fileId}`, {
                method: 'DELETE',
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('should handle 204 No Content', async () => {
            const fileId = '123abcdef0123456'

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 204,
            } as Response)

            const response = await filesManagerService.delFile('stories', fileId)
            expect(response).toBeNull()
        })

        it('should handle HTTP error on file deletion', async () => {
            const fileId = '404abcdef0123456'

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
            } as Response)

            await expect(filesManagerService.delFile('stories', fileId)).rejects.toThrow('Failed to delete file')
        })
    })

    describe('delDir', () => {
        it('should send DELETE request to delete a directory', async () => {
            const dirId = '456abcdef0123456'
            const mockResponse = { message: "Directory deleted successfully" }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.delDir('stories', dirId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/dir/${dirId}`, {
                method: 'DELETE',
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('should handle 204 No Content', async () => {
            const dirId = '456abcdef0123456'

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 204,
            } as Response)

            const response = await filesManagerService.delDir('stories', dirId)
            expect(response).toBeNull()
        })

        it('should handle HTTP error on directory deletion', async () => {
            const dirId = '404abcdef0123456'

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
            } as Response)

            await expect(filesManagerService.delDir('stories', dirId)).rejects.toThrow('Failed to delete directory')
        })

        it('sends ?force=true only when asked', async () => {
            const dirId = '456abcdef0123456'
            fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 } as Response)

            await filesManagerService.delDir('stories', dirId, { force: true })

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/dir/${dirId}?force=true`, {
                method: 'DELETE',
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('throws a HoldsError naming what is in the way', async () => {
            const dirId = '456abcdef0123456'
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 409,
                json: async () => ({
                    code: 409,
                    message: '"Example Story" also holds lorebook, which deleting it would remove.',
                    holds: ['lorebook'],
                }),
            } as Response)

            const failure = filesManagerService.delDir('stories', dirId)
            await expect(failure).rejects.toBeInstanceOf(HoldsError)
            await expect(failure).rejects.toMatchObject({ holds: ['lorebook'] })
        })

        it('throws a plain Error, not a HoldsError, when the body carries no holds', async () => {
            const dirId = '456abcdef0123456'
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ code: 404, message: 'No story with that id.' }),
            } as Response)

            const failure = filesManagerService.delDir('stories', dirId)
            await expect(failure).rejects.not.toBeInstanceOf(HoldsError)
            await expect(failure).rejects.toThrow('No story with that id.')
        })
    })

    describe('getFileInfo', () => {
        it('should send GET request with correct URL and credentials', async () => {
            const fileId = '1abcdef012345678'
            const mockResponse = { id: '1abcdef012345678', name: "test.txt" }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getFileInfo('stories', fileId)
            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/file/${fileId}`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })
    })

    describe('getFileContent', () => {
        it('should send GET request and return text content', async () => {
            const fileId = '123abcdef0123456'
            const mockContent = 'File content here'

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                text: async () => mockContent,
            } as Response)

            const response = await filesManagerService.getFileContent('stories', fileId)
            expect(response).toBe(mockContent)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/file/${fileId}/contents`, {
                headers: { ...jsonHeaders, Accept: 'text/plain' },
                credentials: 'include',
            })
        })
    })

    describe('the document routes', () => {
        // Prose and provenance travel together in both directions, because a section
        // derived from the body may not be written without it.
        const fileId = 'd0cabcdef0123456'
        const metadata: ProvenanceMetadata = { '47f57caaa4fb330e': [[18, 45, 'gen']] }

        it('parses body, metadata and reconciled from a GET', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ body: 'Once.\n', metadata, reconciled: null }),
            } as Response)

            const answered = await filesManagerService.getDocument('stories', fileId)
            expect(answered).toEqual({ body: 'Once.\n', metadata, reconciled: null })
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/file/${fileId}/document`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('reads a null metadata as a file the editor has never saved', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ body: 'Once.\n', metadata: null, reconciled: null }),
            } as Response)

            const answered = await filesManagerService.getDocument('stories', fileId)
            expect(answered.metadata).toBeNull()
        })

        it('reads what a load had to put right', async () => {
            const reconciled = {
                revision: 'b3f08da',
                recovered: ['39f4ef4afdf22890'],
                reset: [],
                dropped: ['47f57caaa4fb330e'],
            }
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ body: 'Once.\n', metadata, reconciled }),
            } as Response)

            const answered = await filesManagerService.getDocument('stories', fileId)
            expect(answered.reconciled).toEqual(reconciled)
        })

        it('sends both parts in one PUT', async () => {
            fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response)

            await filesManagerService.putDocument('stories', fileId, 'Once.\n', metadata)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/file/${fileId}/document`, {
                method: 'PUT',
                headers: jsonHeaders,
                body: JSON.stringify({ body: 'Once.\n', metadata }),
                credentials: 'include',
            })
        })

        it('sends a null metadata to remove the section', async () => {
            fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response)

            await filesManagerService.putDocument('notes', fileId, 'Once.\n', null)
            const [, init] = fetchSpy.mock.calls[0] ?? []
            expect(JSON.parse(String(init?.body))).toEqual({ body: 'Once.\n', metadata: null })
        })

        it('serves both roots', async () => {
            fetchSpy.mockResolvedValue({
                ok: true,
                json: async () => ({ body: '', metadata: null, reconciled: null }),
            } as Response)

            await filesManagerService.getDocument('notes', fileId)
            expect(fetchSpy).toHaveBeenCalledWith(
                `${API_URL}/notes/file/${fileId}/document`,
                expect.anything(),
            )
        })
    })

    describe('a file the API does not have', () => {
        // Told apart from any other failure because it means the caller's id is out
        // of date -- renamed, deleted, pulled away -- which a caller can recover from.
        const fileId = '404abcdef0123456'

        beforeEach(() => {
            fetchSpy.mockResolvedValue({ ok: false, status: 404 } as Response)
        })

        it('is a NotFoundError from getFileInfo', async () => {
            await expect(
                filesManagerService.getFileInfo('stories', fileId)
            ).rejects.toBeInstanceOf(NotFoundError)
        })

        it('is a NotFoundError from getFileContent', async () => {
            await expect(
                filesManagerService.getFileContent('stories', fileId)
            ).rejects.toBeInstanceOf(NotFoundError)
        })

        it('is a NotFoundError from getDocument', async () => {
            await expect(
                filesManagerService.getDocument('stories', fileId)
            ).rejects.toBeInstanceOf(NotFoundError)
        })

        it('is a NotFoundError from putDocument', async () => {
            await expect(
                filesManagerService.putDocument('stories', fileId, 'x', null)
            ).rejects.toBeInstanceOf(NotFoundError)
        })

        it('is a plain Error for any other failing status', async () => {
            fetchSpy.mockResolvedValue({ ok: false, status: 500 } as Response)
            const failure = filesManagerService.getFileContent('stories', fileId)
            await expect(failure).rejects.not.toBeInstanceOf(NotFoundError)
            await expect(failure).rejects.toThrow('Failed to fetch file content')
        })
    })

})

describe('the two spaces', () => {
    const fetchSpy = vi.spyOn(window, 'fetch')

    beforeEach(() => {
        fetchSpy.mockReset()
        fetchSpy.mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    })

    it('reads each tree from its own route', async () => {
        await filesManagerService.getTree('stories')
        expect(fetchSpy).toHaveBeenLastCalledWith(`${API_URL}/stories/tree`, expect.anything())

        await filesManagerService.getTree('notes')
        expect(fetchSpy).toHaveBeenLastCalledWith(`${API_URL}/notes/tree`, expect.anything())
    })

    it('creates a file at the root of the notes space', async () => {
        await filesManagerService.addFile('notes', 'Scratch Pad', null)

        expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/notes/file`, expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ name: 'Scratch Pad', dir: null }),
        }))
    })

    it('reads a note through the notes routes', async () => {
        const id = '0123456789abcdef'
        await filesManagerService.getFileInfo('notes', id)
        expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/notes/file/${id}`, expect.anything())
    })

    describe('reorderChapters', () => {
        it('sends the whole order to the story it belongs to', async () => {
            const dirId = '5f0a1b2c3d4e5f60'
            const order = ['1111111111111111', '2222222222222222']
            const mockResponse = {
                id: dirId, name: 'Example Story', summary: '', files: [],
            }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.reorderChapters(dirId, order)

            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(
                `${API_URL}/stories/dir/${dirId}/chapters`,
                {
                    method: 'PUT',
                    headers: jsonHeaders,
                    credentials: 'include',
                    body: JSON.stringify({ order }),
                },
            )
        })

        it('handles HTTP error', async () => {
            fetchSpy.mockResolvedValueOnce({ ok: false, status: 422 } as Response)

            await expect(
                filesManagerService.reorderChapters('5f0a1b2c3d4e5f60', ['x']),
            ).rejects.toThrow('Failed to reorder chapters')
        })
    })

    describe('setFileStatus', () => {
        it('sends only the status, so no rename is implied', async () => {
            const id = '0123456789abcdef'
            fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)

            await filesManagerService.setFileStatus('stories', id, 'draft')

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/file/${id}`, {
                method: 'PUT',
                headers: jsonHeaders,
                credentials: 'include',
                body: JSON.stringify({ status: 'draft' }),
            })
        })

        it('sends an empty string to clear a status', async () => {
            fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)

            await filesManagerService.setFileStatus('notes', '0123456789abcdef', '')

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/notes/file/'),
                expect.objectContaining({ body: JSON.stringify({ status: '' }) }),
            )
        })
    })
})
