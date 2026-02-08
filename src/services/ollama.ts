const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export const ollamaService = {
    getHeaders(token: string) {
        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        };
    },

    async generate(token: string, id: number, model: string, prompt: string): Promise<string> {
        const response = await fetch(`${API_URL}/ollama/generate`, {
            method: "POST",
            headers: this.getHeaders(token),
            body: JSON.stringify({ id, model, prompt }),
        });

        if (!response.ok) throw new Error("Ollama request failed");
        const data = await response.json();
        return data.snippet;
    },
};
