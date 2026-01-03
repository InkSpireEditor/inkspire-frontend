import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { filesManagerService } from './filesManager'

// Mock API_URL if it's not available in the test environment
// In the actual code: const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
// We assume the default for tests or mock import.meta.env
const API_URL = 'http://localhost:8000/api'

describe('filesManagerService', () => {
    // Mock global fetch
    const fetchSpy = vi.spyOn(window, 'fetch')

    beforeEach(() => {
        fetchSpy.mockReset()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('getTree', () => {
        it('should send GET request with correct URL and headers', async () => {
            const token = 'test-token-123'
            const mockResponse = {
                dirs: { "1": { name: "DirA" } },
                files: { "2": { name: "FileRoot" } },
            }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getTree(token)
            
            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/tree`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            })
        })

        it('should handle empty response', async () => {
            const token = 'test-token'
            const mockResponse = { dirs: {}, files: {} }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getTree(token)
            expect(response).toEqual(mockResponse)
        })

        it('should handle HTTP error', async () => {
            const token = 'test-token'

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Server Error',
            } as Response)

            await expect(filesManagerService.getTree(token)).rejects.toThrow('Failed to fetch tree')
        })
    })

    describe('getDirContent', () => {
        it('should send GET request with correct URL and headers', async () => {
            const dirId = 5
            const token = 'test-token-456'
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

            const response = await filesManagerService.getDirContent(token, dirId)
            expect(response).toEqual(mockResponse)
            
            // Note: URL fixed to remove /content
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/dir/${dirId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            })
        })

        it('should handle directory with no files', async () => {
            const dirId = 3
            const token = 'test-token'
            const mockResponse = { files: {} }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getDirContent(token, dirId)
            expect(response).toEqual(mockResponse)
        })

        it('should handle HTTP error', async () => {
            const dirId = 999
            const token = 'test-token'

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            } as Response)

            await expect(filesManagerService.getDirContent(token, dirId)).rejects.toThrow(`Failed to fetch content for dir ${dirId}`)
        })
    })

    // Note: getFileInfo is not explicitly exported/used in the Vue service shown in previous contexts 
    // (except maybe I missed it or it wasn't pasted in the main block), 
    // but the Angular spec has it. 
    // Checking filesManager.ts content from previous turn: IT IS MISSING in the Vue service!
    // The Vue service has: getTree, getDirContent, addFile, addDir, editFile, editDir, delFile, delDir, logout.
    // It DOES NOT have getFileInfo, getFileContent, updateFileContent.
    // I will SKIP these tests and report them as missing.

    describe('addFile', () => {
        it('should send POST request to create a root file', async () => {
            const token = 'test-token'
            const fileName = 'new-root-file.txt'
            const mockResponse = { id: 100, name: fileName }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.addFile(token, fileName, null)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file`, {
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${token}`
                }),
                body: JSON.stringify({ name: fileName, dir: null }) // Updated param: dir
            })
        })

        it('should send POST request to create a nested file', async () => {
            const token = 'test-token'
            const fileName = 'new-nested-file.txt'
            const dirId = 42
            const mockResponse = { id: 101, name: fileName, dir: dirId }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.addFile(token, fileName, dirId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file`, {
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${token}`
                }),
                body: JSON.stringify({ name: fileName, dir: dirId }) // Updated param: dir
            })
        })

        it('should handle HTTP error on file creation', async () => {
            const token = 'test-token'
            const fileName = 'error-file.txt'

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
            } as Response)

            await expect(filesManagerService.addFile(token, fileName, null)).rejects.toThrow('Failed to create file')
        })
    })

    describe('addDir', () => {
        it('should send POST request to create a root directory', async () => {
            const token = 'test-token'
            const dirName = 'New Root Dir'
            const dirContext = 'New Dir Context'
            const mockResponse = { id: 200, name: dirName }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.addDir(token, dirName, dirContext, null)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/dir`, {
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${token}`
                }),
                body: JSON.stringify({ name: dirName, summary: dirContext }) // Updated param: summary
            })
        })
    })

    describe('delFile', () => {
        it('should send DELETE request to delete a file', async () => {
            const token = 'test-token'
            const fileId = 123
            const mockResponse = { message: "File deleted successfully" }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.delFile(token, fileId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file/${fileId}`, {
                method: 'DELETE',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${token}`
                })
            })
        })

        it('should handle 204 No Content', async () => {
            const token = 'test-token'
            const fileId = 123

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 204,
                // json() should not be called
            } as Response)

            const response = await filesManagerService.delFile(token, fileId)
            expect(response).toBeNull()
        })

        it('should handle HTTP error on file deletion', async () => {
            const token = 'test-token'
            const fileId = 404

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
            } as Response)

            await expect(filesManagerService.delFile(token, fileId)).rejects.toThrow('Failed to delete file')
        })
    })

    describe('delDir', () => {
        it('should send DELETE request to delete a directory', async () => {
            const token = 'test-token'
            const dirId = 456
            const mockResponse = { message: "Directory deleted successfully" }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.delDir(token, dirId)
            expect(response).toEqual(mockResponse)

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/dir/${dirId}`, {
                method: 'DELETE',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${token}`
                })
            })
        })

        it('should handle 204 No Content', async () => {
            const token = 'test-token'
            const dirId = 456

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 204,
            } as Response)

            const response = await filesManagerService.delDir(token, dirId)
            expect(response).toBeNull()
        })

        it('should handle HTTP error on directory deletion', async () => {
            const token = 'test-token'
            const dirId = 404

            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
            } as Response)

            await expect(filesManagerService.delDir(token, dirId)).rejects.toThrow('Failed to delete directory')
        })
    })

    describe('getFileInfo', () => {
        it('should send GET request with correct URL and headers', async () => {
            const fileId = 1
            const token = 'test-token'
            const mockResponse = { id: 1, name: "test.txt" }

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const response = await filesManagerService.getFileInfo(token, fileId)
            expect(response).toEqual(mockResponse)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file/${fileId}`, {
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${token}`
                })
            })
        })
    })

    describe('getFileContent', () => {
        it('should send GET request and return text content', async () => {
            const fileId = 123
            const token = 'test-token'
            const mockContent = 'File content here'

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                text: async () => mockContent,
            } as Response)

            const response = await filesManagerService.getFileContent(token, fileId)
            expect(response).toBe(mockContent)
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file/${fileId}/contents`, {
                headers: expect.objectContaining({
                    'Accept': 'text/plain',
                    'Authorization': `Bearer ${token}`
                })
            })
        })
    })

    describe('updateFileContent', () => {
        it('should send POST request with text body', async () => {
            const fileId = 1
            const token = 'test-token'
            const content = 'new content'

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => 'Success',
            } as Response)

            const response = await filesManagerService.updateFileContent(token, fileId, content)
            expect(response).toBe('Success')
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/file/${fileId}/contents`, {
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'text/plain',
                    'Authorization': `Bearer ${token}`
                }),
                body: content
            })
        })
    })

    describe('logout', () => {
        it('should call server-side logout', async () => {
            const token = 'test-token'
            fetchSpy.mockResolvedValueOnce({ ok: true } as Response)

            await filesManagerService.logout(token)
            
            // logout strips /api from API_URL => http://localhost:8000/logout
            expect(fetchSpy).toHaveBeenCalledWith('http://localhost:8000/logout', expect.anything())
        })
    })
})
