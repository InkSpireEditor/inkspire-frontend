import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

export interface Model {
  name: string;
}

export const modelService = {
  /**
   * Lists the models the backend's Ollama instance has available. The backend
   * caches this, so calling it on each mount is cheap.
   */
  async getModels(): Promise<Model[]> {
    const response = await apiFetch(`${API_URL}/llm/models`, {
      headers: jsonHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to load models');
    }

    return response.json();
  }
};
