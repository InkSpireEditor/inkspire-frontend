import { API_URL, jsonHeaders } from './api';
import { apiFetch } from './apiFetch';

/**
 * One entity in the graph. `type` is already the single most specific RDF class --
 * chosen server-side, from the deepest point in the `rdfs:subClassOf` hierarchy --
 * so nothing here needs to know anything about the ontology: it is just a string
 * to colour and filter by.
 */
export interface LoreNode {
    /** Full IRI, e.g. "https://example.test/entity#Doe" -- opaque, never parsed beyond
     *  splitting on "#" to get the fragment a detail lookup needs. */
    id: string;
    /** schema:name if the entity has one, else the IRI's local name. */
    label: string;
    type: string;
    /** Every class local name, sorted, WITHOUT the universal "Entity" (unless it's the only one). */
    types: string[];
    /** Literal predicate local name -> values. Prose ("section*") is already excluded. */
    attrs: Record<string, string[]>;
    /** Number of link endpoints touching this node. */
    degree: number;
}

export interface LoreLink {
    /** Subject IRI. */
    source: string;
    /** Object IRI. */
    target: string;
    /** The predicate's local name, e.g. "memberOf". */
    label: string;
}

export interface LoreGraph {
    /** Sorted by id. */
    nodes: LoreNode[];
    /** NOT stably ordered -- key a list by `${source}|${label}|${target}`, not by index. */
    links: LoreLink[];
}

/**
 * One entity's fields, prose included. The scalar/relation key set is open-ended --
 * each lorebook's extension.yaml can add more -- so this is typed loosely on purpose.
 */
export interface LoreEntity {
    /** Full IRI. */
    id: string;
    /** The path parameter as given, e.g. "Doe". */
    local: string;
    /** Every class local name, sorted -- INCLUDES "Entity" here, unlike LoreNode.types. */
    types: string[];
    /** Sorted nicknames. */
    aka: string[];
    /** Present-only, in the same order the Markdown sheet uses. */
    sections: Record<string, string>;
    /** Every other vocabulary scalar (string | null) or relation (string[] of LABELS, not ids). */
    [field: string]: unknown;
}

/** Heading for each character-layout section key, in the order the Markdown sheet uses. */
export const CHARACTER_SECTION_HEADINGS: Record<string, string> = {
    personality: 'Personality and Traits',
    backstory: 'Backstory',
    role: 'Role in the Story',
    abilities: 'Abilities and Skills',
    relationships: 'Relationships',
    world: 'World Interaction',
    voice: 'Quotes and Voice',
    misc: 'Miscellaneous',
    visuals: 'Visuals and References',
    notes: 'Notes for Further Development',
};

/** Same, for the location layout -- "visuals" and "notes" mean something different here. */
export const LOCATION_SECTION_HEADINGS: Record<string, string> = {
    history: 'History and Origin',
    purpose: 'Purpose and Function',
    inhabitants: 'Inhabitants and Culture',
    geography: 'Geography and Layout',
    politics: 'Politics and Power',
    threats: 'Threats and Challenges',
    lore: 'Lore and Mysteries',
    narrative: 'Interaction with the Story',
    visuals: 'Visuals and Symbols',
    notes: 'Notes for Further Development',
};

/**
 * Which heading map applies to an entity. The API reports every class the entity
 * carries (subclass ancestors always included), not which of the two sheet layouts
 * it used -- but `Character`/`Location` are the two core, always-present anchor
 * classes each layout keys off, so checking for them here is exactly as reliable as
 * the server's own check.
 */
export function sectionHeadingsFor(entity: LoreEntity): Record<string, string> {
    if (entity.types.includes('Character')) return CHARACTER_SECTION_HEADINGS;
    if (entity.types.includes('Location')) return LOCATION_SECTION_HEADINGS;
    return {}; // Matches an entity with empty `sections` -- should not otherwise occur.
}

async function loreFetch<T>(url: string, fallbackMessage: string): Promise<T> {
    const response = await apiFetch(url, { headers: jsonHeaders() });
    if (!response.ok) {
        let body: { message?: string } | null = null;
        try {
            body = await response.json();
        } catch {
            // No JSON body to read -- the plain fallback message is all there is.
        }
        throw new Error(body?.message ?? fallbackMessage);
    }
    return response.json();
}

export const loreService = {
    async getGraph(storyId: string): Promise<LoreGraph> {
        return loreFetch(
            `${API_URL}/stories/dir/${storyId}/lore/graph`,
            'Failed to load the knowledge graph'
        );
    },

    async getEntity(storyId: string, local: string): Promise<LoreEntity> {
        return loreFetch(
            `${API_URL}/stories/dir/${storyId}/lore/entity/${local}`,
            'Failed to load this entity'
        );
    },
};
