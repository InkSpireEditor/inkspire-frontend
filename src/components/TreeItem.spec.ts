import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TreeItem from './TreeItem.vue'
import type { FileSystemNode } from '../services/filesManager'

describe('TreeItem.vue', () => {
  const mockOnSelect = vi.fn()
  const mockOnAction = vi.fn()
  const selectedNodeId = ref<string | null>(null)

  const space = ref<'stories' | 'notes'>('stories')

  const treeContext = {
    selectedNodeId,
    space,
    onSelect: mockOnSelect,
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
    expect(wrapper.find('.icon').text()).toBe('📄')
    expect(wrapper.find('.toggle-icon').exists()).toBe(false)
  })

  it('renders a folder node correctly', () => {
    const wrapper = mountTreeItem(folderNode)
    expect(wrapper.text()).toContain('test-folder')
    expect(wrapper.find('.toggle-icon').text()).toBe('▶')
  })

  it('marks a directory as a story or as a plain folder, by space', () => {
    space.value = 'stories'
    expect(mountTreeItem(folderNode).find('.icon').text()).toBe('📖')

    space.value = 'notes'
    expect(mountTreeItem(folderNode).find('.icon').text()).toBe('🗁')
  })

  it('shows a file the same way in either space', () => {
    space.value = 'notes'
    expect(mountTreeItem(fileNode).find('.icon').text()).toBe('📄')
  })

  it('calls onSelect when a file node is clicked', async () => {
    const wrapper = mountTreeItem(fileNode)
    await wrapper.find('.tree-node-content').trigger('click')
    expect(mockOnSelect).toHaveBeenCalledWith(fileNode)
  })

  it('toggles folder expansion when clicked', async () => {
    const wrapper = mountTreeItem(folderNode)
    const content = wrapper.find('.tree-node-content')
    
    // Initially closed
    expect(wrapper.find('.tree-children').exists()).toBe(false)
    
    // Click to open
    await content.trigger('click')
    expect(wrapper.find('.toggle-icon').text()).toBe('▼')
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
})
