const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const ollamaService = {
  getHeaders(token: string) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  },

  async addButtonOllama(id: number, token: string, userQuery: string, context: any, text: string): Promise<string> {
    // Ported from old OllamaService.ts - adjusting to match backend if needed
    // The old service had the URL commented out or pointing to 127.0.0.1:8000/api/v1/ollama/addRequest
    // We will use the defined API_URL
    const url = `${API_URL}/ollama/addRequest`;
    const body = JSON.stringify({ id, userQuery, context, text });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(token),
        body
      });
      
      if (!response.ok) throw new Error('Ollama request failed');
      const data = await response.json();
      return JSON.stringify(data);
    } catch (e) {
      console.error('Ollama Service Error:', e);
      throw e;
    }
  },

  async rephraseButtonOllama(id: number, token: string, context: any, text: string): Promise<string> {
    const url = `${API_URL}/ollama/rephraseRequest`;
    const body = JSON.stringify({ id, context, text });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(token),
        body
      });
      if (!response.ok) throw new Error('Ollama rephrase failed');
      const data = await response.json();
      return JSON.stringify(data);
    } catch (e) {
      console.error('Ollama Service Error:', e);
      throw e;
    }
  },

  async translateButtonOllama(id: number, token: string, userQuery: string, context: any, text: string): Promise<string> {
    const url = `${API_URL}/ollama/translateRequest`;
    const body = JSON.stringify({ id, userQuery, context, text });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(token),
        body
      });
      if (!response.ok) throw new Error('Ollama translation failed');
      const data = await response.json();
      return JSON.stringify(data);
    } catch (e) {
      console.error('Ollama Service Error:', e);
      throw e;
    }
  }
};
