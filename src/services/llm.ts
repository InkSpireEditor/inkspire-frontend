import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

/** One event from the generation stream. */
type GenerationEvent = { delta?: string; error?: string }

/** Called with each piece of text as it arrives. */
export type OnDelta = (delta: string) => void

/** Text generation against the API's LLM proxy. */
export const llmService = {
    /**
     * Continues the given text using the named model, calling `onDelta` with each
     * piece as it arrives. Resolves once generation ends.
     *
     * The response is a stream, so nothing is buffered until the end: text appears
     * while the model is still writing. Pass `signal` to stop a continuation part way
     * through — the API closes its request to the provider when the client goes away.
     *
     * Nothing is saved by the API. The caller owns the text and must save it.
     *
     * @param model Name of the model to generate with, as listed by the API.
     * @param prompt The writer's current text, used as the continuation prompt.
     * @param onDelta Receives each chunk of generated text in order.
     * @param signal Aborts the generation when triggered.
     */
    async generate(
        model: string,
        prompt: string,
        onDelta: OnDelta,
        signal?: AbortSignal,
    ): Promise<void> {
        const response = await apiFetch(`${API_URL}/llm/generate`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({ model, prompt }),
            signal,
        });

        // A failure before the first chunk is an ordinary status, which is why this can
        // still throw rather than having to report through the stream.
        if (!response.ok) {
            throw new Error(await errorMessage(response));
        }
        if (!response.body) {
            throw new Error("The API returned no stream");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = '';

        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;

                buffered += decoder.decode(value, { stream: true });

                // An event ends on a blank line, and a chunk boundary can fall anywhere,
                // so the tail is kept until the rest of its event arrives.
                const events = buffered.split('\n\n');
                buffered = events.pop() ?? '';

                for (const event of events) {
                    const payload = parse(event);
                    if (payload === null) continue;
                    // Reached once text is already on screen, so there is no status code
                    // left to fail with.
                    if (payload.error) throw new Error(payload.error);
                    if (payload.delta) onDelta(payload.delta);
                }
            }
        } finally {
            reader.releaseLock();
        }
    },
};

/** The payload of one server-sent event, or null for the terminator and anything unparsable. */
function parse(event: string): GenerationEvent | null {
    const line = event.split('\n').find((candidate) => candidate.startsWith('data:'));
    if (!line) return null;

    const data = line.slice('data:'.length).trim();
    if (!data || data === '[DONE]') return null;

    try {
        return JSON.parse(data) as GenerationEvent;
    } catch {
        return null;
    }
}

/** The API's `message` for a failed response, falling back to the status. */
async function errorMessage(response: Response): Promise<string> {
    try {
        const body = await response.json();
        if (body?.message) return body.message;
    } catch {
        // A response without a JSON body still has a status worth reporting.
    }
    return `Generation failed (${response.status})`;
}
