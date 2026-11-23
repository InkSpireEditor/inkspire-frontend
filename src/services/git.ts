import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

/** One changed path, and whether `/commit` will pick it up. */
export interface GitChange {
    path: string;
    state: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
    /** The index differs from the last commit. */
    staged: boolean;
    /** The file differs from the index; an untracked file does. A file can be both. */
    unstaged: boolean;
    /** The file's id in the tree, or null for a path that is not a chapter or a one-shot. */
    id: string | null;
    /** The story this path is inside, or null for a path outside every story. */
    dir: string | null;
    /** Whether stage, unstage and reset act on this path: a story's manifest, a chapter or a one-shot. */
    committable: boolean;
}

/**
 * Which changes stage, unstage and reset act on. `files` are file ids and `dir` a story id;
 * both left out means every committable change.
 */
export interface GitSelection {
    files?: string[];
    dir?: string;
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
    /** The paths this commit actually touched: what was staged. */
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

    /** Commits what is staged and nothing else. */
    async commit(message: string): Promise<GitCommitResult> {
        const response = await apiFetch(`${API_URL}/git/commit`, {
            method: 'POST',
            headers: jsonHeaders(),
            body: JSON.stringify({ message }),
        });
        if (!response.ok) throw new Error(await errorMessage(response, 'Commit failed'));
        return response.json();
    },

    /** Stages the selected changes. Refused when none of them has an unstaged change. */
    async stage(selection: GitSelection = {}): Promise<GitStatus> {
        return post('stage', selection, 'Stage failed');
    },

    /** Takes the selected changes out of the index; the files keep their edits. */
    async unstage(selection: GitSelection = {}): Promise<GitStatus> {
        return post('unstage', selection, 'Unstage failed');
    },

    /**
     * Restores the selected files from the last commit, discarding the edit for good. A new
     * file is left as it is: it has no last commit to go back to.
     */
    async reset(selection: GitSelection = {}): Promise<GitStatus> {
        return post('reset', selection, 'Reset failed');
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

async function post(route: string, selection: GitSelection, fallback: string): Promise<GitStatus> {
    const response = await apiFetch(`${API_URL}/git/${route}`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ files: selection.files ?? [], dir: selection.dir ?? null }),
    });
    if (!response.ok) throw new Error(await errorMessage(response, fallback));
    return response.json();
}

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
