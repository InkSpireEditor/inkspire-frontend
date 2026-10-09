import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRename } from './rename'
import { filesManagerService } from './filesManager'
import { useSharedFiles } from './sharedFiles'

vi.mock('./filesManager', () => ({
  filesManagerService: { editFile: vi.fn() },
}))

const mockReplace = vi.fn().mockResolvedValue(undefined)
const mockRoute = { name: 'home', params: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useRoute: () => mockRoute,
}))

const { setSelectedFile, clearSelectedFile } = useSharedFiles()

beforeEach(() => {
  vi.clearAllMocks()
  mockRoute.name = 'home'
  mockRoute.params = {}
  clearSelectedFile()
})

describe('useRename', () => {
  it('writes the new name through editFile', async () => {
    vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new-id' })
    const rename = useRename()

    await rename('stories', 'old-id', 'New Name')

    expect(filesManagerService.editFile).toHaveBeenCalledWith('stories', 'old-id', 'New Name')
  })

  it("answers the renamed file's new id", async () => {
    vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new-id' })
    const rename = useRename()

    expect(await rename('stories', 'old-id', 'New Name')).toBe('new-id')
  })

  it('answers null when the API gives back no id', async () => {
    vi.mocked(filesManagerService.editFile).mockResolvedValue({})
    const rename = useRename()

    expect(await rename('stories', 'old-id', 'New Name')).toBeNull()
  })

  it('moves the shared selection to the new id when the renamed file was selected', async () => {
    setSelectedFile('stories', 'old-id')
    vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new-id' })
    const rename = useRename()

    await rename('stories', 'old-id', 'New Name')

    const { selectedFileId } = useSharedFiles()
    expect(selectedFileId.value).toBe('new-id')
  })

  it('leaves the shared selection alone when a different file was selected', async () => {
    setSelectedFile('stories', 'other-id')
    vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new-id' })
    const rename = useRename()

    await rename('stories', 'old-id', 'New Name')

    const { selectedFileId } = useSharedFiles()
    expect(selectedFileId.value).toBe('other-id')
  })

  it("still re-points the selection when a rename leaves the id unchanged (case/spacing only)", async () => {
    setSelectedFile('stories', 'old-id')
    vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'old-id' })
    const rename = useRename()

    await rename('stories', 'old-id', 'Old Id')

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('replaces the write route when the renamed file is the one open there', async () => {
    mockRoute.name = 'write'
    mockRoute.params = { id: 'story-1', fileId: 'old-id' }
    vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new-id' })
    const rename = useRename()

    await rename('stories', 'old-id', 'New Name')

    expect(mockReplace).toHaveBeenCalledWith({
      name: 'write',
      params: { id: 'story-1', fileId: 'new-id' },
    })
  })

  it('does not replace the route for a file other than the one open there', async () => {
    mockRoute.name = 'write'
    mockRoute.params = { id: 'story-1', fileId: 'some-other-id' }
    vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new-id' })
    const rename = useRename()

    await rename('stories', 'old-id', 'New Name')

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('does not replace the route when off the write route', async () => {
    mockRoute.name = 'home'
    vi.mocked(filesManagerService.editFile).mockResolvedValue({ id: 'new-id' })
    const rename = useRename()

    await rename('stories', 'old-id', 'New Name')

    expect(mockReplace).not.toHaveBeenCalled()
  })
})
