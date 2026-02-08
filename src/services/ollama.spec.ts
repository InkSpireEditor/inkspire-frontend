import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ollamaService } from './ollama'

const API_URL = 'http://localhost:8000/api'

describe('ollamaService', () => {
  let fetchSpy = vi.spyOn(window, 'fetch')

  beforeEach(() => {
    fetchSpy = vi.spyOn(window, 'fetch')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('generate sends POST request with correct payload and returns snippet', async () => {
    const token = 'token'
    const id = 1
    const model = 'llama3'
    const prompt = 'Hello'
    const mockRes = { snippet: 'Hi there!' }
    
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRes
    } as Response)

    const result = await ollamaService.generate(token, id, model, prompt)
    
    expect(result).toBe('Hi there!')
    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/ollama/generate`, {
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }),
      body: JSON.stringify({ id, model, prompt })
    })
  })

  it('throws error when generate fetch fails', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false } as Response)
    await expect(ollamaService.generate('t', 1, 'm', 'p')).rejects.toThrow('Ollama request failed')
  })
})
