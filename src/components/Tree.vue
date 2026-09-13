<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, provide, readonly } from 'vue'
import TreeItem from './TreeItem.vue'
import Modal from './Modal.vue'
import ModelSelector from './ModelSelector.vue'
import { filesManagerService, type FileSystemNode, type TreeApiResponse } from '../services/filesManager'
import { useTheme } from '../services/theme'
import { useSharedFiles } from '../services/sharedFiles'
import { allowsRootFiles, asSpace, SPACES, SPACE_LABELS, type Space } from '../services/spaces'
import { isLoggedIn, logout } from '../services/api'

const { toggleTheme, isDarkMode } = useTheme()
const { setSelectedFile, clearSelectedFile } = useSharedFiles()

/** Which tab was open last time, so a reload comes back where it was left. */
const ACTIVE_SPACE_KEY = 'activeSpace'

// Client-side input limits, mirroring the API's. Checked here only to fail fast
// with a readable message; the backend rejects over-long input regardless.
const MAX_NAME_LENGTH = 255
const MAX_SUMMARY_LENGTH = 2000

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
const modalType = ref<'create-file' | 'create-dir' | 'edit'>('create-file')
const modalTitle = ref('')
const modalInputName = ref('')
const modalInputContext = ref('')
const modalContextVisible = ref(false)
const targetNodeId = ref<string | null>(null)
const nodeToEdit = ref<FileSystemNode | null>(null)

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
 * Fetches one space's tree from the backend.
 * Populates it with root directories and files, fetching directory content in parallel.
 * Sorts the result so directories appear before files.
 *
 * Both spaces answer the same shape, so this reads either one.
 */
const fetchTree = async (space: Space) => {
  if (!isLoggedIn()) return

  loading.value = true
  try {
    const response = await filesManagerService.getTree(space)
    
    const dirs = response.dirs || {}
    const files = response.files || {}
    
    const rootFiles: FileSystemNode[] = []

    // 1. Collect Root Files
    for (const id in files) {
        rootFiles.push({
            id,
            name: files[id]!.name,
            type: 'F'
        })
    }

    // 2. Collect Directories and fetch their content
    const dirPromises = Object.entries(dirs).map(async ([id, dir]: [string, TreeApiResponse['dirs'][string]]) => {
        const dirNode: FileSystemNode = {
            id,
            name: dir.name,
            type: 'D',
            children: []
        }
        
        try {
            const content = await filesManagerService.getDirContent(space, id)
            const contentFiles = content.files || {}
            const children: FileSystemNode[] = []
            for(const fileId in contentFiles) {
                children.push({
                    id: fileId,
                    name: contentFiles[fileId]!.name,
                    type: 'F',
                    parentId: id // Associate file with its parent directory
                })
            }
            // Sort children alphabetically
            dirNode.children = children.sort((a, b) => a.name.localeCompare(b.name))
        } catch (e) {
            console.error(`Failed to load content for dir ${id}`, e)
        }
        
        return dirNode
    })

    const loadedDirs = await Promise.all(dirPromises)
    
    // Sort root items: Dirs (A-Z) then Files (A-Z)
    loadedDirs.sort((a, b) => a.name.localeCompare(b.name))
    rootFiles.sort((a, b) => a.name.localeCompare(b.name))
    
    trees.value[space] = [...loadedDirs, ...rootFiles]
    fetched.value[space] = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
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
 */
const openModal = async (type: 'create-file' | 'create-dir' | 'edit', targetId: string | null, node: FileSystemNode | null = null) => {
    modalType.value = type
    targetNodeId.value = targetId
    nodeToEdit.value = node
    modalInputName.value = node ? node.name : ''
    modalInputContext.value = ''
    
    if (type === 'create-file') {
        modalTitle.value = 'Create New File'
        modalContextVisible.value = false
    } else if (type === 'create-dir') {
        modalTitle.value = 'Create New Directory'
        modalContextVisible.value = true
    } else if (type === 'edit') {
        modalTitle.value = node?.type === 'D' ? 'Edit Directory' : 'Edit File'
        modalContextVisible.value = node?.type === 'D'
        if (node?.type === 'D') {
            try {
                const content = await filesManagerService.getDirContent(activeSpace.value, node.id)
                modalInputContext.value = content.summary || ''
            } catch (e) {
                console.error('Failed to fetch directory details for edit', e)
            }
        }
    }
    
    showModal.value = true
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
        const space = activeSpace.value
        if (modalType.value === 'create-file') {
            await filesManagerService.addFile(space, name, targetNodeId.value)
        } else if (modalType.value === 'create-dir') {
            await filesManagerService.addDir(space, name, modalInputContext.value)
        } else if (modalType.value === 'edit' && nodeToEdit.value) {
            if (nodeToEdit.value.type === 'D') {
                await filesManagerService.editDir(space, nodeToEdit.value.id, name, modalInputContext.value)
            } else {
                await filesManagerService.editFile(space, nodeToEdit.value.id, name)
            }
        }
        
        showModal.value = false
        fetchTree(space) // Refresh tree
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
    try {
        if (nodeToDelete.value.type === 'D') {
            await filesManagerService.delDir(space, nodeToDelete.value.id)
        } else {
            if (selectedNodeId.value === nodeToDelete.value.id) {
                clearSelectedFile()
                selectedNodeId.value = null
            }
            await filesManagerService.delFile(space, nodeToDelete.value.id)
        }
        showConfirm.value = false
        fetchTree(space)
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

onMounted(() => {
    fetchTree(activeSpace.value)
    document.addEventListener('click', closeRootMenu)
})

onUnmounted(() => {
    document.removeEventListener('click', closeRootMenu)
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
                <!-- A chapter belongs to a story, so there is no file to create at the
                     root of that space. -->
                <div v-if="allowsRootFiles(activeSpace)" @click="handleRootAction('create-file')">New File</div>
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
      cancel-text="OK"
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
</style>
