import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

/**
 * A character's colour is authored free text -- a CSS-ish name ("blue") or a
 * "#rrggbb" string -- and used as-is: it identifies that character on screen, it
 * is not chrome, so it is never looked up against a palette the way chrome colours
 * are.
 */
export interface TimelineCharacter {
    key: string;
    name: string;
    color: string;
    /** Event keys, in date order. Consecutive pairs are the thread segments to draw. */
    events: string[];
}

/**
 * `date` is already formatted through this event's authored `dateStyle` -- a display
 * string, not something to parse or compare. The array order events arrive in is the
 * only chronology signal there is.
 */
export interface TimelineEvent {
    key: string;
    date: string;
    description: string;
    characters: string[];
    /** "" when unauthored. */
    href: string;
    /** The event's box, top-left to bottom-right, in layout units -- already laid out server-side. */
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface TimelineArc {
    name: string;
    firstEvent: string;
    lastEvent: string;
}

/**
 * A story's timeline, laid out entirely server-side (`timeline.process()`): every
 * coordinate here is final. Drawing it is arithmetic on these numbers, not a second
 * layout pass.
 */
export interface TimelineResponse {
    title: string;
    maxHeight: number;
    widthStep: number;
    characters: TimelineCharacter[];
    events: TimelineEvent[];
    arcs: TimelineArc[];
}

export const timelineService = {
    async get(storyId: string): Promise<TimelineResponse> {
        const response = await apiFetch(`${API_URL}/stories/dir/${storyId}/timeline`, {
            headers: jsonHeaders(),
        });
        if (!response.ok) {
            let body: { message?: string } | null = null;
            try {
                body = await response.json();
            } catch {
                // No JSON body to read -- the plain fallback message is all there is.
            }
            throw new Error(body?.message ?? 'Failed to load the timeline');
        }
        return response.json();
    },
};
