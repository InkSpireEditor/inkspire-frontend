import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Tree from './Tree.vue'
import TreeItem from './TreeItem.vue'
import Modal from './Modal.vue'
import { filesManagerService } from '../services/filesManager'
import { createRouter, createWebHistory } from 'vue-router'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString()
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    })
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Setup Router
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'Login', component: { template: '<div>Login</div>' } }
  ]
})

// Helper to mount the component
function mountTree() {
    return mount(Tree, {
        global: {
            plugins: [router],
            stubs: { teleport: true }
        }
    })
}

describe('Tree.vue', () => {

    beforeEach(() => {
        vi.restoreAllMocks() // Restore original implementations
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        localStorageMock.clear()
        localStorageMock.setItem('jwt_token', 'TEST_TOKEN')
        
        // Spy on all service methods
        vi.spyOn(filesManagerService, 'getTree').mockResolvedValue({ dirs: {}, files: {} })
        vi.spyOn(filesManagerService, 'getDirContent').mockResolvedValue({ files: {} })
        vi.spyOn(filesManagerService, 'addFile').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'addDir').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'editFile').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'editDir').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'delFile').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'delDir').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'logout').mockResolvedValue(undefined)
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    // ------------------------------------
    // Functional tests
    // ------------------------------------

    it('should load directories and files correctly on initialization', async () => {
        vi.mocked(filesManagerService.getTree).mockResolvedValue({
            dirs: { "1": { name: "DirA" } },
            files: { "2": { name: "FileRoot" } },
        });

        vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
            files: { "3": { name: "NestedFileA" } }
        });

        const wrapper = mountTree()
        await flushPromises()

        expect(filesManagerService.getTree).toHaveBeenCalledWith('TEST_TOKEN')
        expect(filesManagerService.getDirContent).toHaveBeenCalledWith('TEST_TOKEN', 1)

        const treeItems = wrapper.findAllComponents(TreeItem)
        const dirA = treeItems.find(item => item.props('node').name === 'DirA')
        expect(dirA).toBeDefined()
        expect(dirA?.props('node').type).toBe('D')
        expect(dirA?.props('node').children?.[0]?.name).toBe('NestedFileA')

        const fileRoot = treeItems.find(item => item.props('node').name === 'FileRoot')
        expect(fileRoot).toBeDefined()
    })

    it('should not load the tree if the authentication token is missing', async () => {
        localStorageMock.removeItem('jwt_token');
        
        mountTree()
        await flushPromises()

        expect(filesManagerService.getTree).not.toHaveBeenCalled()
    })

    // ------------------------------------
    // Creation & Modal Tests
    // ------------------------------------

    it('should open modal for root file creation', async () => {
        const wrapper = mountTree()
        await flushPromises()

        const newFileBtn = wrapper.findAll('.root-menu div')[0]
        expect(newFileBtn).toBeDefined()
        await newFileBtn?.trigger('click')
        
        const modal = wrapper.findComponent(Modal)
        expect(modal.props('show')).toBe(true)
        expect(modal.props('title')).toBe('Create New File')
    })

    it('should create a file and update tree', async () => {
        vi.mocked(filesManagerService.getTree).mockResolvedValue({ dirs: {}, files: {} });
        vi.mocked(filesManagerService.addFile).mockResolvedValue({});

        const wrapper = mountTree()
        await flushPromises()

        // Open modal
        const newFileBtn = wrapper.findAll('.root-menu div')[0]
        expect(newFileBtn).toBeDefined()
        await newFileBtn?.trigger('click')
        
        const modal = wrapper.findComponent(Modal)
        const input = modal.find('input')
        await input.setValue('new-file.txt')
        
        await modal.vm.$emit('confirm')
        await flushPromises()

        expect(filesManagerService.addFile).toHaveBeenCalledWith('TEST_TOKEN', 'new-file.txt', null)
        expect(filesManagerService.getTree).toHaveBeenCalledTimes(2)
    })

    it('should open edit modal for file', async () => {
        vi.mocked(filesManagerService.getTree).mockResolvedValue({
            dirs: {},
            files: { "10": { name: "edit-me.txt" } },
        });

        const wrapper = mountTree()
        await flushPromises()

        const fileItem = wrapper.findComponent(TreeItem)
        await fileItem.find('.node-actions-trigger').trigger('click')
        
        const editBtn = fileItem.findAll('.context-menu div').find(d => d.text() === 'Edit')
        await editBtn?.trigger('click')
        await flushPromises()

        const modal = wrapper.findComponent(Modal)
        expect(modal.props('show')).toBe(true)
        expect(modal.props('title')).toBe('Edit File')
        expect((wrapper.vm as any).modalInputName).toBe('edit-me.txt')
    })

    // ------------------------------------
    // Deletion Tests
    // ------------------------------------

    it('should open confirmation dialog on delete', async () => {
        vi.mocked(filesManagerService.getTree).mockResolvedValue({
            dirs: {},
            files: { "10": { name: "delete-me.txt" } },
        });

        const wrapper = mountTree()
        await flushPromises()

        const fileItem = wrapper.findComponent(TreeItem)
        await fileItem.find('.node-actions-trigger').trigger('click')
        
        const deleteBtn = fileItem.findAll('.context-menu div').find(d => d.text() === 'Delete')
        await deleteBtn?.trigger('click')
        await flushPromises()

        const confirmModal = wrapper.findAllComponents(Modal).find(m => m.props('title') === 'Confirm Action')
        expect(confirmModal?.props('show')).toBe(true)
    })

    // ------------------------------------
    // UI Tests
    // ------------------------------------
    it('toggles theme when theme button is clicked', async () => {
        const wrapper = mountTree()
        const themeBtn = wrapper.find('.icon-btn[title="Toggle Theme"]')
        
        const initialIcon = themeBtn.text()
        await themeBtn.trigger('click')
        
        expect(themeBtn.text()).not.toBe(initialIcon)
    })

    it('calls logout service and clears token', async () => {
        const reloadSpy = vi.fn()
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { reload: reloadSpy }
        })

        const wrapper = mountTree()
        await flushPromises()

        await wrapper.findAll('.root-menu div').find(d => d.text() === 'Logout')?.trigger('click')
        await flushPromises()

        expect(filesManagerService.logout).toHaveBeenCalledWith('TEST_TOKEN')
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('jwt_token')
        expect(reloadSpy).toHaveBeenCalled()
    })
})