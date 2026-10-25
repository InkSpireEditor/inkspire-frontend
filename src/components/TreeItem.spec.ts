import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TreeItem from './TreeItem.vue'
import type { FileSystemNode } from '../services/filesManager'

const mockPush = vi.fn().mockResolvedValue(undefined)
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush })
}))

describe('TreeItem.vue', () => {
  const mockOnAction = vi.fn()
  const space = ref<'stories' | 'notes'>('stories')

  beforeEach(() => {
    mockPush.mockClear()
    mockOnAction.mockClear()
  })

  const treeContext = {
    space,
    onAction: mockOnAction
  }

  const fileNode: FileSystemNode = {
    id: '1abcdef012345678',
    name: 'test-file.txt',
    type: 'F'
  }

  const folderNode: FileSystemNode = {
    id: '2abcdef012345678',
    name: 'test-folder',
    type: 'D',
    children: [
      { id: '3a1b2c3d4e5f6071', name: 'child-file.txt', type: 'F' }
    ]
  }

  const mountTreeItem = (node: FileSystemNode, level = 0) => {
    return mount(TreeItem, {
      props: { node, level },
      global: {
        provide: {
          treeContext
        }
      }
    })
  }

  it('renders a file node correctly', () => {
    const wrapper = mountTreeItem(fileNode)
    expect(wrapper.text()).toContain('test-file.txt')
    expect(wrapper.find('.icon').attributes('data-icon')).toBe('page')
    expect(wrapper.find('.toggle-icon').exists()).toBe(false)
  })

  it('renders a folder node correctly', () => {
    const wrapper = mountTreeItem(folderNode)
    expect(wrapper.text()).toContain('test-folder')
    expect(wrapper.find('.toggle-icon').exists()).toBe(true)
    expect(wrapper.find('.toggle-icon').classes()).not.toContain('open')
  })

  it('draws a directory\'s disclosure arrow as one triangle icon, open or closed', async () => {
    const wrapper = mountTreeItem(folderNode)
    const arrow = () => wrapper.find('.toggle-icon')

    expect(arrow().find('svg').attributes('data-icon')).toBe('triangle')
    expect(arrow().classes()).not.toContain('open')

    await arrow().trigger('click')

    // The same icon rotated by CSS, not a second one swapped in.
    expect(arrow().find('svg').attributes('data-icon')).toBe('triangle')
    expect(arrow().classes()).toContain('open')
  })

  it('marks a directory as a story or as a plain folder, by space', () => {
    space.value = 'stories'
    expect(mountTreeItem(folderNode).find('.icon').attributes('data-icon')).toBe('book')

    space.value = 'notes'
    expect(mountTreeItem(folderNode).find('.icon').attributes('data-icon')).toBe('folder')
  })

  it('shows a file the same way in either space', () => {
    space.value = 'notes'
    expect(mountTreeItem(fileNode).find('.icon').attributes('data-icon')).toBe('page')
  })

  it('toggles folder expansion when clicked', async () => {
    const wrapper = mountTreeItem(folderNode)
    const content = wrapper.find('.tree-node-content')
    
    // Initially closed
    expect(wrapper.find('.tree-children').exists()).toBe(false)
    
    // Click to open
    await content.trigger('click')
    expect(wrapper.find('.toggle-icon').classes()).toContain('open')
    expect(wrapper.find('.tree-children').exists()).toBe(true)
    expect(wrapper.findComponent(TreeItem).exists()).toBe(true)
    
    // Click to close
    await content.trigger('click')
    expect(wrapper.find('.tree-children').exists()).toBe(false)
  })

  it('applies correct indentation based on level', () => {
    const level = 2
    const wrapper = mountTreeItem(fileNode, level)
    const content = wrapper.find('.tree-node-content')
    // padding-left: (level * 24 + 16)px => (2 * 24 + 16) = 64px
    expect(content.attributes('style')).toContain('padding-left: 64px')
  })

  it('shows and hides context menu', async () => {
    const wrapper = mountTreeItem(fileNode)
    const trigger = wrapper.find('.node-actions-trigger')
    
    expect(wrapper.find('.context-menu').exists()).toBe(false)
    
    await trigger.trigger('click')
    expect(wrapper.find('.context-menu').exists()).toBe(true)
    
    await trigger.trigger('click')
    expect(wrapper.find('.context-menu').exists()).toBe(false)
  })

  it('calls onAction for file edit', async () => {
    const wrapper = mountTreeItem(fileNode)
    await wrapper.find('.node-actions-trigger').trigger('click')
    
    const editAction = wrapper.findAll('.context-menu div').find(el => el.text() === 'Edit')
    await editAction?.trigger('click')
    
    expect(mockOnAction).toHaveBeenCalledWith('edit', fileNode)
  })

  it('calls onAction with parentId for creating file in folder', async () => {
    const wrapper = mountTreeItem(folderNode)
    await wrapper.find('.node-actions-trigger').trigger('click')
    
    const newFileAction = wrapper.findAll('.context-menu div').find(el => el.text() === 'New File')
    await newFileAction?.trigger('click')
    
    // handleAction uses onAction('create-file', null, props.node.id)
    expect(mockOnAction).toHaveBeenCalledWith('create-file', null, folderNode.id)
  })

  describe('in the stories space', () => {
    const chapterNode: FileSystemNode = {
      id: '4a1b2c3d4e5f6071',
      name: 'chapter-one.ink',
      type: 'F',
      parentId: '5a1b2c3d4e5f6071'
    }

    it('navigates to the dashboard on a directory click, without toggling', async () => {
      space.value = 'stories'
      const wrapper = mountTreeItem(folderNode)

      await wrapper.find('.tree-node-content').trigger('click')

      expect(mockPush).toHaveBeenCalledWith({
        name: 'dashboard',
        params: { space: 'stories', id: folderNode.id }
      })
      expect(wrapper.find('.tree-children').exists()).toBe(false)
    })

    it('still expands on a click on the disclosure triangle', async () => {
      space.value = 'stories'
      const wrapper = mountTreeItem(folderNode)

      await wrapper.find('.toggle-icon').trigger('click')

      expect(wrapper.find('.tree-children').exists()).toBe(true)
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('navigates to the editor on a chapter click', async () => {
      space.value = 'stories'
      const wrapper = mountTreeItem(chapterNode)

      await wrapper.find('.tree-node-content').trigger('click')

      expect(mockPush).toHaveBeenCalledWith({
        name: 'write',
        params: { space: 'stories', id: chapterNode.parentId, fileId: chapterNode.id }
      })
    })

    it('navigates to the root write route on a one-shot click, which has no directory', async () => {
      space.value = 'stories'
      const wrapper = mountTreeItem(fileNode)

      await wrapper.find('.tree-node-content').trigger('click')

      expect(mockPush).toHaveBeenCalledWith({
        name: 'write-root',
        params: { space: 'stories', fileId: fileNode.id }
      })
    })
  })

  describe('in the notes space', () => {
    it('navigates to a note in a folder by the folder and the note', async () => {
      space.value = 'notes'
      const note: FileSystemNode = { ...fileNode, parentId: folderNode.id }
      const wrapper = mountTreeItem(note)

      await wrapper.find('.tree-node-content').trigger('click')

      expect(mockPush).toHaveBeenCalledWith({
        name: 'write',
        params: { space: 'notes', id: folderNode.id, fileId: note.id }
      })
    })

    it('navigates to a note at the root by the note alone', async () => {
      space.value = 'notes'
      const wrapper = mountTreeItem(fileNode)

      await wrapper.find('.tree-node-content').trigger('click')

      expect(mockPush).toHaveBeenCalledWith({
        name: 'write-root',
        params: { space: 'notes', fileId: fileNode.id }
      })
    })

    it('only expands a notes folder on a click, until a folder has a page of its own', async () => {
      space.value = 'notes'
      const wrapper = mountTreeItem(folderNode)

      await wrapper.find('.tree-node-content').trigger('click')

      expect(mockPush).not.toHaveBeenCalled()
      expect(wrapper.find('.tree-children').exists()).toBe(true)
    })

    it('still offers Delete on a notes folder', async () => {
      space.value = 'notes'
      const wrapper = mountTreeItem(folderNode)

      await wrapper.find('.node-actions-trigger').trigger('click')

      const entries = wrapper.findAll('.context-menu div').map((el) => el.text())
      expect(entries).toContain('Delete')
    })
  })

  describe('deleting a story directory', () => {
    it('omits Delete from the sidebar menu -- it moved to the dashboard', async () => {
      space.value = 'stories'
      const wrapper = mountTreeItem(folderNode)

      await wrapper.find('.node-actions-trigger').trigger('click')

      const entries = wrapper.findAll('.context-menu div').map((el) => el.text())
      expect(entries).toEqual(['New File', 'Edit'])
    })

    it('still offers Delete on a chapter', async () => {
      space.value = 'stories'
      const wrapper = mountTreeItem(fileNode)

      await wrapper.find('.node-actions-trigger').trigger('click')

      const entries = wrapper.findAll('.context-menu div').map((el) => el.text())
      expect(entries).toContain('Delete')
    })
  })
})
