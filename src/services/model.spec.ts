import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { modelService } from './model'

const API_URL = 'http://localhost:8000/api'

describe('modelService', () => {
  let fetchSpy = vi.spyOn(window, 'fetch')

  beforeEach(() => {
    fetchSpy = vi.spyOn(window, 'fetch')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('getModels sends GET request with correct headers and credentials', async () => {
    const mockModels = [{ name: 'Llama3' }, { name: 'Gemma' }]

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModels
    } as Response)

    const result = await modelService.getModels()

    expect(result).toEqual(mockModels)
    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/ollama/models`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
    })
  })

  it('throws error when loading models fails', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false } as Response)
    await expect(modelService.getModels()).rejects.toThrow('Failed to load models')
  })
})
