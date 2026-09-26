import { ref } from 'vue'
import { gitService, type GitStatus } from './git'

/**
 * Module-level singleton: the last known git status, read by GitPanel and refreshed
 * by anything else that changes the repository. Shared by importing this module
 * rather than through a store, the way sharedFiles and sharedModel are.
 */
const gitStatus = ref<GitStatus | null>(null)

/**
 * Refetches the status and stores it. Called after every action that can change the
 * repository: a commit, a push, a pull, and a save, a create, a rename or a delete
 * anywhere else in the app. Failures are left to the caller — GitPanel is the one
 * place with somewhere to show them.
 */
async function refresh(): Promise<void> {
  gitStatus.value = await gitService.status()
}

/**
 * Stores a status a caller already has, without a second fetch. `commit()`, `push()`
 * and `pull()` each answer the same shape `status()` does, so GitPanel's own actions
 * use this instead of calling `refresh()` right back.
 */
function setStatus(status: GitStatus): void {
  gitStatus.value = status
}

/** Clears the cached status. Used by tests to isolate the shared singleton. */
export function resetSharedGit() {
  gitStatus.value = null
}

export const useSharedGit = () => ({
  gitStatus,
  refresh,
  setStatus
})
