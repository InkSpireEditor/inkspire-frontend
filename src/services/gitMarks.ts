import type { GitChange, GitSelection, GitStatus } from './git';

/** What a dot in the sidebar says: some change is not staged, or everything changed is. */
export type GitMark = 'changed' | 'staged';

/**
 * The mark of each chapter and one-shot that has changed, by file id, and of each story that
 * holds a change, by story id. A file is `staged` only when nothing of it is left unstaged, so
 * a staged file edited again shows as `changed`; a story is `changed` when any change inside it
 * is. Only committable paths count, and a path that is a story's `story.yaml` marks its story
 * and nothing else, since it has no row of its own.
 */
export function marksOf(status: GitStatus | null): Map<string, GitMark> {
    const marks = new Map<string, GitMark>();
    for (const change of status?.changes ?? []) {
        if (!change.committable) continue;
        const mark: GitMark = change.unstaged ? 'changed' : 'staged';
        if (change.id) marks.set(change.id, mark);
        if (change.dir) {
            marks.set(change.dir, marks.get(change.dir) === 'changed' ? 'changed' : mark);
        }
    }
    return marks;
}

/** The committable changes a selection names; every one of them when it names nothing. */
export function selectChanges(status: GitStatus | null, selection: GitSelection): GitChange[] {
    const changes = (status?.changes ?? []).filter((change) => change.committable);
    const files = selection.files ?? [];
    if (files.length === 0 && selection.dir === undefined) return changes;
    return changes.filter(
        (change) => (change.id !== null && files.includes(change.id)) || change.dir === selection.dir,
    );
}

/** Whether Stage would do anything to this change. */
export const stageable = (change: GitChange): boolean => change.unstaged;

/** Whether Unstage would do anything to this change. */
export const unstageable = (change: GitChange): boolean => change.staged;

/** Whether Reset would do anything: the last commit has the file, so there is a text to go back to. */
export const resettable = (change: GitChange): boolean =>
    change.state === 'modified' || change.state === 'deleted';

/** The committable change of each chapter and one-shot, by file id: what a file's menu reads. */
export function changesById(status: GitStatus | null): Map<string, GitChange> {
    const byId = new Map<string, GitChange>();
    for (const change of status?.changes ?? []) {
        if (change.committable && change.id) byId.set(change.id, change);
    }
    return byId;
}
