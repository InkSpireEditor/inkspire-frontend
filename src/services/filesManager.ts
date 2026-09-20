import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';
import type { Space } from './spaces';

export interface FileSystemNode {
    id: string;
    name: string;
    type: "D" | "F";
    children?: FileSystemNode[];
    parentId?: string;
    /** From the file's own header. Empty where it has none. */
    status?: string;
    /** A story's synopsis, a folder's context, or a file's own summary. */
    summary?: string;
}

/** One file in a listing. `summary` is sent by the per-directory route only. */
export interface FileEntry {
    id: string;
    name: string;
    status: string;
    summary?: string;
}

/**
 * One directory, with the files in it. `timeline` and `lorebook` say which further
 * views a story can offer, and a notes folder carries neither.
 */
export interface DirEntry {
    id: string;
    name: string;
    summary: string;
    timeline?: boolean;
    lorebook?: boolean;
    files: FileEntry[];
}

/**
 * A whole root in one response. Both lists are ordered and that order is what to draw:
 * a story's chapters come in `story.yaml` order, everything else by name.
 */
export interface TreeApiResponse {
    user?: string;
    dirs: DirEntry[];
    files: FileEntry[];
}

export type DirApiResponse = DirEntry;

export const filesManagerService = {
    async getTree(space: Space): Promise<TreeApiResponse> {
        const response = await apiFetch(`${API_URL}/${space}/tree`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error("Failed to fetch tree");
        return response.json();
    },

    async getDirContent(space: Space, dirId: string): Promise<DirApiResponse> {
        const response = await apiFetch(`${API_URL}/${space}/dir/${dirId}`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error(`Failed to fetch content for dir ${dirId}`);
        return response.json();
    },

    async addFile(space: Space, name: string, parentId: string | null) {
        const response = await apiFetch(`${API_URL}/${space}/file`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({ name, dir: parentId }), // Backend expects 'dir'
        });
        if (!response.ok) throw new Error("Failed to create file");
        return response.json();
    },

    async addDir(space: Space, name: string, context: string) {
        const response = await apiFetch(`${API_URL}/${space}/dir`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({ name, summary: context }), // Backend expects 'summary'
        });
        if (!response.ok) throw new Error("Failed to create directory");
        return response.json();
    },

    async editFile(space: Space, id: string, name: string) {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}`, {
            method: "PUT",
            headers: jsonHeaders(),
            body: JSON.stringify({ name }),
        });
        if (!response.ok) throw new Error("Failed to edit file");
        return response.json();
    },

    /**
     * Sets what a file's own header says about it. An empty string clears a field.
     * The file's id does not change: neither field touches its path.
     */
    async setFileStatus(space: Space, id: string, status: string) {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}`, {
            method: "PUT",
            headers: jsonHeaders(),
            body: JSON.stringify({ status }),
        });
        if (!response.ok) throw new Error("Failed to set file status");
        return response.json();
    },

    /**
     * Writes the order a story's chapters are read in, as the whole list of their ids.
     * Only `story.yaml` is written; no chapter's text is touched. Answers the story as
     * `getDirContent` does, so a caller working from a stale listing reads the result
     * rather than assuming what it sent.
     */
    async reorderChapters(dirId: string, order: string[]): Promise<DirApiResponse> {
        const response = await apiFetch(`${API_URL}/stories/dir/${dirId}/chapters`, {
            method: "PUT",
            headers: jsonHeaders(),
            body: JSON.stringify({ order }),
        });
        if (!response.ok) throw new Error("Failed to reorder chapters");
        return response.json();
    },

    async editDir(space: Space, id: string, name: string, context: string) {
        const response = await apiFetch(`${API_URL}/${space}/dir/${id}`, {
            method: "PUT",
            headers: jsonHeaders(),
            body: JSON.stringify({ name, summary: context }), // Backend expects 'summary'
        });
        if (!response.ok) throw new Error("Failed to edit directory");
        return response.json();
    },

    async delFile(space: Space, id: string) {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}`, {
            method: "DELETE",
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error("Failed to delete file");
        if (response.status === 204) return null;
        return response.json();
    },

    async delDir(space: Space, id: string) {
        const response = await apiFetch(`${API_URL}/${space}/dir/${id}`, {
            method: "DELETE",
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error("Failed to delete directory");
        if (response.status === 204) return null;
        return response.json();
    },

    async getFileInfo(space: Space, id: string) {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error("Failed to fetch file info");
        return response.json();
    },

    async getFileContent(space: Space, id: string) {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}/contents`, {
            headers: { ...jsonHeaders(), Accept: "text/plain" },
        });
        if (!response.ok) throw new Error("Failed to fetch file content");
        return response.text();
    },

    async updateFileContent(space: Space, id: string, content: string) {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}/contents`, {
            method: "PUT",
            headers: { ...jsonHeaders(), "Content-Type": "text/plain" },
            body: content,
        });
        if (!response.ok) throw new Error("Failed to update file content");
        if (response.status === 204) return null;
        return response.text();
    },
};
