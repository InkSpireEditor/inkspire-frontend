import { API_URL, getAuthHeaders } from './api';
import { apiFetch } from './apiFetch';

export const ollamaService = {
    async generate(token: string, id: number, model: string, prompt: string): Promise<string> {
        const response = await apiFetch(`${API_URL}/ollama/generate`, {
            method: "POST",
            headers: getAuthHeaders(token),
            body: JSON.stringify({ id, model, prompt }),
        });

        if (!response.ok) throw new Error("Ollama request failed");
        const data = await response.json();
        return data.snippet;
    },
};
