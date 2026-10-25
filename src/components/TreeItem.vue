<script setup lang="ts">
import { ref, computed, inject, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FileSystemNode } from '../services/filesManager'
import { useSharedFiles } from '../services/sharedFiles'
import { DIR_ICONS, type Space } from '../services/spaces'
// Explicitly import TreeItem for recursion, though often handled by filename
import TreeItem from './TreeItem.vue'
import Icon from './Icon.vue'
import type { IconName } from '../icons'

// Props define the inputs this component accepts from its parent.
const props = defineProps<{
  node: FileSystemNode
  level: number
}>()

const { selectedFileId } = useSharedFiles()

// Indentation is applied inline rather than in CSS because it depends on the
// node's depth, which is only known at render time.
const INDENT_PER_LEVEL_PX = 24
const BASE_PADDING_PX = 16

/**
 * The shape Tree provides under the 'treeContext' key. Injected rather than
 * passed as props because TreeItem renders itself recursively, and prop-drilling
 * these handlers would mean threading them through every level.
 */
interface TreeContext {
  space?: Ref<Space>
  onAction: (action: string, node: FileSystemNode | null, parentId?: string | null) => void
}

// 'inject' retrieves the state and methods provided by the ancestor 'Tree' component.
const context = inject<TreeContext>('treeContext')!
const { onAction } = context
const router = useRouter()

const isOpen = ref(false)
const showMenu = ref(false)

// 'computed' properties are reactive variables derived from other state.
// They are cached and only re-calculate when their dependencies change.
const isFolder = computed(() => {
  return props.node.type === 'D'
})


/**
 * A directory reads differently in each space: a story is a book, and a directory in
 * the other root is a folder. Files look the same in both, because they are.
 */
const icon = computed<IconName>(() => {
  if (!isFolder.value) return 'page'
  return DIR_ICONS[context.space?.value ?? 'stories']
})

/**
 * v-click-outside: closes the context menu when the user clicks anywhere else.
 * The listener goes on `document` rather than the menu itself, because a click
 * that dismisses the menu lands on some other element entirely. The handler is
 * stashed on the element so `unmounted` can remove the exact same reference —
 * every TreeItem registers its own, and they must not leak.
 */
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

/**
 * Every file and every directory has a URL, in either space, so a row navigates there: a
 * directory to its page (`/:space/:id`), where its text is edited and where it is deleted --
 * which is why the menu offers no Delete on one -- a file in a directory to
 * `/:space/:id/write/:fileId`, and one outside any (a one-shot, a note at the root) to
 * `/:space/write/:fileId`. The disclosure triangle only expands a directory -- see `toggle`.
 */
const select = () => {
  const space = context.space?.value ?? 'stories'
  if (isFolder.value) {
    router.push({ name: 'dashboard', params: { space, id: props.node.id } })
    return
  }
  if (props.node.parentId) {
    router.push({
      name: 'write',
      params: { space, id: props.node.parentId, fileId: props.node.id },
    })
  } else {
    router.push({ name: 'write-root', params: { space, fileId: props.node.id } })
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
      :style="{ paddingLeft: (level * INDENT_PER_LEVEL_PX + BASE_PADDING_PX) + 'px' }"
      @click="select"
    >
      <span
        v-if="isFolder"
        class="toggle-icon"
        :class="{ open: isOpen }"
        @click.stop="toggle"
      >
        <Icon name="triangle" />
      </span>
      <span v-else class="spacer"></span>

      <Icon :name="icon" class="icon" />
      <span class="node-name">{{ node.name }}</span>
      
      <div class="node-actions-trigger" title="Actions" @click.stop="showMenu = !showMenu">
        <Icon name="more" />
        <!-- Apply v-click-outside only when menu is shown -->
        <div v-if="showMenu" class="context-menu" v-click-outside="closeMenu">
            <!-- Directory Actions -->
            <template v-if="isFolder">
                <div @click.stop="handleAction('create-file')">New File</div>
                <div @click.stop="handleAction('edit')">Edit</div>
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
  /* Reserved on every row, not just .selected, so turning it blue doesn't push
     this row's icon and name 4px to the right of every other row's. */
  border-left: 4px solid transparent;
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
  border-left-color: var(--color-primary);
}

.toggle-icon, .spacer {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/*
 * One triangle, pointing up in its own outline, rotated between the two states rather than two
 * different glyphs swapped: that keeps the open and closed arrow the same size and the same
 * optical weight. The icon is centred by its own box, not by font metrics, so it cannot drift
 * with the font. A quarter turn points it right (closed), a half turn down (open).
 */
.toggle-icon {
  font-size: 10px;
  color: var(--color-text);
}

.toggle-icon .icon-svg {
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}

.toggle-icon.open .icon-svg {
  transform: rotate(180deg);
}

.icon {
  display: flex;
  align-items: center;
  font-size: 16px;
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
  font-weight: var(--font-weight-bold);
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
  margin-top: var(--space-1);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-strong);
  border-radius: var(--radius-md);
  z-index: 100;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  padding: var(--space-1);
}

.context-menu div {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}

.context-menu div:hover {
  background-color: var(--color-background-mute);
}

.tree-children {
  padding-left: 0;
  margin: 0;
}
</style>
