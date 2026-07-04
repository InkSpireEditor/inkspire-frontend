import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

export const llmService = {
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
