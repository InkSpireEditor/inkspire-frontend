import { gitService, type GitSelection, type GitStatus } from './git';
import { selectChanges, resettable } from './gitMarks';
import { useSharedGit } from './sharedGit';

/**
 * Stage, unstage and reset, with what each one has to tell the rest of the page. One
 * implementation for the sidebar's file menu, the homepage's panel and a story's panel.
 * A failure is thrown, for the caller to show.
 */
export function useGitActions() {
    const { gitStatus, setStatus } = useSharedGit();

    const stage = async (selection: GitSelection = {}): Promise<GitStatus> => {
        const status = await gitService.stage(selection);
        setStatus(status);
        return status;
    };

    const unstage = async (selection: GitSelection = {}): Promise<GitStatus> => {
        const status = await gitService.unstage(selection);
        setStatus(status);
        return status;
    };

    /**
     * Discards the selected changes to files the last commit has. A reset can bring back a
     * deleted chapter and changes the text of an open one, so it tells the tree and the
     * homepage (`tree:changed`), each affected story's page (`stories:changed`) and the
     * editor, which has to reload the file and drop what it had pending (`git:reset`, with
     * the ids). What is told is read from the status as it was before the call.
     */
    const reset = async (selection: GitSelection = {}): Promise<GitStatus> => {
        const affected = selectChanges(gitStatus.value, selection).filter(resettable);
        const status = await gitService.reset(selection);
        setStatus(status);

        const ids = affected.flatMap((change) => (change.id ? [change.id] : []));
        const stories = new Set(affected.flatMap((change) => (change.dir ? [change.dir] : [])));
        window.dispatchEvent(new Event('tree:changed'));
        for (const storyId of stories) {
            window.dispatchEvent(
                new CustomEvent('stories:changed', { detail: { storyId, space: 'stories' } }),
            );
        }
        window.dispatchEvent(new CustomEvent('git:reset', { detail: { ids } }));
        return status;
    };

    return { stage, unstage, reset };
}
