<script setup lang="ts">
import { ref, onMounted, provide, readonly } from 'vue'
import { useRouter } from 'vue-router'
import TreeItem from './TreeItem.vue'
import Modal from './Modal.vue'
import ModelSelector from './ModelSelector.vue'
import { filesManagerService, type FileSystemNode } from '../services/filesManager'
import { useTheme } from '../services/theme'
import { useSharedFiles } from '../services/sharedFiles'

const router = useRouter()
const { toggleTheme, isDarkMode } = useTheme()
const { setSelectedFile } = useSharedFiles()

// Reactive state variables. Vue's 'ref' makes these variables reactive, 
// meaning the UI will automatically update when their values change.
const fileSystem = ref<FileSystemNode[]>([])
const selectedNodeId = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Modal State Management
const showModal = ref(false)
const modalType = ref<'create-file' | 'create-dir' | 'edit'>('create-file')
const modalTitle = ref('')
const modalInputName = ref('')
const modalInputContext = ref('')
const modalContextVisible = ref(false)
const targetNodeId = ref<number | null>(null)
const nodeToEdit = ref<FileSystemNode | null>(null)

// Confirmation Dialog State Management
const showConfirm = ref(false)
const confirmMessage = ref('')
const nodeToDelete = ref<FileSystemNode | null>(null)

// 'provide' allows us to share state and methods with all descendant components 
// (like TreeItem) without having to pass props through every level of the tree.
provide('treeContext', {
  selectedNodeId: readonly(selectedNodeId), // Expose as readonly to ensure only this component mutates it
  onSelect: (node: FileSystemNode) => handleSelect(node),
  onAction: (action: string, node: FileSystemNode | null, parentId: number | null = null) => handleNodeAction(action, node, parentId)
})

/**
 * Fetches the file system tree from the backend.
 * Populates the tree with root directories and files, fetching directory content in parallel.
 * Sorts the result so directories appear before files.
 */
const fetchTree = async () => {
  const token = localStorage.getItem('jwt_token')
  if (!token) return

  loading.value = true
  try {
    const response = await filesManagerService.getTree(token)
    
    const dirs = response.dirs || {}
    const files = response.files || {}
    
    const rootFiles: FileSystemNode[] = []

    // 1. Collect Root Files
    for (const id in files) {
        rootFiles.push({
            id: parseInt(id),
            name: files[id].name,
            type: 'F'
        })
    }

    // 2. Collect Directories and fetch their content
    const dirPromises = Object.entries(dirs).map(async ([id, dir]: [string, any]) => {
        const dirId = parseInt(id)
        const dirNode: FileSystemNode = {
            id: dirId,
            name: dir.name,
            type: 'D',
            children: []
        }
        
        try {
            const content = await filesManagerService.getDirContent(token, dirId)
            const contentFiles = content.files || {}
            const children: FileSystemNode[] = []
            for(const fileId in contentFiles) {
                children.push({
                    id: parseInt(fileId),
                    name: contentFiles[fileId].name,
                    type: 'F',
                    parentId: dirId // Associate file with its parent directory
                })
            }
            // Sort children alphabetically
            dirNode.children = children.sort((a, b) => a.name.localeCompare(b.name))
        } catch (e) {
            console.error(`Failed to load content for dir ${dirId}`, e)
        }
        
        return dirNode
    })

    const loadedDirs = await Promise.all(dirPromises)
    
    // Sort root items: Dirs (A-Z) then Files (A-Z)
    loadedDirs.sort((a, b) => a.name.localeCompare(b.name))
    rootFiles.sort((a, b) => a.name.localeCompare(b.name))
    
    fileSystem.value = [...loadedDirs, ...rootFiles]
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

/**
 * Handles the selection of a tree node.
 * Updates the selected node state.
 * @param node The node being selected.
 */
const handleSelect = (node: FileSystemNode) => {
  selectedNodeId.value = node.id
  setSelectedFile(node.id)
}

/**
 * Handles actions triggered from the root menu (e.g., create file/dir at root, logout).
 * @param action The action identifier string.
 */
const handleRootAction = (action: string) => {
    if (action === 'create-file') {
        openModal('create-file', null)
    } else if (action === 'create-dir') {
        openModal('create-dir', null)
    } else if (action === 'logout') {
        logout()
    }
}

/**
 * Handles actions specific to a tree node (e.g., edit, delete, create child).
 * @param action The action identifier.
 * @param node The context node.
 * @param parentId Optional parent ID for creation actions.
 */
const handleNodeAction = (action: string, node: FileSystemNode | null, parentId: number | null = null) => {
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
const openModal = async (type: 'create-file' | 'create-dir' | 'edit', targetId: number | null, node: FileSystemNode | null = null) => {
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
            const token = localStorage.getItem('jwt_token')
            if (token) {
                try {
                    const content = await filesManagerService.getDirContent(token, node.id)
                    modalInputContext.value = content.summary || ''
                } catch (e) {
                    console.error('Failed to fetch directory details for edit', e)
                }
            }
        }
    }
    
    showModal.value = true
}

/**
 * Submits the modal form to perform the requested operation (create/edit).
 */
const submitModal = async () => {
    const token = localStorage.getItem('jwt_token')
    if (!token) return

    try {
        if (modalType.value === 'create-file') {
            await filesManagerService.addFile(token, modalInputName.value, targetNodeId.value)
        } else if (modalType.value === 'create-dir') {
            await filesManagerService.addDir(token, modalInputName.value, modalInputContext.value, targetNodeId.value)
        } else if (modalType.value === 'edit' && nodeToEdit.value) {
            if (nodeToEdit.value.type === 'D') {
                await filesManagerService.editDir(token, nodeToEdit.value.id, modalInputName.value, modalInputContext.value)
            } else {
                await filesManagerService.editFile(token, nodeToEdit.value.id, modalInputName.value)
            }
        }
        
        showModal.value = false
        fetchTree() // Refresh tree
    } catch (e) {
        alert('Operation failed') // Simple alert for prototype
        console.error(e)
    }
}

/**
 * Confirms and executes the deletion of a node.
 */
const confirmDelete = async () => {
    const token = localStorage.getItem('jwt_token')
    if (!token || !nodeToDelete.value) return

    try {
        if (nodeToDelete.value.type === 'D') {
            await filesManagerService.delDir(token, nodeToDelete.value.id)
        } else {
            if (selectedNodeId.value === nodeToDelete.value.id) {
                setSelectedFile(null)
                selectedNodeId.value = null
            }
            await filesManagerService.delFile(token, nodeToDelete.value.id)
        }
        showConfirm.value = false
        fetchTree()
    } catch (e) {
        alert('Delete failed')
        console.error(e)
    }
}

/**
 * Logs the user out by clearing the token and refreshing the application state.
 */
const logout = async () => {
    const token = localStorage.getItem('jwt_token')
    if (token) {
        await filesManagerService.logout(token)
        localStorage.removeItem('jwt_token')
        setSelectedFile(null)
        // In App.vue we listen to storage or prop, but here we can just reload or emit
        // Since we are inside the component, we can use window.location.reload() to trigger App.vue check
        // Or better, use router or emit event up.
        // For now, reloading page is a safe hard reset or emits a logout event if passed as prop.
        // But since this is inside a child component, let's just refresh to reset App state
        window.location.reload()
    }
}

// Lifecycle hook that runs once the component is added to the DOM.
// We trigger the initial data fetch here.
onMounted(() => {
    fetchTree()
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
            <button class="icon-btn">⋮</button>
            <div class="root-menu">
                <div @click="handleRootAction('create-file')">New File</div>
                <div @click="handleRootAction('create-dir')">New Directory</div>
                <div @click="handleRootAction('logout')">Logout</div>
            </div>
        </div>
      </div>
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
  font-weight: bold;
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
}

.root-menu-trigger {
    position: relative;
}

.root-menu-trigger:hover .root-menu {
    display: block;
}

.root-menu {
    display: none;
    position: absolute;
    right: 0;
    top: 100%;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    min-width: 150px;
    box-shadow: var(--shadow-normal);
    z-index: 200;
}

.root-menu div {
    padding: 10px;
    cursor: pointer;
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
