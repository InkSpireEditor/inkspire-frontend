import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Tree from './Tree.vue'
import TreeItem from './TreeItem.vue'
import Modal from './Modal.vue'
import { filesManagerService } from '../services/filesManager'
import { modelService } from '../services/model'

// Helper to mount the component
function mountTree() {
    return mount(Tree, {
        global: {
            stubs: { teleport: true }
        }
    })
}

describe('Tree.vue', () => {

    beforeEach(() => {
        vi.restoreAllMocks() // Restore original implementations
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        document.cookie = 'auth_status=; Path=/; Max-Age=0'
        document.cookie = 'auth_status=1; Path=/'

        // Spy on all service methods
        vi.spyOn(modelService, 'getModels').mockResolvedValue([])
        vi.spyOn(filesManagerService, 'getTree').mockResolvedValue({ dirs: {}, files: {} })
        vi.spyOn(filesManagerService, 'getDirContent').mockResolvedValue({ files: {} })
        vi.spyOn(filesManagerService, 'addFile').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'addDir').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'editFile').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'editDir').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'delFile').mockResolvedValue({})
        vi.spyOn(filesManagerService, 'delDir').mockResolvedValue({})
    })

    afterEach(() => {
        vi.clearAllMocks()
        document.cookie = 'auth_status=; Path=/; Max-Age=0'
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

        expect(filesManagerService.getTree).toHaveBeenCalledWith()
        expect(filesManagerService.getDirContent).toHaveBeenCalledWith(1)

        const treeItems = wrapper.findAllComponents(TreeItem)
        const dirA = treeItems.find(item => item.props('node').name === 'DirA')
        expect(dirA).toBeDefined()
        expect(dirA?.props('node').type).toBe('D')
        expect(dirA?.props('node').children?.[0]?.name).toBe('NestedFileA')

        const fileRoot = treeItems.find(item => item.props('node').name === 'FileRoot')
        expect(fileRoot).toBeDefined()
    })

    it('should not load the tree when there is no active session', async () => {
        document.cookie = 'auth_status=; Path=/; Max-Age=0'

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

        expect(filesManagerService.addFile).toHaveBeenCalledWith('new-file.txt', null)
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

    it('revokes the session and dispatches auth:expired on logout', async () => {
        // logout() posts to /auth/logout; the server clears the httpOnly cookies.
        const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
            new Response(null, { status: 200 }),
        )
        const expiredHandler = vi.fn()
        window.addEventListener('auth:expired', expiredHandler)

        const wrapper = mountTree()
        await flushPromises()

        await wrapper.findAll('.root-menu div').find(d => d.text() === 'Logout')?.trigger('click')
        await flushPromises()

        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/auth/logout'),
            expect.objectContaining({ method: 'POST', credentials: 'include' }),
        )
        expect(document.cookie).not.toContain('auth_status=1')
        expect(expiredHandler).toHaveBeenCalledOnce()

        window.removeEventListener('auth:expired', expiredHandler)
    })
})
