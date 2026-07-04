import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { llmService } from './llm'

const API_URL = 'http://localhost:8000/api'

describe('llmService', () => {
  let fetchSpy = vi.spyOn(window, 'fetch')

  beforeEach(() => {
    fetchSpy = vi.spyOn(window, 'fetch')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('generate sends POST request with correct payload and returns snippet', async () => {
    const id = 1
    const model = 'llama3'
    const prompt = 'Hello'
    const mockRes = { snippet: 'Hi there!' }

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRes
    } as Response)

    const result = await llmService.generate(id, model, prompt)

    expect(result).toBe('Hi there!')
    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/llm/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ id, model, prompt }),
      credentials: 'include',
    })
  })

  it('throws error when generate fetch fails', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false } as Response)
    await expect(llmService.generate(1, 'm', 'p')).rejects.toThrow('LLM request failed')
  })
})
