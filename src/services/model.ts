const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface Model {
  name: string;
}

export const modelService = {
  async getModels(token: string): Promise<Model[]> {
    const response = await fetch(`${API_URL}/ollama/models`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load models');
    }
    
    return response.json();
  }
};
