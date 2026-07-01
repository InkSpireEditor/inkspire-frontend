import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { filesManagerService } from './filesManager'

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
                dirs: { "1": { name: "DirA" } },
                files: { "2": { name: "FileRoot" } },
            }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getTree()

            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/tree`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('should handle empty response', async () => {
            const mockResponse = { dirs: {}, files: {} }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getTree()
            expect(response).toEqual(mockResponse)
        })

        it('should handle HTTP error', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Server Error',
            } as Response)

            await expect(filesManagerService.getTree()).rejects.toThrow('Failed to fetch tree')
        })
    })

    describe('getDirContent', () => {
        it('should send GET request with correct URL, headers and credentials', async () => {
            const dirId = 5
            const mockResponse = {
                files: {
                    "10": { name: "file1.txt" },
                    "11": { name: "file2.txt" },
                },
            }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getDirContent(dirId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/dir/${dirId}`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('should handle directory with no files', async () => {
            const dirId = 3
            const mockResponse = { files: {} }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getDirContent(dirId)
            expect(response).toEqual(mockResponse)
        })

        it('should handle HTTP error', async () => {
            const dirId = 999

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            } as Response)

            await expect(filesManagerService.getDirContent(dirId)).rejects.toThrow(`Failed to fetch content for dir ${dirId}`)
        })
    })

    describe('addFile', () => {
        it('should send POST request to create a root file', async () => {
            const fileName = 'new-root-file.txt'
            const mockResponse = { id: 100, name: fileName }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.addFile(fileName, null)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file`, {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ name: fileName, dir: null }),
                credentials: 'include',
            })
        })

        it('should send POST request to create a nested file', async () => {
            const fileName = 'new-nested-file.txt'
            const dirId = 42
            const mockResponse = { id: 101, name: fileName, dir: dirId }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.addFile(fileName, dirId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file`, {
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

            await expect(filesManagerService.addFile(fileName, null)).rejects.toThrow('Failed to create file')
        })
    })

    describe('addDir', () => {
        it('should send POST request to create a root directory', async () => {
            const dirName = 'New Root Dir'
            const dirContext = 'New Dir Context'
            const mockResponse = { id: 200, name: dirName }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.addDir(dirName, dirContext, null)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/dir`, {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ name: dirName, summary: dirContext }),
                credentials: 'include',
            })
        })
    })

    describe('delFile', () => {
        it('should send DELETE request to delete a file', async () => {
            const fileId = 123
            const mockResponse = { message: "File deleted successfully" }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.delFile(fileId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file/${fileId}`, {
                method: 'DELETE',
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('should handle 204 No Content', async () => {
            const fileId = 123

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 204,
            } as Response)

            const response = await filesManagerService.delFile(fileId)
            expect(response).toBeNull()
        })

        it('should handle HTTP error on file deletion', async () => {
            const fileId = 404

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
            } as Response)

            await expect(filesManagerService.delFile(fileId)).rejects.toThrow('Failed to delete file')
        })
    })

    describe('delDir', () => {
        it('should send DELETE request to delete a directory', async () => {
            const dirId = 456
            const mockResponse = { message: "Directory deleted successfully" }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.delDir(dirId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/dir/${dirId}`, {
                method: 'DELETE',
                headers: jsonHeaders,
                credentials: 'include',
            })
        })

        it('should handle 204 No Content', async () => {
            const dirId = 456

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 204,
            } as Response)

            const response = await filesManagerService.delDir(dirId)
            expect(response).toBeNull()
        })

        it('should handle HTTP error on directory deletion', async () => {
            const dirId = 404

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
            } as Response)

            await expect(filesManagerService.delDir(dirId)).rejects.toThrow('Failed to delete directory')
        })
    })

    describe('getFileInfo', () => {
        it('should send GET request with correct URL and credentials', async () => {
            const fileId = 1
            const mockResponse = { id: 1, name: "test.txt" }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getFileInfo(fileId)
            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file/${fileId}`, {
                headers: jsonHeaders,
                credentials: 'include',
            })
        })
    })

    describe('getFileContent', () => {
        it('should send GET request and return text content', async () => {
            const fileId = 123
            const mockContent = 'File content here'

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                text: async () => mockContent,
            } as Response)

            const response = await filesManagerService.getFileContent(fileId)
            expect(response).toBe(mockContent)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file/${fileId}/contents`, {
                headers: { ...jsonHeaders, Accept: 'text/plain' },
                credentials: 'include',
            })
        })
    })

    describe('updateFileContent', () => {
        it('should send PUT request with text body', async () => {
            const fileId = 1
            const content = 'new content'

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => 'Success',
            } as Response)

            const response = await filesManagerService.updateFileContent(fileId, content)
            expect(response).toBe('Success')
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file/${fileId}/contents`, {
                method: 'PUT',
                headers: { ...jsonHeaders, 'Content-Type': 'text/plain' },
                body: content,
                credentials: 'include',
            })
        })
    })

})
