import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

/** Text generation against the API's LLM proxy. */
export const llmService = {
    /**
     * Continues the given text using the named model. The backend appends the
     * generated snippet to the file itself, so the caller only receives the new
     * text to display — it must not save the result back.
     *
     * @param id ID of the file being written into.
     * @param model Name of the model to generate with, as listed by the API.
     * @param prompt The writer's current text, used as the continuation prompt.
     * @returns The generated snippet.
     */
    async generate(id: number, model: string, prompt: string): Promise<string> {
        const response = await apiFetch(`${API_URL}/llm/generate`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({ id, model, prompt }),
        });

        if (!response.ok) throw new Error("LLM request failed");
        const data = await response.json();
        return data.snippet;
    },
};
