const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface FileSystemNode {
  id: number;
  name: string;
  type: 'D' | 'F';
  children?: FileSystemNode[];
  parentId?: number;
}

export const filesManagerService = {
  getHeaders(token: string) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  },

  async getTree(token: string) {
    const response = await fetch(`${API_URL}/tree`, {
      headers: this.getHeaders(token),
    });
    if (!response.ok) throw new Error('Failed to fetch tree');
    return response.json();
  },

  async getDirContent(token: string, dirId: number) {
    const response = await fetch(`${API_URL}/dir/${dirId}`, {
      headers: this.getHeaders(token),
    });
    if (!response.ok) throw new Error(`Failed to fetch content for dir ${dirId}`);
    return response.json();
  },

  async addFile(token: string, name: string, parentId: number | null) {
    const response = await fetch(`${API_URL}/file`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({ name, dir: parentId }), // Backend expects 'dir'
    });
    if (!response.ok) throw new Error('Failed to create file');
    return response.json();
  },

  async addDir(token: string, name: string, context: string, parentId: number | null) {
    const response = await fetch(`${API_URL}/dir`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({ name, summary: context }), // Backend expects 'summary'
    });
    if (!response.ok) throw new Error('Failed to create directory');
    return response.json();
  },

  async editFile(token: string, id: number, name: string) {
    const response = await fetch(`${API_URL}/file/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(token),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Failed to edit file');
    return response.json();
  },

  async editDir(token: string, id: number, name: string, context: string) {
    const response = await fetch(`${API_URL}/dir/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(token),
      body: JSON.stringify({ name, summary: context }), // Backend expects 'summary'
    });
    if (!response.ok) throw new Error('Failed to edit directory');
    return response.json();
  },

  async delFile(token: string, id: number) {
    const response = await fetch(`${API_URL}/file/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(token),
    });
    if (!response.ok) throw new Error('Failed to delete file');
    if (response.status === 204) return null;
    return response.json();
  },

  async delDir(token: string, id: number) {
    const response = await fetch(`${API_URL}/dir/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(token),
    });
    if (!response.ok) throw new Error('Failed to delete directory');
    if (response.status === 204) return null;
    return response.json();
  },

  async logout(token: string) {
    // Attempt server-side logout, but don't block on it
    try {
      // Assuming API_URL ends with /api, we strip it to get the root URL
      const baseUrl = API_URL.replace(/\/api$/, '');
      await fetch(`${baseUrl}/logout`, {
        method: 'GET', // Changed to GET to match Angular/Symfony default behavior if POST is not enforced
        headers: this.getHeaders(token),
      });
    } catch (e) {
      console.warn('Server logout failed', e);
    }
  },

  async getFileInfo(token: string, id: number) {
    const response = await fetch(`${API_URL}/file/${id}`, {
      headers: this.getHeaders(token),
    });
    if (!response.ok) throw new Error('Failed to fetch file info');
    return response.json();
  },

  async getFileContent(token: string, id: number) {
    const response = await fetch(`${API_URL}/file/${id}/contents`, {
      headers: { ...this.getHeaders(token), 'Accept': 'text/plain' },
    });
    if (!response.ok) throw new Error('Failed to fetch file content');
    return response.text();
  },

  async updateFileContent(token: string, id: number, content: string) {
    const response = await fetch(`${API_URL}/file/${id}/contents`, {
      method: 'POST',
      headers: { ...this.getHeaders(token), 'Content-Type': 'text/plain' },
      body: content,
    });
    if (!response.ok) throw new Error('Failed to update file content');
    if (response.status === 204) return null;
    return response.text();
  }
};
