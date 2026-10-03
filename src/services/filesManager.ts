import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';
import type { Space } from './spaces';
import type { ProvenanceMetadata } from './provenance';

/**
 * What a load had to put right, per paragraph, or `null` where it had nothing to.
 *
 * `GET /document` reconciles provenance a hand edit left stale before answering (§7.5), so
 * the editor is handed metadata that already matches the prose. Nothing displays this yet;
 * it is here so a later interface can say what happened without the route changing.
 */
export interface Reconciled {
    revision: string | null;
    recovered: string[];
    reset: string[];
    dropped: string[];
}

/**
 * A file's prose and its provenance, which travel together in both directions.
 *
 * `metadata` of `null` means the file has no provenance section at all -- the editor has
 * never saved it. An empty object means it has one and it is empty, which is a different
 * thing: the prose is all the writer's. A `PUT` of `null` removes the section.
 */
export interface DocumentResponse {
    body: string;
    metadata: ProvenanceMetadata | null;
    reconciled: Reconciled | null;
}

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

/**
 * A story delete refused because its directory holds more than its chapters --
 * `holds` names the entries in the way, straight from the API's response body.
 */
export class HoldsError extends Error {
    holds: string[];

    constructor(message: string, holds: string[]) {
        super(message);
        this.name = "HoldsError";
        this.holds = holds;
    }
}

/**
 * The API has no file with that id. Thrown rather than reported as a general failure
 * because it means one thing in particular: whatever was holding that id is out of
 * date -- the file was renamed (which changes its id), deleted, or arrived from a
 * pull that removed it. A caller can recover from that on its own.
 */
export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}

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

    /**
     * Deletes a directory. Refused (without `force`) while it holds anything besides
     * what this app itself writes there; the refusal's `holds` names what is in the
     * way, thrown as a `HoldsError` rather than a plain one so a caller can tell the
     * two apart. `force: true` deletes it regardless of what it holds.
     */
    async delDir(space: Space, id: string, options?: { force?: boolean }) {
        const query = options?.force ? "?force=true" : "";
        const response = await apiFetch(`${API_URL}/${space}/dir/${id}${query}`, {
            method: "DELETE",
            headers: jsonHeaders(),
        });
        if (!response.ok) {
            let body: { message?: string; holds?: string[] } | null = null;
            try {
                body = await response.json();
            } catch {
                // No JSON body to read -- the plain fallback message is all there is.
            }
            const message = body?.message ?? "Failed to delete directory";
            if (body?.holds) throw new HoldsError(message, body.holds);
            throw new Error(message);
        }
        if (response.status === 204) return null;
        return response.json();
    },

    async getFileInfo(space: Space, id: string) {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}`, {
            headers: jsonHeaders(),
        });
        if (response.status === 404) throw new NotFoundError("No file with that id");
        if (!response.ok) throw new Error("Failed to fetch file info");
        return response.json();
    },

    async getFileContent(space: Space, id: string) {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}/contents`, {
            headers: { ...jsonHeaders(), Accept: "text/plain" },
        });
        if (response.status === 404) throw new NotFoundError("No file with that id");
        if (!response.ok) throw new Error("Failed to fetch file content");
        return response.text();
    },

    /**
     * A file's prose and provenance in one request, with stale provenance already put
     * right by the API.
     */
    async getDocument(space: Space, id: string): Promise<DocumentResponse> {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}/document`, {
            headers: jsonHeaders(),
        });
        if (response.status === 404) throw new NotFoundError("No file with that id");
        if (!response.ok) throw new Error("Failed to fetch document");
        return response.json();
    },

    /**
     * Replaces a file's prose and its provenance together.
     *
     * One request for both, because a section derived from the body may not be written
     * without it: written separately, the hashes would stop matching the prose and the next
     * load would discard provenance the writer had just created.
     */
    async putDocument(
        space: Space,
        id: string,
        body: string,
        metadata: ProvenanceMetadata | null,
    ) {
        const response = await apiFetch(`${API_URL}/${space}/file/${id}/document`, {
            method: "PUT",
            headers: jsonHeaders(),
            body: JSON.stringify({ body, metadata }),
        });
        if (response.status === 404) throw new NotFoundError("No file with that id");
        if (!response.ok) throw new Error("Failed to save document");
        return response.json();
    },
};
