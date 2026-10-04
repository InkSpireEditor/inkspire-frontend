import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Tree from './Tree.vue'
import TreeItem from './TreeItem.vue'
import Modal from './Modal.vue'
import { filesManagerService, type FileSystemNode, type TreeApiResponse } from '../services/filesManager'
import { modelService } from '../services/model'
import { gitService } from '../services/git'
import { useSharedFiles } from '../services/sharedFiles'
import { resetSharedGit } from '../services/sharedGit'

// Tree and TreeItem both reach for the router unconditionally; without this,
// mounting a real tree crashes the moment a story row is clicked.
const mockReplace = vi.fn().mockResolvedValue(undefined)
const mockRoute = { name: 'home', params: {} as Record<string, string> }
vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined), replace: mockReplace }),
    useRoute: () => mockRoute
}))

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
        resetSharedGit()

        // Spy on all service methods
        vi.spyOn(modelService, 'getModels').mockResolvedValue([])
        vi.spyOn(gitService, 'status').mockResolvedValue({
            branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0,
            fetched: false, clean: true, changes: [],
        })
        vi.spyOn(filesManagerService, 'getTree').mockResolvedValue({ dirs: [], files: [] })
        vi.spyOn(filesManagerService, 'getDirContent').mockResolvedValue(
            { id: '1', name: 'DirA', summary: '', files: [] },
        )
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
            dirs: [
                {
                    id: "1", name: "DirA", summary: "", files: [
                        { id: "3", name: "NestedFileA", status: "" },
                    ],
                },
            ],
            files: [{ id: "2", name: "FileRoot", status: "" }],
        });

        const wrapper = mountTree()
        await flushPromises()

        expect(filesManagerService.getTree).toHaveBeenCalledWith('stories')
        // One request for the whole root: a directory's files arrive with it.
        expect(filesManagerService.getDirContent).not.toHaveBeenCalled()

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
        vi.mocked(filesManagerService.getTree).mockResolvedValue({ dirs: [], files: [] });
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
            dirs: [],
            files: [{ id: "10", name: "edit-me.txt", status: "" }],
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
            dirs: [],
            files: [{ id: "10", name: "delete-me.txt", status: "" }],
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
    it('no longer shows the git panel -- it moved to the dashboard', async () => {
        const wrapper = mountTree()
        await flushPromises()

        expect(wrapper.find('.git-panel').exists()).toBe(false)
    })

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

    it('offers no generic file at the root of the stories, where a one-shot is what that is called', async () => {
        const wrapper = mountTree()
        await flushPromises()

        expect(rootMenuItem(wrapper, 'New File')).toBeUndefined()
        expect(rootMenuItem(wrapper, 'New One-Shot')).toBeDefined()
        expect(rootMenuItem(wrapper, 'New Story')).toBeDefined()

        await openTab(wrapper, 'Notes')
        expect(rootMenuItem(wrapper, 'New File')).toBeDefined()
        expect(rootMenuItem(wrapper, 'New One-Shot')).toBeUndefined()
        expect(rootMenuItem(wrapper, 'New Directory')).toBeDefined()
    })

    it('creates a one-shot at the stories root, and does not touch a dashboard', async () => {
        vi.mocked(filesManagerService.getTree).mockResolvedValue({ dirs: [], files: [] })
        vi.mocked(filesManagerService.addFile).mockResolvedValue({})
        const notifySpy = vi.fn()
        window.addEventListener('stories:changed', notifySpy)

        const wrapper = mountTree()
        await flushPromises()
        vi.mocked(filesManagerService.getTree).mockClear()

        const newOneShotBtn = rootMenuItem(wrapper, 'New One-Shot')
        await newOneShotBtn?.trigger('click')

        const modal = wrapper.findComponent(Modal)
        expect(modal.props('title')).toBe('Create One-Shot')
        await modal.find('input').setValue('a-solo-piece')
        await modal.vm.$emit('confirm')
        await flushPromises()

        expect(filesManagerService.addFile).toHaveBeenCalledWith('stories', 'a-solo-piece', null)
        expect(filesManagerService.getTree).toHaveBeenCalledWith('stories')
        expect(notifySpy).not.toHaveBeenCalled()

        window.removeEventListener('stories:changed', notifySpy)
    })

    it('lists each space from its own tree, keeping both', async () => {
        vi.mocked(filesManagerService.getTree).mockImplementation(async (space): Promise<TreeApiResponse> => ({
            dirs: space === 'stories'
                ? [{ id: "1", name: "Example Story", summary: "", files: [] }]
                : [],
            files: space === 'stories' ? [] : [{ id: "2", name: "scratch", status: "" }],
        }))

        const wrapper = mountTree()
        await flushPromises()
        expect(wrapper.text()).toContain('Example Story')
        expect(wrapper.text()).not.toContain('scratch')

        await openTab(wrapper, 'Notes')
        expect(wrapper.text()).toContain('scratch')
        expect(wrapper.text()).not.toContain('Example Story')
    })

    it('selects a file with the space it was opened in', async () => {
        vi.mocked(filesManagerService.getTree).mockImplementation(async (space): Promise<TreeApiResponse> => ({
            dirs: [],
            files: space === 'notes'
                ? [{ id: "2f3e4d5c6b7a8991", name: "scratch", status: "" }]
                : [],
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

    it('draws a directory\'s files in the order the API sent them', async () => {
        // `story.yaml` decides the order, so sorting here would override the writer.
        vi.mocked(filesManagerService.getTree).mockResolvedValue({
            dirs: [{
                id: '1', name: 'Example Story', summary: '', files: [
                    { id: '30', name: 'Gamma', status: '' },
                    { id: '10', name: 'Alpha', status: '' },
                    { id: '20', name: 'Beta', status: '' },
                ],
            }],
            files: [],
        })

        const wrapper = mountTree()
        await flushPromises()

        const dir = wrapper.findAllComponents(TreeItem)
            .find(item => item.props('node').name === 'Example Story')
        expect(dir?.props('node').children?.map((c: FileSystemNode) => c.name))
            .toEqual(['Gamma', 'Alpha', 'Beta'])
    })

    it('carries a file\'s status onto its node', async () => {
        vi.mocked(filesManagerService.getTree).mockResolvedValue({
            dirs: [],
            files: [{ id: '10', name: 'scratch', status: 'draft' }],
        })

        const wrapper = mountTree()
        await flushPromises()
        await openTab(wrapper, 'Notes')

        expect(wrapper.findComponent(TreeItem).props('node').status).toBe('draft')
    })

    it('edits a directory without fetching it again', async () => {
        // Its summary arrived with the tree, so the modal has nothing to go and ask for.
        vi.mocked(filesManagerService.getTree).mockResolvedValue({
            dirs: [{ id: '1', name: 'Research', summary: 'Background reading.', files: [] }],
            files: [],
        })

        const wrapper = mountTree()
        await flushPromises()
        await openTab(wrapper, 'Notes')
        vi.mocked(filesManagerService.getDirContent).mockClear()

        const dirItem = wrapper.findComponent(TreeItem)
        await dirItem.find('.node-actions-trigger').trigger('click')
        const editBtn = dirItem.findAll('.context-menu div').find(d => d.text() === 'Edit')
        await editBtn?.trigger('click')
        await flushPromises()

        expect(filesManagerService.getDirContent).not.toHaveBeenCalled()
        expect((wrapper.vm as any).modalInputContext).toBe('Background reading.')
    })

    it('refetches the stories tree on a stories:changed event, from outside the component', async () => {
        // DashboardView.vue dispatches this after deleting a story -- a change this
        // component did not make and so cannot know about through its own actions.
        mountTree()
        await flushPromises()
        vi.mocked(filesManagerService.getTree).mockClear()

        window.dispatchEvent(new Event('stories:changed'))
        await flushPromises()

        expect(filesManagerService.getTree).toHaveBeenCalledWith('stories')
    })

    describe('telling a story\'s dashboard about a change made from the sidebar', () => {
        function listenForStoriesChanged() {
            const listener = vi.fn()
            window.addEventListener('stories:changed', listener)
            return listener
        }

        it('names the story when a chapter is added to it', async () => {
            vi.mocked(filesManagerService.getTree).mockResolvedValue({
                dirs: [{ id: 'story-1', name: 'Example Story', summary: '', files: [] }],
                files: []
            })
            vi.mocked(filesManagerService.addFile).mockResolvedValue({})
            const wrapper = mountTree()
            await flushPromises()
            const listener = listenForStoriesChanged()

            const story = wrapper.findAllComponents(TreeItem)
                .find(item => item.props('node').name === 'Example Story')
            await story?.find('.node-actions-trigger').trigger('click')
            const newFileBtn = story?.findAll('.context-menu div').find(d => d.text() === 'New File')
            await newFileBtn?.trigger('click')

            const modal = wrapper.findComponent(Modal)
            await modal.find('input').setValue('Chapter One')
            await modal.vm.$emit('confirm')
            await flushPromises()

            expect(filesManagerService.addFile).toHaveBeenCalledWith('stories', 'Chapter One', 'story-1')
            expect(listener).toHaveBeenCalledTimes(1)
            const event = listener.mock.calls[0]?.[0] as CustomEvent<{ storyId?: string }>
            expect(event.detail.storyId).toBe('story-1')
            window.removeEventListener('stories:changed', listener)
        })

        it('names the story when one of its chapters is deleted', async () => {
            vi.mocked(filesManagerService.getTree).mockResolvedValue({
                dirs: [{
                    id: 'story-1', name: 'Example Story', summary: '',
                    files: [{ id: 'chapter-1', name: 'Chapter One', status: '' }]
                }],
                files: []
            })
            vi.mocked(filesManagerService.delFile).mockResolvedValue(null)
            const wrapper = mountTree()
            await flushPromises()
            const listener = listenForStoriesChanged()

            const story = wrapper.findAllComponents(TreeItem)
                .find(item => item.props('node').name === 'Example Story')
            await story?.find('.toggle-icon').trigger('click')
            const chapter = wrapper.findAllComponents(TreeItem)
                .find(item => item.props('node').name === 'Chapter One')
            await chapter?.find('.node-actions-trigger').trigger('click')
            const deleteBtn = chapter?.findAll('.context-menu div').find(d => d.text() === 'Delete')
            await deleteBtn?.trigger('click')
            const confirmModal = wrapper.findAllComponents(Modal).find(m => m.props('title') === 'Confirm Action')
            await confirmModal?.vm.$emit('confirm')
            await flushPromises()

            expect(filesManagerService.delFile).toHaveBeenCalledWith('stories', 'chapter-1')
            const event = listener.mock.calls[0]?.[0] as CustomEvent<{ storyId?: string }>
            expect(event.detail.storyId).toBe('story-1')
            window.removeEventListener('stories:changed', listener)
        })

        it('names the story itself when its own synopsis is edited', async () => {
            vi.mocked(filesManagerService.getTree).mockResolvedValue({
                dirs: [{ id: 'story-1', name: 'Example Story', summary: 'Old.', files: [] }],
                files: []
            })
            vi.mocked(filesManagerService.editDir).mockResolvedValue({})
            const wrapper = mountTree()
            await flushPromises()
            const listener = listenForStoriesChanged()

            const story = wrapper.findAllComponents(TreeItem)
                .find(item => item.props('node').name === 'Example Story')
            await story?.find('.node-actions-trigger').trigger('click')
            const editBtn = story?.findAll('.context-menu div').find(d => d.text() === 'Edit')
            await editBtn?.trigger('click')

            const modal = wrapper.findComponent(Modal)
            await modal.vm.$emit('confirm')
            await flushPromises()

            expect(filesManagerService.editDir).toHaveBeenCalled()
            const event = listener.mock.calls[0]?.[0] as CustomEvent<{ storyId?: string }>
            expect(event.detail.storyId).toBe('story-1')
            window.removeEventListener('stories:changed', listener)
        })

        it('does not dispatch for a notes-space change', async () => {
            vi.mocked(filesManagerService.getTree).mockResolvedValue({ dirs: [], files: [] })
            vi.mocked(filesManagerService.addFile).mockResolvedValue({})
            const wrapper = mountTree()
            await flushPromises()
            await openTab(wrapper, 'Notes')
            const listener = listenForStoriesChanged()

            const newFileBtn = rootMenuItem(wrapper, 'New File')
            await newFileBtn?.trigger('click')
            const modal = wrapper.findComponent(Modal)
            await modal.find('input').setValue('a-note.txt')
            await modal.vm.$emit('confirm')
            await flushPromises()

            expect(listener).not.toHaveBeenCalled()
            window.removeEventListener('stories:changed', listener)
        })
    })

    describe('renaming a file', () => {
        /** Opens the rename dialog on the one file in the notes tree. */
        async function openRenameOn(wrapper: ReturnType<typeof mountTree>) {
            vi.mocked(filesManagerService.getTree).mockResolvedValue({
                dirs: [],
                files: [{ id: 'f1f1f1f1f1f1f1f1', name: 'scratch', status: '' }],
            })
            await openTab(wrapper, 'Notes')

            const item = wrapper.findComponent(TreeItem)
            await item.find('.node-actions-trigger').trigger('click')
            const edit = item.findAll('.context-menu div').find(d => d.text() === 'Edit')
            await edit?.trigger('click')
            return wrapper
        }

        it('follows the selection to the new id, since a rename changes it', async () => {
            // Without this the selection names a file the API no longer has, and the
            // next autosave fails against it.
            vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new0000000000000' })
            const wrapper = mountTree()
            await flushPromises()
            await openRenameOn(wrapper)

            useSharedFiles().setSelectedFile('notes', 'f1f1f1f1f1f1f1f1')
            ;(wrapper.vm as any).modalInputName = 'renamed'
            await (wrapper.vm as any).submitModal()
            await flushPromises()

            expect(useSharedFiles().selectedFile.value).toEqual({
                space: 'notes',
                id: 'new0000000000000',
            })
        })

        it('re-assigns the selection even when the rename leaves the id alone', async () => {
            // "first chapter" and "First Chapter" are one filename and two names: the
            // API answers the same id, but the open file's title still changed, so
            // Text.vue has to be told to re-read it.
            vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'f1f1f1f1f1f1f1f1' })
            const wrapper = mountTree()
            await flushPromises()
            await openRenameOn(wrapper)

            useSharedFiles().setSelectedFile('notes', 'f1f1f1f1f1f1f1f1')
            const before = useSharedFiles().selectedFile.value
            ;(wrapper.vm as any).modalInputName = 'First Chapter'
            await (wrapper.vm as any).submitModal()
            await flushPromises()

            expect(useSharedFiles().selectedFile.value).toEqual({
                space: 'notes',
                id: 'f1f1f1f1f1f1f1f1',
            })
            expect(useSharedFiles().selectedFile.value).not.toBe(before)
        })

        it('leaves a selection on some other file alone', async () => {
            vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new0000000000000' })
            const wrapper = mountTree()
            await flushPromises()
            await openRenameOn(wrapper)

            useSharedFiles().setSelectedFile('notes', 'elsewhere00000000')
            ;(wrapper.vm as any).modalInputName = 'renamed'
            await (wrapper.vm as any).submitModal()
            await flushPromises()

            expect(useSharedFiles().selectedFileId.value).toBe('elsewhere00000000')
        })

        it('replaces the editor URL when it is the renamed file that is open', async () => {
            vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new0000000000000' })
            mockRoute.name = 'write'
            mockRoute.params = { id: 'story00000000000', fileId: 'f1f1f1f1f1f1f1f1' }
            const wrapper = mountTree()
            await flushPromises()
            await openRenameOn(wrapper)

            ;(wrapper.vm as any).modalInputName = 'renamed'
            await (wrapper.vm as any).submitModal()
            await flushPromises()

            expect(mockReplace).toHaveBeenCalledWith({
                name: 'write',
                params: { id: 'story00000000000', fileId: 'new0000000000000' },
            })
            mockRoute.name = 'home'
            mockRoute.params = {}
        })
    })
})
