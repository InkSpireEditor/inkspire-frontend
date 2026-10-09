<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, provide, readonly } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TreeItem from './TreeItem.vue'
import Modal from './Modal.vue'
import ModelSelector from './ModelSelector.vue'
import { filesManagerService, type FileSystemNode } from '../services/filesManager'
import { llmService } from '../services/llm'
import { useTheme } from '../services/theme'
import { useSharedFeatures } from '../services/sharedFeatures'
import { useSharedFiles } from '../services/sharedFiles'
import { useSharedGit } from '../services/sharedGit'
import { useRename } from '../services/rename'
import { allowsRootFiles, asSpace, SPACES, SPACE_LABELS, type Space } from '../services/spaces'
import { isLoggedIn, logout } from '../services/api'

const { toggleTheme, isDarkMode } = useTheme()
const { selectedFileId, setSelectedFile, clearSelectedFile } = useSharedFiles()
const { refresh: refreshGitStatus } = useSharedGit()
// The same flag the dice button reads, kept fresh by Text.vue's own
// ensureFeaturesLoaded() -- this component only ever reads it, for the
// title-edit modal's own instruction+Generate section (frontend#30).
const { title: titleFeatureEnabled } = useSharedFeatures()
const route = useRoute()
const router = useRouter()

/** Best-effort: a stale git panel is a smaller problem than a broken action. */
const refreshGitStatusQuietly = () => {
  refreshGitStatus().catch(() => {})
}

/**
 * Tells a story's dashboard, if one happens to be open, that this component just
 * changed one of that story's own chapters (or the story itself) -- a change the
 * dashboard has no way to notice through its own fetch. Carried as `detail` rather
 * than reusing the plain, detail-less 'stories:changed' event this component also
 * listens for (dispatched by the dashboard after a delete): without a storyId, a
 * dashboard for an unrelated story would reload for no reason.
 */
const notifyDashboard = (storyId: string | null | undefined) => {
    if (storyId) {
        window.dispatchEvent(new CustomEvent('stories:changed', { detail: { storyId } }))
    }
}

/** Which tab was open last time, so a reload comes back where it was left. */
const ACTIVE_SPACE_KEY = 'activeSpace'

// Client-side input limits, mirroring the API's. Checked here only to fail fast
// with a readable message; the backend rejects over-long input regardless.
const MAX_NAME_LENGTH = 255
const MAX_SUMMARY_LENGTH = 2000
// Matches inkspire_api/titles.py's own ceiling on the writer's steering.
const MAX_INSTRUCTION_LENGTH = 300

// Reactive state variables. Vue's 'ref' makes these variables reactive,
// meaning the UI will automatically update when their values change.
//
// One tree per space, so switching tabs shows what was already fetched instead of
// refetching it. The active tab is what the actions below act on.
const activeSpace = ref<Space>(asSpace(localStorage.getItem(ACTIVE_SPACE_KEY)))
const trees = ref<Record<Space, FileSystemNode[]>>({ stories: [], notes: [] })
const fetched = ref<Record<Space, boolean>>({ stories: false, notes: false })
const fileSystem = computed(() => trees.value[activeSpace.value])
const selectedNodeId = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Modal State Management
const showModal = ref(false)
const modalType = ref<'create-file' | 'create-dir' | 'create-one-shot' | 'edit'>('create-file')
const modalTitle = ref('')
const modalInputName = ref('')
const modalInputContext = ref('')
const modalContextVisible = ref(false)
const targetNodeId = ref<string | null>(null)
const nodeToEdit = ref<FileSystemNode | null>(null)
/**
 * Which space the open modal's operation actually targets -- not necessarily
 * `activeSpace`, the tab the sidebar happens to be showing. Every in-tree
 * trigger (a tab's own root menu, a node's own context menu) only ever fires
 * from inside the tab matching its node's space, so `activeSpace` was a correct
 * stand-in for that until frontend#30: `Text.vue`'s title click can ask this
 * component to open the edit modal for a file while the sidebar sits on a
 * different tab entirely, and `submitModal` reading `activeSpace` there would
 * send the rename to the wrong root.
 */
const modalSpace = ref<Space>(activeSpace.value)
/** The writer's own steering for a title suggestion (frontend#30) -- local to
 *  the open modal, cleared whenever it opens; never persisted. */
const modalInstruction = ref('')
/** Whether a title suggestion is in flight for the open modal's Generate button. */
const generatingTitle = ref(false)

// Confirmation Dialog State Management
const showConfirm = ref(false)
const confirmMessage = ref('')
const nodeToDelete = ref<FileSystemNode | null>(null)

// Error Dialog State Management
const showError = ref(false)
const errorMessage = ref('')

// Root menu open/close state
const showRootMenu = ref(false)

// 'provide' allows us to share state and methods with all descendant components 
// (like TreeItem) without having to pass props through every level of the tree.
provide('treeContext', {
  selectedNodeId: readonly(selectedNodeId), // Expose as readonly to ensure only this component mutates it
  space: readonly(activeSpace), // Which root the node is in, which decides its icon
  onSelect: (node: FileSystemNode) => handleSelect(node),
  onAction: (action: string, node: FileSystemNode | null, parentId: string | null = null) => handleNodeAction(action, node, parentId)
})

/**
 * Fetches one space's tree from the backend: one request for the whole root, each
 * directory carrying the files in it.
 *
 * The response is already in the order to draw — a story's chapters in `story.yaml`
 * order, everything else by name — so nothing is sorted here. Directories come before
 * the files at the root, which is the one arrangement the API does not decide.
 *
 * Both spaces answer the same shape, so this reads either one.
 *
 * `silent` skips the loading flag: a refresh after an action (create, rename, delete)
 * has a tree already on screen, and flipping `loading` swaps the whole `<ul>` out for
 * the "Loading..." div, unmounting every TreeItem -- which resets each one's own
 * `isOpen` back to closed. Only the first fetch of a space, with nothing to show yet,
 * needs it.
 */
const fetchTree = async (space: Space, { silent = false }: { silent?: boolean } = {}) => {
  if (!isLoggedIn()) return

  if (!silent) loading.value = true
  try {
    const response = await filesManagerService.getTree(space)

    const dirs: FileSystemNode[] = (response.dirs || []).map((dir) => ({
      id: dir.id,
      name: dir.name,
      type: 'D',
      summary: dir.summary,
      children: dir.files.map((file) => ({
        id: file.id,
        name: file.name,
        type: 'F' as const,
        status: file.status,
        parentId: dir.id,
      })),
    }))

    const rootFiles: FileSystemNode[] = (response.files || []).map((file) => ({
      id: file.id,
      name: file.name,
      type: 'F',
      status: file.status,
    }))

    trees.value[space] = [...dirs, ...rootFiles]
    fetched.value[space] = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    if (!silent) loading.value = false
  }
}

/**
 * Shows a space, fetching its tree the first time it is opened.
 * The selection is left alone: a file stays open while the other tab is read.
 */
const selectSpace = (space: Space) => {
  activeSpace.value = space
  localStorage.setItem(ACTIVE_SPACE_KEY, space)
  error.value = null
  if (!fetched.value[space]) fetchTree(space)
}

/**
 * Handles the selection of a tree node.
 * Updates the selected node state.
 * @param node The node being selected.
 */
const handleSelect = (node: FileSystemNode) => {
  selectedNodeId.value = node.id
  setSelectedFile(activeSpace.value, node.id)
}

/**
 * Handles actions triggered from the root menu (e.g., create file/dir at root, logout).
 * @param action The action identifier string.
 */
const handleRootAction = (action: string) => {
    showRootMenu.value = false
    if (action === 'create-file') {
        openModal('create-file', null)
    } else if (action === 'create-one-shot') {
        openModal('create-one-shot', null)
    } else if (action === 'create-dir') {
        openModal('create-dir', null)
    } else if (action === 'logout') {
        handleLogout()
    }
}

/**
 * Closes the root menu on any click landing outside its trigger. Registered as a
 * document listener while the menu is open. TreeItem solves the same problem for
 * per-node menus with the v-click-outside directive.
 */
const closeRootMenu = (e: MouseEvent) => {
    const trigger = document.querySelector('.root-menu-trigger')
    if (trigger && !trigger.contains(e.target as Node)) {
        showRootMenu.value = false
    }
}

/**
 * Handles actions specific to a tree node (e.g., edit, delete, create child).
 * @param action The action identifier.
 * @param node The context node.
 * @param parentId Optional parent ID for creation actions.
 */
const handleNodeAction = (action: string, node: FileSystemNode | null, parentId: string | null = null) => {
    if (action === 'create-file') {
        openModal('create-file', parentId) // parentId comes from the directory node
    } else if (action === 'edit' && node) {
        openModal('edit', node.id, node)
    } else if (action === 'delete' && node) {
        nodeToDelete.value = node
        confirmMessage.value = `Are you sure you want to delete "${node.name}"?`
        showConfirm.value = true
    }
}

/**
 * Opens the modal dialog for file/directory operations.
 * @param type The type of operation (create-file, create-dir, edit).
 * @param targetId The ID of the target directory (for creation) or node (for edit).
 * @param node The node object if editing.
 * @param space Which root this operation targets. Defaults to the active tab,
 *   correct for every in-tree trigger; `handleEditTitleRequest` below passes the
 *   file's own space explicitly, since the sidebar's active tab may disagree.
 */
const openModal = (
    type: 'create-file' | 'create-dir' | 'create-one-shot' | 'edit',
    targetId: string | null,
    node: FileSystemNode | null = null,
    space: Space = activeSpace.value,
) => {
    modalType.value = type
    targetNodeId.value = targetId
    nodeToEdit.value = node
    modalSpace.value = space
    modalInputName.value = node ? node.name : ''
    modalInputContext.value = ''
    modalInstruction.value = ''

    if (type === 'create-file') {
        modalTitle.value = 'Create New File'
        modalContextVisible.value = false
    } else if (type === 'create-one-shot') {
        // A one-shot's summary lives in its own header, written later -- same as a
        // chapter, which is asked for a name alone at creation too.
        modalTitle.value = 'Create One-Shot'
        modalContextVisible.value = false
    } else if (type === 'create-dir') {
        modalTitle.value = 'Create New Directory'
        modalContextVisible.value = true
    } else if (type === 'edit') {
        modalTitle.value =
            node?.type === 'D' ? 'Edit Directory' : space === 'stories' ? 'Edit Title' : 'Edit File'
        modalContextVisible.value = node?.type === 'D'
        // The tree already carries a directory's summary, so editing one fetches nothing.
        modalInputContext.value = node?.type === 'D' ? node.summary || '' : ''
    }

    showModal.value = true
}

/**
 * Whether the open modal should offer the instruction+Generate section
 * (frontend#30): editing a stories-space file -- a chapter or a one-shot, never
 * a directory -- with the server's small model configured. The same
 * `titleFeatureEnabled` flag the dice button reads.
 */
const showTitleAssist = computed(
    () =>
        modalType.value === 'edit' &&
        modalSpace.value === 'stories' &&
        nodeToEdit.value?.type !== 'D' &&
        titleFeatureEnabled.value,
)

/**
 * Asks the configured small model for a title and fills the modal's own name
 * field with it, for review -- never applies anything itself, unlike the dice
 * button's own immediate-apply path. A failure shows its real message, the same
 * way `Text.vue`'s own dice-button handler does, rather than this modal's
 * generic "Operation failed".
 */
const generateTitle = async () => {
    if (!nodeToEdit.value || generatingTitle.value) return
    generatingTitle.value = true
    try {
        modalInputName.value = await llmService.suggestTitle(
            nodeToEdit.value.id,
            modalInstruction.value || undefined,
        )
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : 'Could not generate a title'
        showError.value = true
    } finally {
        generatingTitle.value = false
    }
}

/**
 * `Text.vue`'s title click (frontend#30): opens this component's own edit modal
 * for the file it names, rather than a second modal living there. The synthetic
 * node carries only what the edit-file path actually reads -- no tree search
 * needed to find a "real" one.
 */
const handleEditTitleRequest = (event: Event) => {
    const { space, id, name, parentId } = (event as CustomEvent).detail
    openModal('edit', id, { id, name, type: 'F', parentId }, space)
}

/**
 * Renames a file, and follows it to its new id -- `useRename` (`services/rename.ts`)
 * has the rule and why it exists; `Text.vue`'s title-proposal button (frontend#30)
 * shares the same implementation rather than a second copy of it.
 */
const rename = useRename()
const renameFile = async (space: Space, node: FileSystemNode, name: string) => {
    await rename(space, node.id, name)
}

/**
 * Submits the modal form to perform the requested operation (create/edit).
 */
const submitModal = async () => {
    const name = modalInputName.value.trim()
    if (!name) {
        errorMessage.value = 'Name cannot be empty.'
        showError.value = true
        return
    }
    if (name.length > MAX_NAME_LENGTH) {
        errorMessage.value = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`
        showError.value = true
        return
    }
    if (modalContextVisible.value && modalInputContext.value.length > MAX_SUMMARY_LENGTH) {
        errorMessage.value = `Context/summary must be ${MAX_SUMMARY_LENGTH} characters or fewer.`
        showError.value = true
        return
    }

    if (!isLoggedIn()) return

    try {
        // Not `activeSpace`: the modal's own operation targets whichever space it
        // was opened for, which can differ from the sidebar's active tab when the
        // open happened from `Text.vue`'s title click rather than from the tree
        // itself (frontend#30) -- see `openModal`'s own docstring.
        const space = modalSpace.value
        if (modalType.value === 'create-file') {
            await filesManagerService.addFile(space, name, targetNodeId.value)
        } else if (modalType.value === 'create-one-shot') {
            await filesManagerService.addFile(space, name, null)
        } else if (modalType.value === 'create-dir') {
            await filesManagerService.addDir(space, name, modalInputContext.value)
        } else if (modalType.value === 'edit' && nodeToEdit.value) {
            if (nodeToEdit.value.type === 'D') {
                await filesManagerService.editDir(space, nodeToEdit.value.id, name, modalInputContext.value)
            } else {
                await renameFile(space, nodeToEdit.value, name)
            }
        }
        
        showModal.value = false
        fetchTree(space, { silent: true }) // Refresh tree without folding it
        if (space === 'stories') {
            refreshGitStatusQuietly()
            const storyId =
                modalType.value === 'create-file'
                    ? targetNodeId.value
                    : modalType.value === 'edit' && nodeToEdit.value
                      ? nodeToEdit.value.type === 'D'
                          ? nodeToEdit.value.id
                          : nodeToEdit.value.parentId
                      : null
            notifyDashboard(storyId)
        }
    } catch (e) {
        errorMessage.value = 'Operation failed'
        showError.value = true
        console.error(e)
    }
}

/**
 * Confirms and executes the deletion of a node.
 */
const confirmDelete = async () => {
    if (!isLoggedIn() || !nodeToDelete.value) return

    const space = activeSpace.value
    const deletedNode = nodeToDelete.value
    try {
        if (deletedNode.type === 'D') {
            await filesManagerService.delDir(space, deletedNode.id)
        } else {
            // Compared against the shared selection, not the local selectedNodeId: a
            // story chapter's selection is now set by the write route rather than by
            // handleSelect, so selectedNodeId alone would miss it.
            if (selectedFileId.value === deletedNode.id) {
                clearSelectedFile()
                selectedNodeId.value = null
            }
            // A chapter deleted while its own write route is open leaves that route
            // pointing at an id the API no longer has -- clearing the selection above
            // does not move the editor off that URL, so this does, the same way
            // renameFile above follows a rename to its new id instead of away.
            if (route.name === 'write' && route.params.fileId === deletedNode.id) {
                router.push({ name: 'dashboard', params: { id: route.params.id } })
            }
            await filesManagerService.delFile(space, deletedNode.id)
        }
        showConfirm.value = false
        fetchTree(space, { silent: true })
        if (space === 'stories') {
            refreshGitStatusQuietly()
            notifyDashboard(deletedNode.type === 'D' ? deletedNode.id : deletedNode.parentId)
        }
    } catch (e) {
        errorMessage.value = 'Delete failed'
        showError.value = true
        console.error(e)
    }
}

/**
 * Logs the user out: clears the token, resets selection state, and returns
 * to the login screen via the reactive auth:expired event in App.vue.
 */
const handleLogout = async () => {
    await logout()
    clearSelectedFile()
}

/**
 * 'stories:changed' also fires for changes this component made itself --
 * `notifyDashboard` dispatches it with a `storyId` right after this component's own
 * `fetchTree` call above, so the refetch here is a harmless repeat in that case. The
 * case this listener exists for is DashboardView.vue's plain, detail-less dispatch
 * after deleting a story: a change to the stories tree this component did not make
 * and so cannot refresh through its own fetchTree calls. Always refetches, even if
 * the stories tab is not the one open.
 */
const handleStoriesChanged = () => {
    fetchTree('stories', { silent: true })
}

onMounted(() => {
    fetchTree(activeSpace.value)
    document.addEventListener('click', closeRootMenu)
    window.addEventListener('stories:changed', handleStoriesChanged)
    window.addEventListener('text:edit-title', handleEditTitleRequest)
})

onUnmounted(() => {
    document.removeEventListener('click', closeRootMenu)
    window.removeEventListener('stories:changed', handleStoriesChanged)
    window.removeEventListener('text:edit-title', handleEditTitleRequest)
})
</script>

<template>
  <div class="file-system-container">
    <div class="title-bar">
      <span>INKSPIRE</span>
      <div class="actions">
        <button class="icon-btn" @click="toggleTheme" title="Toggle Theme">
          {{ isDarkMode() ? '☀️' : '🌙' }}
        </button> 
        <!-- Root Menu -->
        <div class="root-menu-trigger">
            <button class="icon-btn" @click.stop="showRootMenu = !showRootMenu">⋮</button>
            <div class="root-menu" v-show="showRootMenu">
                <!-- A chapter belongs to a story, so a generic "New File" has no
                     meaning at the root of that space -- a one-shot is what a loose
                     file there is called, and gets its own, differently-worded entry. -->
                <div v-if="allowsRootFiles(activeSpace)" @click="handleRootAction('create-file')">New File</div>
                <div v-if="activeSpace === 'stories'" @click="handleRootAction('create-one-shot')">New One-Shot</div>
                <div @click="handleRootAction('create-dir')">
                  {{ activeSpace === 'stories' ? 'New Story' : 'New Directory' }}
                </div>
                <div @click="handleRootAction('logout')">Logout</div>
            </div>
        </div>
      </div>
    </div>

    <!-- One tab per root: the stories, and everything that is not a novel. -->
    <div class="space-tabs" role="tablist">
      <button
        v-for="space in SPACES"
        :key="space"
        class="space-tab"
        role="tab"
        :class="{ active: space === activeSpace }"
        :aria-selected="space === activeSpace"
        @click="selectSpace(space)"
      >{{ SPACE_LABELS[space] }}</button>
    </div>

    <div class="tree-content" v-if="loading">Loading...</div>
    <div class="tree-content" v-else-if="error">{{ error }}</div>
    <ul class="tree-content" v-else>
      <!-- Recursively render the tree using TreeItem component -->
      <TreeItem
        v-for="node in fileSystem"
        :key="node.id"
        :node="node"
        :level="0"
      />
    </ul>

    <!-- Unified Modal for Forms -->
    <Modal
      :show="showModal"
      :title="modalTitle"
      :confirm-disabled="generatingTitle"
      @close="showModal = false"
      @confirm="submitModal"
    >
      <div class="form-group">
        <label>Name:</label>
        <input v-model="modalInputName" placeholder="Enter name" @keyup.enter="submitModal" />
      </div>
      <div v-if="modalContextVisible" class="form-group">
        <label>Context/Summary:</label>
        <textarea v-model="modalInputContext" placeholder="Enter context" rows="3"></textarea>
      </div>
      <!-- Instruction + Generate (frontend#30): only while editing a stories-space
           file, and only once the server has a small model configured. -->
      <div v-if="showTitleAssist" class="form-group">
        <label>Instruction (optional):</label>
        <textarea
          v-model="modalInstruction"
          placeholder="e.g. make it more ominous"
          rows="2"
          :maxlength="MAX_INSTRUCTION_LENGTH"
        ></textarea>
        <button
          type="button"
          class="generate-btn"
          :disabled="generatingTitle"
          @click="generateTitle"
        >
          {{ generatingTitle ? 'Asking…' : '🎲 Generate' }}
        </button>
      </div>
    </Modal>

    <!-- Unified Modal for Confirmation -->
    <Modal 
      :show="showConfirm"
      title="Confirm Action"
      confirm-text="Delete"
      :is-danger="true"
      @close="showConfirm = false"
      @confirm="confirmDelete"
    >
      <p>{{ confirmMessage }}</p>
    </Modal>

    <!-- Error Dialog -->
    <Modal
      :show="showError"
      title="Error"
      confirm-text="OK"
      hide-cancel
      @close="showError = false"
      @confirm="showError = false"
    >
      <p>{{ errorMessage }}</p>
    </Modal>

    <ModelSelector />
  </div>
</template>

<style scoped>
.file-system-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--color-background);
  box-shadow: var(--shadow-normal);
  border-right: 1px solid var(--color-border);
}

.space-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
}

.space-tab {
  flex: 1;
  padding: var(--space-2) 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--color-text);
  font-size: 0.85rem;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: var(--transition);
}

.space-tab:hover {
  background-color: var(--hover-background);
}

.space-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  background-color: var(--color-background);
}

.space-tab:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
}

.title-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 48px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background);
  position: relative;
}

.title-bar span {
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.2rem;
    color: var(--color-text);
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: background-color var(--transition), color var(--transition);
}

.icon-btn:hover {
    background-color: var(--color-background-mute);
    color: var(--color-primary);
}

.icon-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
}

.root-menu-trigger {
    position: relative;
}

.root-menu {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: var(--space-1);
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    min-width: 150px;
    box-shadow: var(--shadow-strong);
    z-index: 200;
    overflow: hidden;
    padding: var(--space-1);
}

.root-menu div {
    padding: 10px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background-color var(--transition);
}
.root-menu div:hover {
    background-color: var(--color-background-mute);
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  margin: 0;
}

/* The title-edit modal's Generate button (frontend#30) -- small and
   right-aligned under its own textarea, not styled like the modal's own
   Cancel/Rename pair below it. */
.generate-btn {
  align-self: flex-end;
  margin-top: var(--space-1);
  padding: 6px 12px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  transition: background-color var(--transition), border-color var(--transition);
}

.generate-btn:hover:not(:disabled) {
  border-color: var(--color-border-hover);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
