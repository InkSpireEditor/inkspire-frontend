import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';
import type { Cursor, CursorRange } from './cursor';
import type { Space } from './spaces';

/** One event from the generation stream. */
type GenerationEvent = { delta?: string; error?: string }

/** Called with each piece of text as it arrives. */
export type OnDelta = (delta: string) => void

/**
 * Everything about one generation beyond the file and the model, each overriding the
 * server's own default (`GET /api/llm/defaults`, `sharedSettings.ts`) for this
 * request alone. Bundled into one object rather than a growing list of positional
 * parameters -- `GenerateRequest` on the API gained four of these alongside the
 * caret, and a sixth positional boolean-or-object parameter is where that stops
 * being readable at the call site.
 */
export interface GenerateOptions {
    /** Overrides the server's default. Omit (or pass `undefined`) to leave that
     *  default in place -- the right choice for a model that cannot honour it at
     *  all, rather than sending a value that model would simply ignore. */
    think?: boolean
    /** Where the caret is, so the server continues there instead of at the end of
     *  the file (inkspire-api#14). Omit for the end -- today's only behaviour, and
     *  what an absent caret still means. Mutually exclusive with `selection` --
     *  a generation is anchored at a point or at a range, never both. */
    cursor?: Cursor
    /** A passage to rewrite instead of continuing or filling in (inkspire-api#20).
     *  Mutually exclusive with `cursor`. */
    selection?: CursorRange
    /** For a rewrite (`selection` above), whether to send the passage's own text
     *  along with its word count, rather than the word count alone -- overriding
     *  `INKSPIRE_LLM_SEND_SELECTION`. Has no effect without `selection`: a
     *  continuation and a fill-in-the-middle have no passage to send. */
    sendSelection?: boolean
    /** Sampling temperature, overriding `INKSPIRE_LLM_TEMPERATURE`. */
    temperature?: number
    /** Characters of prose kept in the prompt, overriding `INKSPIRE_LLM_PROMPT_BUDGET`. */
    promptBudget?: number
    /** How the budget splits between the prefix and the suffix once there is a
     *  caret, overriding `INKSPIRE_LLM_PREFIX_SHARE`. Unused for a continuation. */
    prefixShare?: number
    /** The context window allocated on the ollama path, overriding `INKSPIRE_LLM_NUM_CTX`. */
    numCtx?: number
    /** Aborts the generation when triggered. */
    signal?: AbortSignal
}

/** Text generation against the API's LLM proxy. */
export const llmService = {
    /**
     * Continues a file's own text using the named model, calling `onDelta` with each
     * piece as it arrives. Resolves once generation ends.
     *
     * The request carries no text: the server reads `id`'s file fresh from disk and
     * assembles the prompt itself (`inkspire-api/docs/prompt.md`), so the caller must
     * have saved first -- generating against an unsaved edit would ask about text
     * that is not there yet.
     *
     * The response is a stream, so nothing is buffered until the end: text appears
     * while the model is still writing. Pass `options.signal` to stop a continuation
     * part way through — the API closes its request to the provider when the client
     * goes away.
     *
     * Nothing is saved by the API. The caller owns the text and must save it.
     *
     * @param space Which root `id` belongs to.
     * @param id The file to continue.
     * @param model Name of the model to generate with, as listed by the API.
     * @param onDelta Receives each chunk of generated text in order.
     * @param options Everything else about this one generation; see `GenerateOptions`.
     */
    async generate(
        space: Space,
        id: string,
        model: string,
        onDelta: OnDelta,
        options: GenerateOptions = {},
    ): Promise<void> {
        const {
            think,
            cursor,
            selection,
            sendSelection,
            temperature,
            promptBudget,
            prefixShare,
            numCtx,
            signal,
        } = options
        // A selection's start is the anchor's start; a bare cursor is the anchor's
        // start with no end, which is a caret -- the two never both carry fields.
        const anchorStart = selection?.start ?? cursor
        const response = await apiFetch(`${API_URL}/${space}/file/${id}/generate`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({
                model,
                think,
                cursor_para: anchorStart?.para,
                cursor_offset: anchorStart?.offset,
                cursor_end_para: selection?.end.para,
                cursor_end_offset: selection?.end.offset,
                send_selection: sendSelection,
                temperature,
                prompt_budget: promptBudget,
                prefix_share: prefixShare,
                num_ctx: numCtx,
            }),
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

    /**
     * The server's own generation settings -- what a request gets when it overrides
     * none of them, and what a settings panel initialises against and resets to.
     */
    async getDefaults(): Promise<GenerationDefaults> {
        const response = await apiFetch(`${API_URL}/llm/defaults`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) {
            throw new Error(await errorMessage(response));
        }
        return response.json();
    },
};

/** `GET /api/llm/defaults`: the server's configuration, in its own field names. */
export interface GenerationDefaults {
    temperature: number
    prompt_budget: number
    prefix_share: number
    num_ctx: number | null
    think: boolean | null
    send_selection: boolean
}

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
