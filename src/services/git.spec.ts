import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gitService, type GitStatus } from './git';

const API_URL = 'http://localhost:8000/api';

// Headers every JSON request carries. The JWT rides along as an httpOnly cookie via
// credentials: 'include'.
const jsonHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
};

const CLEAN: GitStatus = {
    branch: 'main',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    fetched: false,
    clean: true,
    changes: [],
};

describe('gitService', () => {
    const fetchSpy = vi.spyOn(window, 'fetch');

    beforeEach(() => {
        fetchSpy.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('status', () => {
        it('reads the branch and what has changed, with credentials', async () => {
            fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => CLEAN } as Response);

            const result = await gitService.status();

            expect(result).toEqual(CLEAN);
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/git/status`, {
                headers: jsonHeaders,
                credentials: 'include',
            });
        });

        it('reports the API message on failure', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ code: 500, message: 'The story repository is not there.' }),
            } as Response);

            await expect(gitService.status()).rejects.toThrow(
                'Failed to read git status: The story repository is not there.'
            );
        });

        it('falls back to the status code with no JSON body', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 502,
                json: async (): Promise<unknown> => {
                    throw new Error('no body');
                },
            } as Response);

            await expect(gitService.status()).rejects.toThrow('Failed to read git status (502)');
        });
    });

    describe('commit', () => {
        it('sends only the message, and answers the new status', async () => {
            const body = { ...CLEAN, ahead: 1, sha: 'abc123', message: 'Draft the opening', committed: ['stories/example/chapters/one.ink'] };
            fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);

            const result = await gitService.commit('Draft the opening');

            expect(result).toEqual(body);
            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/git/commit`, {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ message: 'Draft the opening' }),
                credentials: 'include',
            });
        });

        it('reports a refusal from the API', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 409,
                json: async () => ({ code: 409, message: 'Nothing committable has changed.' }),
            } as Response);

            await expect(gitService.commit('Draft')).rejects.toThrow(
                'Commit failed: Nothing committable has changed.'
            );
        });
    });

    describe('push', () => {
        it('sends no body', async () => {
            fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => CLEAN } as Response);

            await gitService.push();

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/git/push`, {
                method: 'POST',
                headers: jsonHeaders,
                credentials: 'include',
            });
        });

        it('reports a rejected push', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 409,
                json: async () => ({ code: 409, message: 'The remote has commits this branch does not (1 behind). Pull first.' }),
            } as Response);

            await expect(gitService.push()).rejects.toThrow('Push failed:');
        });
    });

    describe('pull', () => {
        it('sends no body', async () => {
            fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => CLEAN } as Response);

            await gitService.pull();

            expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/git/pull`, {
                method: 'POST',
                headers: jsonHeaders,
                credentials: 'include',
            });
        });

        it('reports a diverged branch', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 409,
                json: async () => ({ code: 409, message: 'The branch has diverged from origin/main (1 ahead, 1 behind). Resolve it in a shell.' }),
            } as Response);

            await expect(gitService.pull()).rejects.toThrow('Pull failed:');
        });
    });
});
