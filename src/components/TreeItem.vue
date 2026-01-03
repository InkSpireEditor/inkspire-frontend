<script setup lang="ts">
import { ref, computed, inject, type Ref } from 'vue'
import type { FileSystemNode } from '../services/filesManager'
import { useSharedFiles } from '../services/sharedFiles'
// Explicitly import TreeItem for recursion, though often handled by filename
import TreeItem from './TreeItem.vue'

// Props define the inputs this component accepts from its parent.
const props = defineProps<{
  node: FileSystemNode
  level: number
}>()

const { selectedFileId } = useSharedFiles()

// Define types for injected context
interface TreeContext {
  selectedNodeId: Ref<number | null>
  onSelect: (node: FileSystemNode) => void
  onAction: (action: string, node: FileSystemNode | null, parentId?: number | null) => void
}

// 'inject' retrieves the state and methods provided by the ancestor 'Tree' component.
const { onSelect, onAction } = inject<TreeContext>('treeContext')!

const isOpen = ref(false)
const showMenu = ref(false)

// 'computed' properties are reactive variables derived from other state.
// They are cached and only re-calculate when their dependencies change.
const isFolder = computed(() => {
  return props.node.type === 'D'
})

// Custom Directive: v-click-outside
const vClickOutside = {
  mounted(el: any, binding: any) {
    el.clickOutsideEvent = (event: Event) => {
      // Check if click was outside the element and its children
      if (!(el === event.target || el.contains(event.target))) {
        // Call the provided method
        binding.value(event)
      }
    }
    document.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el: any) {
    document.removeEventListener('click', el.clickOutsideEvent)
  },
}

const toggle = () => {
  if (isFolder.value) {
    isOpen.value = !isOpen.value
  }
}

const select = () => {
  if (isFolder.value) {
    toggle()
  } else {
    onSelect(props.node)
  }
}

const handleAction = (action: string) => {
  showMenu.value = false
  if (action === 'create-file') {
    onAction('create-file', null, props.node.id)
  } else if (action === 'create-dir') {
    onAction('create-dir', null, props.node.id)
  } else {
    onAction(action, props.node)
  }
}

const closeMenu = () => {
    showMenu.value = false
}

</script>

<template>
  <li>
    <div
      class="tree-node-content"
      :class="{ 'selected': node.id === selectedFileId && !isFolder }"
      :style="{ paddingLeft: (level * 24 + 16) + 'px' }"
      @click="select"
    >
      <span v-if="isFolder" class="toggle-icon" @click.stop="toggle">
        {{ isOpen ? '▼' : '▶' }}
      </span>
      <span v-else class="spacer"></span>
      
      <span class="icon">{{ isFolder ? '🗁' : '📄' }}</span>
      <span class="node-name">{{ node.name }}</span>
      
      <div class="node-actions-trigger" @click.stop="showMenu = !showMenu">
        ⋮
        <!-- Apply v-click-outside only when menu is shown -->
        <div v-if="showMenu" class="context-menu" v-click-outside="closeMenu">
            <!-- Directory Actions -->
            <template v-if="isFolder">
                <div @click.stop="handleAction('create-file')">New File</div>
                <div @click.stop="handleAction('edit')">Edit</div>
                <div @click.stop="handleAction('delete')">Delete</div>
            </template>
            <!-- File Actions -->
            <template v-else>
                <div @click.stop="handleAction('edit')">Edit</div>
                <div @click.stop="handleAction('delete')">Delete</div>
            </template>
        </div>
      </div>
    </div>

    <ul v-if="isFolder && isOpen" class="tree-children">
      <TreeItem
        v-for="child in node.children"
        :key="child.type + '-' + child.id"
        :node="child"
        :level="level + 1"
      />
    </ul>
  </li>
</template>

<style scoped>
li {
  list-style-type: none;
}

.tree-node-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 0; /* Left padding is handled by inline style */
  cursor: pointer;
  height: 40px;
  transition: background-color 0.2s;
  position: relative;
}

.tree-node-content:hover {
  background-color: var(--color-background-mute);
}

.tree-node-content.selected {
  background-color: var(--color-primary-soft);
  border-left: 4px solid var(--color-primary);
}

.toggle-icon, .spacer {
  width: 24px;
  display: flex;
  justify-content: center;
  color: var(--color-text);
  font-size: 0.8rem;
}

.icon {
  display: flex;
  align-items: center;
}

.node-name {
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-actions-trigger {
  padding: 0 8px;
  cursor: pointer;
  position: relative;
  font-weight: bold;
  visibility: hidden;
}

.tree-node-content:hover .node-actions-trigger,
.context-menu {
    visibility: visible;
}

.context-menu {
  position: absolute;
  right: 0;
  top: 100%;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-strong);
  border-radius: 4px;
  z-index: 100;
  min-width: 120px;
  display: flex;
  flex-direction: column;
}

.context-menu div {
  padding: 8px 12px;
  cursor: pointer;
}

.context-menu div:hover {
  background-color: var(--color-background-mute);
}

.tree-children {
  padding-left: 0;
  margin: 0;
}
</style>
