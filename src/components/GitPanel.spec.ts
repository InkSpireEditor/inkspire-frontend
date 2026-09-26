import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GitPanel from './GitPanel.vue'
import { gitService, type GitStatus } from '../services/git'
import { resetSharedGit } from '../services/sharedGit'

vi.mock('../services/git', () => ({
  gitService: {
    status: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
  }
}))

const CLEAN: GitStatus = {
  branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0,
  fetched: false, clean: true, changes: [],
}

const ONE_CHANGE: GitStatus = {
  ...CLEAN,
  clean: false,
  changes: [
    { path: 'stories/example/chapters/one.ink', state: 'modified', staged: false, dir: 'a1b2', committable: true },
  ],
}

function mountPanel() {
  return mount(GitPanel, { global: { stubs: { teleport: true } } })
}

const clickButton = async (wrapper: ReturnType<typeof mountPanel>, label: string) => {
  const button = wrapper.findAll('button').find((b) => b.text() === label)
  await button?.trigger('click')
  return button
}

describe('GitPanel.vue', () => {
  beforeEach(() => {
    document.cookie = 'auth_status=1; Path=/'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(gitService.status).mockResolvedValue(CLEAN)
  })

  afterEach(() => {
    document.cookie = 'auth_status=; Path=/; Max-Age=0'
    vi.clearAllMocks()
    resetSharedGit()
  })

  it('renders its title', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('h3').text()).toBe('Git')
  })

  it('fetches the status on mount and shows the branch', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(gitService.status).toHaveBeenCalled()
    expect(wrapper.text()).toContain('main')
    expect(wrapper.text()).toContain('Nothing to commit')
  })

  it('does not fetch when there is no active session', async () => {
    document.cookie = 'auth_status=; Path=/; Max-Age=0'
    mountPanel()
    await flushPromises()
    expect(gitService.status).not.toHaveBeenCalled()
  })

  it('counts only the committable changes, and enables Commit', async () => {
    vi.mocked(gitService.status).mockResolvedValue({
      ...ONE_CHANGE,
      changes: [
        ...ONE_CHANGE.changes,
        { path: 'stories/example/lorebook/data/entities.yaml', state: 'modified', staged: false, dir: 'a1b2', committable: false },
      ],
    })
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.text()).toContain('1 to commit')
    const commitButton = wrapper.findAll('button').find((b) => b.text() === 'Commit…')
    expect(commitButton?.attributes('disabled')).toBeUndefined()
  })

  it('disables Commit when there is nothing committable', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const commitButton = wrapper.findAll('button').find((b) => b.text() === 'Commit…')
    expect(commitButton?.attributes('disabled')).toBeDefined()
  })

  it('opens the message dialog, commits, and shows the result', async () => {
    vi.mocked(gitService.status).mockResolvedValue(ONE_CHANGE)
    vi.mocked(gitService.commit).mockResolvedValue({
      ...CLEAN,
      sha: 'abc123',
      message: 'Draft the opening',
      committed: ['stories/example/chapters/one.ink'],
    })

    const wrapper = mountPanel()
    await flushPromises()

    await clickButton(wrapper, 'Commit…')
    await wrapper.find('textarea').setValue('Draft the opening')
    await clickButton(wrapper, 'Commit')
    await flushPromises()

    expect(gitService.commit).toHaveBeenCalledWith('Draft the opening')
    expect(wrapper.text()).toContain('Nothing to commit')
  })

  it('refuses an empty commit message without calling the API', async () => {
    vi.mocked(gitService.status).mockResolvedValue(ONE_CHANGE)
    const wrapper = mountPanel()
    await flushPromises()

    await clickButton(wrapper, 'Commit…')
    await clickButton(wrapper, 'Commit')

    expect(gitService.commit).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('A commit needs a message.')
  })

  it('pushes and shows the resulting status', async () => {
    vi.mocked(gitService.push).mockResolvedValue(CLEAN)
    const wrapper = mountPanel()
    await flushPromises()

    await clickButton(wrapper, 'Push')
    await flushPromises()

    expect(gitService.push).toHaveBeenCalled()
  })

  it('pulls and shows the resulting status', async () => {
    vi.mocked(gitService.pull).mockResolvedValue(CLEAN)
    const wrapper = mountPanel()
    await flushPromises()

    await clickButton(wrapper, 'Pull')
    await flushPromises()

    expect(gitService.pull).toHaveBeenCalled()
  })

  it('shows a refusal from the API in the error dialog', async () => {
    vi.mocked(gitService.pull).mockRejectedValue(new Error('Pull failed: diverged, 1 behind.'))
    const wrapper = mountPanel()
    await flushPromises()

    await clickButton(wrapper, 'Pull')
    await flushPromises()

    expect(wrapper.text()).toContain('Pull failed: diverged, 1 behind.')
  })
})
