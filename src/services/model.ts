import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

export interface Model {
  name: string;
}

export const modelService = {
  async getModels(): Promise<Model[]> {
    const response = await apiFetch(`${API_URL}/ollama/models`, {
      headers: jsonHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to load models');
    }

    return response.json();
  }
};
