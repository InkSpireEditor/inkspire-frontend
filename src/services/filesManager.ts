import { API_URL, jsonHeaders } from './api';
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
    async getTree(): Promise<TreeApiResponse> {
        const response = await apiFetch(`${API_URL}/tree`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error("Failed to fetch tree");
        return response.json();
    },

    async getDirContent(dirId: number): Promise<DirApiResponse> {
        const response = await apiFetch(`${API_URL}/dir/${dirId}`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error(`Failed to fetch content for dir ${dirId}`);
        return response.json();
    },

    async addFile(name: string, parentId: number | null) {
        const response = await apiFetch(`${API_URL}/file`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({ name, dir: parentId }), // Backend expects 'dir'
        });
        if (!response.ok) throw new Error("Failed to create file");
        return response.json();
    },

    async addDir(name: string, context: string, parentId: number | null) {
        const response = await apiFetch(`${API_URL}/dir`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({ name, summary: context }), // Backend expects 'summary'
        });
        if (!response.ok) throw new Error("Failed to create directory");
        return response.json();
    },

    async editFile(id: number, name: string) {
        const response = await apiFetch(`${API_URL}/file/${id}`, {
            method: "PUT",
            headers: jsonHeaders(),
            body: JSON.stringify({ name }),
        });
        if (!response.ok) throw new Error("Failed to edit file");
        return response.json();
    },

    async editDir(id: number, name: string, context: string) {
        const response = await apiFetch(`${API_URL}/dir/${id}`, {
            method: "PUT",
            headers: jsonHeaders(),
            body: JSON.stringify({ name, summary: context }), // Backend expects 'summary'
        });
        if (!response.ok) throw new Error("Failed to edit directory");
        return response.json();
    },

    async delFile(id: number) {
        const response = await apiFetch(`${API_URL}/file/${id}`, {
            method: "DELETE",
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error("Failed to delete file");
        if (response.status === 204) return null;
        return response.json();
    },

    async delDir(id: number) {
        const response = await apiFetch(`${API_URL}/dir/${id}`, {
            method: "DELETE",
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error("Failed to delete directory");
        if (response.status === 204) return null;
        return response.json();
    },

    async getFileInfo(id: number) {
        const response = await apiFetch(`${API_URL}/file/${id}`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error("Failed to fetch file info");
        return response.json();
    },

    async getFileContent(id: number) {
        const response = await apiFetch(`${API_URL}/file/${id}/contents`, {
            headers: { ...jsonHeaders(), Accept: "text/plain" },
        });
        if (!response.ok) throw new Error("Failed to fetch file content");
        return response.text();
    },

    async updateFileContent(id: number, content: string) {
        const response = await apiFetch(`${API_URL}/file/${id}/contents`, {
            method: "PUT",
            headers: { ...jsonHeaders(), "Content-Type": "text/plain" },
            body: content,
        });
        if (!response.ok) throw new Error("Failed to update file content");
        if (response.status === 204) return null;
        return response.text();
    },
};
