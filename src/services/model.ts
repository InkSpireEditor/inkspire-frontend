import { API_URL, getAuthHeaders } from './api';
import { apiFetch } from './apiFetch';

export interface Model {
  name: string;
}

export const modelService = {
  async getModels(token: string): Promise<Model[]> {
    const response = await apiFetch(`${API_URL}/ollama/models`, {
      headers: getAuthHeaders(token),
    });
    
    if (!response.ok) {
      throw new Error('Failed to load models');
    }
    
    return response.json();
  }
};
