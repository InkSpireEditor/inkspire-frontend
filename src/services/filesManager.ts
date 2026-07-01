import { API_URL, getAuthHeaders } from './api';
import { apiFetch } from './apiFetch';

export interface FileSystemNode {
    id: number;
    name: string;
    type: "D" | "F";
    children?: FileSystemNode[];
    parentId?: number;
}

export interface TreeApiResponse {
    dirs: Record<string, { name: string }>;
    files: Record<string, { name: string }>;
}

export interface DirApiResponse {
    files: Record<string, { name: string }>;
    summary?: string;
}

export const filesManagerService = {
    async getTree(token: string): Promise<TreeApiResponse> {
        const response = await apiFetch(`${API_URL}/tree`, {
            headers: getAuthHeaders(token),
        });
        if (!response.ok) throw new Error("Failed to fetch tree");
        return response.json();
    },

    async getDirContent(token: string, dirId: number): Promise<DirApiResponse> {
        const response = await apiFetch(`${API_URL}/dir/${dirId}`, {
            headers: getAuthHeaders(token),
        });
        if (!response.ok) throw new Error(`Failed to fetch content for dir ${dirId}`);
        return response.json();
    },

    async addFile(token: string, name: string, parentId: number | null) {
        const response = await apiFetch(`${API_URL}/file`, {
            method: "POST",
            headers: getAuthHeaders(token),
            body: JSON.stringify({ name, dir: parentId }), // Backend expects 'dir'
        });
        if (!response.ok) throw new Error("Failed to create file");
        return response.json();
    },

    async addDir(token: string, name: string, context: string, parentId: number | null) {
        const response = await apiFetch(`${API_URL}/dir`, {
            method: "POST",
            headers: getAuthHeaders(token),
            body: JSON.stringify({ name, summary: context }), // Backend expects 'summary'
        });
        if (!response.ok) throw new Error("Failed to create directory");
        return response.json();
    },

    async editFile(token: string, id: number, name: string) {
        const response = await apiFetch(`${API_URL}/file/${id}`, {
            method: "PUT",
            headers: getAuthHeaders(token),
            body: JSON.stringify({ name }),
        });
        if (!response.ok) throw new Error("Failed to edit file");
        return response.json();
    },

    async editDir(token: string, id: number, name: string, context: string) {
        const response = await apiFetch(`${API_URL}/dir/${id}`, {
            method: "PUT",
            headers: getAuthHeaders(token),
            body: JSON.stringify({ name, summary: context }), // Backend expects 'summary'
        });
        if (!response.ok) throw new Error("Failed to edit directory");
        return response.json();
    },

    async delFile(token: string, id: number) {
        const response = await apiFetch(`${API_URL}/file/${id}`, {
            method: "DELETE",
            headers: getAuthHeaders(token),
        });
        if (!response.ok) throw new Error("Failed to delete file");
        if (response.status === 204) return null;
        return response.json();
    },

    async delDir(token: string, id: number) {
        const response = await apiFetch(`${API_URL}/dir/${id}`, {
            method: "DELETE",
            headers: getAuthHeaders(token),
        });
        if (!response.ok) throw new Error("Failed to delete directory");
        if (response.status === 204) return null;
        return response.json();
    },

    async getFileInfo(token: string, id: number) {
        const response = await apiFetch(`${API_URL}/file/${id}`, {
            headers: getAuthHeaders(token),
        });
        if (!response.ok) throw new Error("Failed to fetch file info");
        return response.json();
    },

    async getFileContent(token: string, id: number) {
        const response = await apiFetch(`${API_URL}/file/${id}/contents`, {
            headers: { ...getAuthHeaders(token), Accept: "text/plain" },
        });
        if (!response.ok) throw new Error("Failed to fetch file content");
        return response.text();
    },

    async updateFileContent(token: string, id: number, content: string) {
        const response = await apiFetch(`${API_URL}/file/${id}/contents`, {
            method: "PUT",
            headers: { ...getAuthHeaders(token), "Content-Type": "text/plain" },
            body: content,
        });
        if (!response.ok) throw new Error("Failed to update file content");
        if (response.status === 204) return null;
        return response.text();
    },
};
