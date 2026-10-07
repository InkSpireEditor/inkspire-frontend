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

/** The request body `generate` sends when every override is left at its default. */
const BARE_BODY = (model: string) =>
  JSON.stringify({
    model,
    think: undefined,
    cursor_para: undefined,
    cursor_offset: undefined,
    temperature: undefined,
    prompt_budget: undefined,
    prefix_share: undefined,
    num_ctx: undefined,
  })

describe('llmService', () => {
  let fetchSpy = vi.spyOn(window, 'fetch')

  beforeEach(() => {
    fetchSpy = vi.spyOn(window, 'fetch')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('posts the model to the space-and-id path, with no text', async () => {
    fetchSpy.mockResolvedValueOnce(streamed([event({ delta: 'Hi' }), 'data: [DONE]\n\n']))

    await llmService.generate('stories', 'f1', 'llama3', () => {})

    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/stories/file/f1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: BARE_BODY('llama3'),
      credentials: 'include',
      signal: undefined,
    })
  })

  it('posts to the notes path when the file is a note', async () => {
    fetchSpy.mockResolvedValueOnce(streamed(['data: [DONE]\n\n']))

    await llmService.generate('notes', 'n1', 'm', () => {})

    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/notes/file/n1/generate`,
      expect.anything(),
    )
  })

  it('reports each delta in order', async () => {
    fetchSpy.mockResolvedValueOnce(
      streamed([event({ delta: 'Hel' }), event({ delta: 'lo' }), 'data: [DONE]\n\n']),
    )

    const received: string[] = []
    await llmService.generate('stories', 'f1', 'm', (delta) => received.push(delta))

    expect(received).toEqual(['Hel', 'lo'])
  })

  it('reassembles an event split across two network chunks', async () => {
    // A read boundary can fall anywhere, including mid-JSON.
    fetchSpy.mockResolvedValueOnce(
      streamed(['data: {"delta":"Hel', 'lo"}\n\ndata: [DONE]\n\n']),
    )

    const received: string[] = []
    await llmService.generate('stories', 'f1', 'm', (delta) => received.push(delta))

    expect(received).toEqual(['Hello'])
  })

  it('reports deltas that arrive together in one chunk', async () => {
    fetchSpy.mockResolvedValueOnce(
      streamed([event({ delta: 'a' }) + event({ delta: 'b' }) + 'data: [DONE]\n\n']),
    )

    const received: string[] = []
    await llmService.generate('stories', 'f1', 'm', (delta) => received.push(delta))

    expect(received).toEqual(['a', 'b'])
  })

  it('throws the API message when the request fails before any text', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ code: 422, message: 'Unknown provider "absent".' }),
    } as unknown as Response)

    await expect(
      llmService.generate('stories', 'f1', 'absent/m', () => {}),
    ).rejects.toThrow('Unknown provider "absent".')
  })

  it('falls back to the status when a failure has no message', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)

    await expect(llmService.generate('stories', 'f1', 'm', () => {})).rejects.toThrow('500')
  })

  it('throws an error event that arrives mid-stream, keeping earlier text', async () => {
    fetchSpy.mockResolvedValueOnce(
      streamed([event({ delta: 'Once' }), event({ error: 'provider went away' })]),
    )

    const received: string[] = []
    await expect(
      llmService.generate('stories', 'f1', 'm', (delta) => received.push(delta)),
    ).rejects.toThrow('provider went away')

    // Text delivered before the failure is the writer's, and stays.
    expect(received).toEqual(['Once'])
  })

  it('ignores keep-alives and unparsable events', async () => {
    fetchSpy.mockResolvedValueOnce(
      streamed([': keep-alive\n\n', 'data: not json\n\n', event({ delta: 'x' }), 'data: [DONE]\n\n']),
    )

    const received: string[] = []
    await llmService.generate('stories', 'f1', 'm', (delta) => received.push(delta))

    expect(received).toEqual(['x'])
  })

  it('sends think when given, and omits it entirely when not', async () => {
    fetchSpy.mockResolvedValueOnce(streamed(['data: [DONE]\n\n']))
    await llmService.generate('stories', 'f1', 'm', () => {}, { think: false })

    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/stories/file/f1/generate`,
      // JSON.stringify drops a key whose value is undefined, which is what an
      // omitted `think` relies on to reach the API as absent rather than null.
      expect.objectContaining({
        body: JSON.stringify({
          model: 'm',
          think: false,
          cursor_para: undefined,
          cursor_offset: undefined,
          temperature: undefined,
          prompt_budget: undefined,
          prefix_share: undefined,
          num_ctx: undefined,
        }),
      }),
    )

    fetchSpy.mockResolvedValueOnce(streamed(['data: [DONE]\n\n']))
    await llmService.generate('stories', 'f1', 'm', () => {})

    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/stories/file/f1/generate`,
      expect.objectContaining({ body: BARE_BODY('m') }),
    )
  })

  it('passes an abort signal through to fetch', async () => {
    fetchSpy.mockResolvedValueOnce(streamed(['data: [DONE]\n\n']))
    const controller = new AbortController()

    await llmService.generate('stories', 'f1', 'm', () => {}, { signal: controller.signal })

    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/stories/file/f1/generate`,
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('sends the caret as cursor_para and cursor_offset when given', async () => {
    fetchSpy.mockResolvedValueOnce(streamed(['data: [DONE]\n\n']))

    await llmService.generate('stories', 'f1', 'm', () => {}, { cursor: { para: 2, offset: 7 } })

    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/stories/file/f1/generate`,
      expect.objectContaining({
        body: JSON.stringify({
          model: 'm',
          think: undefined,
          cursor_para: 2,
          cursor_offset: 7,
          temperature: undefined,
          prompt_budget: undefined,
          prefix_share: undefined,
          num_ctx: undefined,
        }),
      }),
    )
  })

  it('sends every override under the field name the API expects', async () => {
    fetchSpy.mockResolvedValueOnce(streamed(['data: [DONE]\n\n']))

    await llmService.generate('stories', 'f1', 'm', () => {}, {
      temperature: 0.3,
      promptBudget: 2000,
      prefixShare: 0.5,
      numCtx: 8192,
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/stories/file/f1/generate`,
      expect.objectContaining({
        body: JSON.stringify({
          model: 'm',
          think: undefined,
          cursor_para: undefined,
          cursor_offset: undefined,
          temperature: 0.3,
          prompt_budget: 2000,
          prefix_share: 0.5,
          num_ctx: 8192,
        }),
      }),
    )
  })

  describe('getDefaults', () => {
    it('fetches the servers own settings', async () => {
      const defaults = {
        temperature: 1.0,
        prompt_budget: 10000,
        prefix_share: 0.75,
        num_ctx: null,
        think: null,
      }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => defaults,
      } as unknown as Response)

      await expect(llmService.getDefaults()).resolves.toEqual(defaults)
      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_URL}/llm/defaults`,
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        }),
      )
    })

    it('throws the API message on failure', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: 401, message: 'Not authenticated' }),
      } as unknown as Response)

      await expect(llmService.getDefaults()).rejects.toThrow('Not authenticated')
    })
  })
})
