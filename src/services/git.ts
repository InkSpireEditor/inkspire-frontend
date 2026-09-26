import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

/** One changed path, and whether `/commit` will pick it up. */
export interface GitChange {
    path: string;
    state: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
    staged: boolean;
    /** The story this path is inside, or null for a path outside every story. */
    dir: string | null;
    /** Whether `commit()` will stage this path: a story's own manifest, or a chapter. */
    committable: boolean;
}

/** The branch, what has changed, and how far it is from its upstream. */
export interface GitStatus {
    branch: string;
    upstream: string | null;
    /** Null when `upstream` is null: there is nothing to be ahead or behind of. */
    ahead: number | null;
    behind: number | null;
    /** Always false: `status()` never fetches, so this is only as fresh as the last pull. */
    fetched: boolean;
    clean: boolean;
    changes: GitChange[];
}

export interface GitCommitResult extends GitStatus {
    sha: string;
    message: string;
    /** The paths this commit actually touched — the committable subset of what changed. */
    committed: string[];
}

/**
 * The story repository as git. One repository holds every story, so unlike
 * filesManagerService these calls take no space.
 */
export const gitService = {
    async status(): Promise<GitStatus> {
        const response = await apiFetch(`${API_URL}/git/status`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error(await errorMessage(response, 'Failed to read git status'));
        return response.json();
    },

    /**
     * Commits only what the API itself writes: a story's manifest and its chapters.
     * A hand-edited lorebook or timeline is left exactly as dirty as it was.
     */
    async commit(message: string): Promise<GitCommitResult> {
        const response = await apiFetch(`${API_URL}/git/commit`, {
            method: 'POST',
            headers: jsonHeaders(),
            body: JSON.stringify({ message }),
        });
        if (!response.ok) throw new Error(await errorMessage(response, 'Commit failed'));
        return response.json();
    },

    async push(): Promise<GitStatus> {
        const response = await apiFetch(`${API_URL}/git/push`, {
            method: 'POST',
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error(await errorMessage(response, 'Push failed'));
        return response.json();
    },

    /** Fast-forwards onto the upstream. Refused, rather than merged, if it cannot. */
    async pull(): Promise<GitStatus> {
        const response = await apiFetch(`${API_URL}/git/pull`, {
            method: 'POST',
            headers: jsonHeaders(),
        });
        if (!response.ok) throw new Error(await errorMessage(response, 'Pull failed'));
        return response.json();
    },
};

/**
 * The API's own explanation, when there is one. A refusal reads as "diverged, 2
 * behind" or "nothing committable has changed", which is the useful half of the error.
 */
async function errorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const body = await response.json();
        if (body?.message) return `${fallback}: ${body.message}`;
    } catch {
        // A response without a JSON body still has a status worth reporting.
    }
    return `${fallback} (${response.status})`;
}
