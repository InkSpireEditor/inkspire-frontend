import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

export type ModelProtocol = 'openai' | 'ollama';

export interface Model {
  name: string;
  /** Only `ollama` can be asked to think or not -- the chat-completions path has no
   *  equivalent, native or otherwise, and ignores the field when sent. */
  protocol: ModelProtocol;
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
