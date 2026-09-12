import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { llmService } from './llm'

const API_URL = 'http://localhost:8000/api'

/** A streamed response whose body delivers `chunks` in order, as the network would. */
function streamed(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return { ok: status < 400, status, body } as unknown as Response
}

function event(payload: object): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

describe('llmService', () => {
  let fetchSpy = vi.spyOn(window, 'fetch')

  beforeEach(() => {
    fetchSpy = vi.spyOn(window, 'fetch')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('posts the model and prompt, and no file id', async () => {
    fetchSpy.mockResolvedValueOnce(streamed([event({ delta: 'Hi' }), 'data: [DONE]\n\n']))

    await llmService.generate('llama3', 'Hello', () => {})

    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/llm/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ model: 'llama3', prompt: 'Hello' }),
      credentials: 'include',
      signal: undefined,
    })
  })

  it('reports each delta in order', async () => {
    fetchSpy.mockResolvedValueOnce(
      streamed([event({ delta: 'Hel' }), event({ delta: 'lo' }), 'data: [DONE]\n\n']),
    )

    const received: string[] = []
    await llmService.generate('m', 'p', (delta) => received.push(delta))

    expect(received).toEqual(['Hel', 'lo'])
  })

  it('reassembles an event split across two network chunks', async () => {
    // A read boundary can fall anywhere, including mid-JSON.
    fetchSpy.mockResolvedValueOnce(
      streamed(['data: {"delta":"Hel', 'lo"}\n\ndata: [DONE]\n\n']),
    )

    const received: string[] = []
    await llmService.generate('m', 'p', (delta) => received.push(delta))

    expect(received).toEqual(['Hello'])
  })

  it('reports deltas that arrive together in one chunk', async () => {
    fetchSpy.mockResolvedValueOnce(
      streamed([event({ delta: 'a' }) + event({ delta: 'b' }) + 'data: [DONE]\n\n']),
    )

    const received: string[] = []
    await llmService.generate('m', 'p', (delta) => received.push(delta))

    expect(received).toEqual(['a', 'b'])
  })

  it('throws the API message when the request fails before any text', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ code: 422, message: 'Unknown provider "absent".' }),
    } as unknown as Response)

    await expect(llmService.generate('absent/m', 'p', () => {})).rejects.toThrow(
      'Unknown provider "absent".',
    )
  })

  it('falls back to the status when a failure has no message', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)

    await expect(llmService.generate('m', 'p', () => {})).rejects.toThrow('500')
  })

  it('throws an error event that arrives mid-stream, keeping earlier text', async () => {
    fetchSpy.mockResolvedValueOnce(
      streamed([event({ delta: 'Once' }), event({ error: 'provider went away' })]),
    )

    const received: string[] = []
    await expect(
      llmService.generate('m', 'p', (delta) => received.push(delta)),
    ).rejects.toThrow('provider went away')

    // Text delivered before the failure is the writer's, and stays.
    expect(received).toEqual(['Once'])
  })

  it('ignores keep-alives and unparsable events', async () => {
    fetchSpy.mockResolvedValueOnce(
      streamed([': keep-alive\n\n', 'data: not json\n\n', event({ delta: 'x' }), 'data: [DONE]\n\n']),
    )

    const received: string[] = []
    await llmService.generate('m', 'p', (delta) => received.push(delta))

    expect(received).toEqual(['x'])
  })

  it('passes an abort signal through to fetch', async () => {
    fetchSpy.mockResolvedValueOnce(streamed(['data: [DONE]\n\n']))
    const controller = new AbortController()

    await llmService.generate('m', 'p', () => {}, controller.signal)

    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/llm/generate`,
      expect.objectContaining({ signal: controller.signal }),
    )
  })
})
