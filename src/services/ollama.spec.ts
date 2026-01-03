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

  it('addButtonOllama sends POST request with correct payload', async () => {
    const token = 'token'
    const mockRes = { param: { response: 'AI text' } }
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRes
    } as Response)

    const result = await ollamaService.addButtonOllama(1, token, 'query', {}, 'text')
    
    expect(JSON.parse(result)).toEqual(mockRes)
    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/ollama/addRequest`, {
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({ id: 1, userQuery: 'query', context: {}, text: 'text' })
    })
  })

  it('rephraseButtonOllama sends POST request with correct payload', async () => {
    const token = 'token'
    const mockRes = { param: { response: 'Rephrased text' } }
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRes
    } as Response)

    const result = await ollamaService.rephraseButtonOllama(1, token, {}, 'text')
    
    expect(JSON.parse(result)).toEqual(mockRes)
    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/ollama/rephraseRequest`, {
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': `Bearer ${token}`
      }),
      body: JSON.stringify({ id: 1, context: {}, text: 'text' })
    })
  })

  it('translateButtonOllama sends POST request with correct payload', async () => {
    const token = 'token'
    const mockRes = { param: { response: 'Translated text' } }
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRes
    } as Response)

    const result = await ollamaService.translateButtonOllama(1, token, 'to French', {}, 'text')
    
    expect(JSON.parse(result)).toEqual(mockRes)
    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/ollama/translateRequest`, {
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': `Bearer ${token}`
      }),
      body: JSON.stringify({ id: 1, userQuery: 'to French', context: {}, text: 'text' })
    })
  })

  it('throws error when fetch fails', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false } as Response)
    await expect(ollamaService.addButtonOllama(1, 't', 'q', {}, 'x')).rejects.toThrow('Ollama request failed')
  })
})