import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Tree from './Tree.vue'
import TreeItem from './TreeItem.vue'
import Modal from './Modal.vue'
import { filesManagerService, type TreeApiResponse } from '../services/filesManager'
import { modelService } from '../services/model'
import { useSharedFiles } from '../services/sharedFiles'

// Helper to mount the component
function mountTree() {
    return mount(Tree, {
        global: {
            stubs: { teleport: true }
        }
    })
}

/** A root-menu entry by the text on it, since which entries there are depends on the tab. */
function rootMenuItem(wrapper: ReturnType<typeof mountTree>, label: string) {
    return wrapper.findAll('.root-menu div').find(d => d.text() === label)
}

/** Opens a tab by its label. */
async function openTab(wrapper: ReturnType<typeof mountTree>, label: string) {
    const tab = wrapper.findAll('.space-tab').find(t => t.text() === label)
    await tab?.trigger('click')
    await flushPromises()
    return tab
}

describe('Tree.vue', () => {

    beforeEach(() => {
        vi.restoreAllMocks() // Restore original implementations
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        document.cookie = 'auth_status=; Path=/; Max-Age=0'
        document.cookie = 'auth_status=1; Path=/'
        // Which tab was last open is remembered, so it must not leak between tests.
        localStorage.clear()
        useSharedFiles().clearSelectedFile()

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

        expect(filesManagerService.getTree).toHaveBeenCalledWith('stories')
        expect(filesManagerService.getDirContent).toHaveBeenCalledWith('stories', "1")

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
        await openTab(wrapper, 'Notes')

        const newFileBtn = rootMenuItem(wrapper, 'New File')
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
        await openTab(wrapper, 'Notes')
        vi.mocked(filesManagerService.getTree).mockClear()

        // Open modal
        const newFileBtn = rootMenuItem(wrapper, 'New File')
        expect(newFileBtn).toBeDefined()
        await newFileBtn?.trigger('click')

        const modal = wrapper.findComponent(Modal)
        const input = modal.find('input')
        await input.setValue('new-file.txt')

        await modal.vm.$emit('confirm')
        await flushPromises()

        expect(filesManagerService.addFile).toHaveBeenCalledWith('notes', 'new-file.txt', null)
        expect(filesManagerService.getTree).toHaveBeenCalledWith('notes')
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

        await rootMenuItem(wrapper, 'Logout')?.trigger('click')
        await flushPromises()

        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/auth/logout'),
            expect.objectContaining({ method: 'POST', credentials: 'include' }),
        )
        expect(document.cookie).not.toContain('auth_status=1')
        expect(expiredHandler).toHaveBeenCalledOnce()

        window.removeEventListener('auth:expired', expiredHandler)
    })

    // ------------------------------------
    // The two spaces
    // ------------------------------------

    it('shows one tab per space, with the stories open first', async () => {
        const wrapper = mountTree()
        await flushPromises()

        const tabs = wrapper.findAll('.space-tab')
        expect(tabs.map(t => t.text())).toEqual(['Stories', 'Notes'])
        expect(tabs[0]?.classes()).toContain('active')
        expect(filesManagerService.getTree).toHaveBeenCalledWith('stories')
        expect(filesManagerService.getTree).not.toHaveBeenCalledWith('notes')
    })

    it('fetches the other space when its tab is first opened, and not again', async () => {
        const wrapper = mountTree()
        await flushPromises()

        await openTab(wrapper, 'Notes')
        expect(filesManagerService.getTree).toHaveBeenCalledWith('notes')

        await openTab(wrapper, 'Stories')
        await openTab(wrapper, 'Notes')
        expect(vi.mocked(filesManagerService.getTree).mock.calls.filter(c => c[0] === 'notes')).toHaveLength(1)
    })

    it('offers no file at the root of the stories, where a file needs one', async () => {
        const wrapper = mountTree()
        await flushPromises()

        expect(rootMenuItem(wrapper, 'New File')).toBeUndefined()
        expect(rootMenuItem(wrapper, 'New Story')).toBeDefined()

        await openTab(wrapper, 'Notes')
        expect(rootMenuItem(wrapper, 'New File')).toBeDefined()
        expect(rootMenuItem(wrapper, 'New Directory')).toBeDefined()
    })

    it('lists each space from its own tree, keeping both', async () => {
        vi.mocked(filesManagerService.getTree).mockImplementation(async (space): Promise<TreeApiResponse> => ({
            dirs: space === 'stories' ? { "1": { name: "The Okiya" } } : {},
            files: space === 'stories' ? {} : { "2": { name: "scratch" } },
        }))

        const wrapper = mountTree()
        await flushPromises()
        expect(wrapper.text()).toContain('The Okiya')
        expect(wrapper.text()).not.toContain('scratch')

        await openTab(wrapper, 'Notes')
        expect(wrapper.text()).toContain('scratch')
        expect(wrapper.text()).not.toContain('The Okiya')
    })

    it('selects a file with the space it was opened in', async () => {
        vi.mocked(filesManagerService.getTree).mockImplementation(async (space): Promise<TreeApiResponse> => ({
            dirs: {},
            files: space === 'notes' ? { "2f3e4d5c6b7a8991": { name: "scratch" } } : {},
        }))

        const wrapper = mountTree()
        await flushPromises()
        await openTab(wrapper, 'Notes')

        await wrapper.findComponent(TreeItem).find('.tree-node-content').trigger('click')

        expect(useSharedFiles().selectedFile.value).toEqual({
            space: 'notes',
            id: '2f3e4d5c6b7a8991',
        })
    })

    it('remembers which tab was open', async () => {
        const first = mountTree()
        await flushPromises()
        await openTab(first, 'Notes')

        const second = mountTree()
        await flushPromises()

        expect(second.findAll('.space-tab')[1]?.classes()).toContain('active')
    })
})
