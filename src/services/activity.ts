import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

/** One day's words, as the activity route answers them. */
export interface ActivityDay {
    date: string;
    words: number;
}

export const activityService = {
    /**
     * The words written per day, for the last `days` calendar days. 364 is 52 weeks,
     * which is what the grid draws.
     */
    async get(days = 364): Promise<ActivityDay[]> {
        const response = await apiFetch(`${API_URL}/stories/activity?days=${days}`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) {
            let body: { message?: string } | null = null;
            try {
                body = await response.json();
            } catch {
                // No JSON body to read -- the plain fallback message is all there is.
            }
            throw new Error(body?.message ?? 'Failed to load the activity');
        }
        return response.json();
    },
};
