import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GitPanel from './GitPanel.vue'
import { gitService, type GitChange, type GitStatus } from '../services/git'
import { resetSharedGit } from '../services/sharedGit'

vi.mock('../services/git', () => ({
  gitService: {
    status: vi.fn(),
    commit: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    reset: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
  }
}))

vi.mock('../services/filesManager', () => ({
  filesManagerService: {
    getTree: vi.fn().mockResolvedValue({
      dirs: [{ id: 'a1b2', name: 'Example Story', summary: '', files: [{ id: 'f1', name: 'Chapter One', status: '', tags: [] }] }],
      files: [{ id: 'f2', name: 'A One-Shot', status: '', tags: [] }],
    }),
  },
}))

const CLEAN: GitStatus = {
  branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0,
  fetched: false, clean: true, changes: [],
}

const change = (over: Partial<GitChange>): GitChange => ({
  path: 'stories/example/chapters/one.ink', state: 'modified', staged: false, unstaged: true,
  id: 'f1', dir: 'a1b2', committable: true, ...over,
})

const ONE_CHANGE: GitStatus = { ...CLEAN, clean: false, changes: [change({})] }

const STAGED: GitStatus = {
  ...CLEAN,
  clean: false,
  changes: [change({ staged: true, unstaged: false })],
}

function mountPanel() {
  return mount(GitPanel, {
    global: { stubs: { teleport: true, 'router-link': { props: ['to'], template: '<a><slot /></a>' } } },
  })
}

const clickButton = async (wrapper: ReturnType<typeof mountPanel>, label: string) => {
  const button = wrapper.findAll('button').find((b) => b.text() === label)
  await button?.trigger('click')
  return button
}

describe('GitPanel.vue', () => {
  it('shows commits ahead and behind as arrow icons beside their counts', async () => {
    vi.mocked(gitService.status).mockResolvedValue({ ...CLEAN, ahead: 2, behind: 3 })
    const wrapper = mountPanel()
    await flushPromises()

    const counts = wrapper.find('.ahead-behind')
    expect(counts.findAll('svg').map((s) => s.attributes('data-icon'))).toEqual([
      'arrow-up',
      'arrow-down',
    ])
    expect(counts.text().replace(/\s+/g, '')).toBe('23')
  })

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
    expect(wrapper.text()).toContain('Nothing changed')
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
        change({ path: 'stories/example/lorebook/data/entities.yaml', id: null, committable: false }),
      ],
    })
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.findAll('.change-list li')).toHaveLength(1)
    expect(wrapper.text()).toContain('0 staged, 1 not staged')
  })

  it('lists each change with the names the tree gives, a link, and a hollow or filled dot', async () => {
    vi.mocked(gitService.status).mockResolvedValue({
      ...CLEAN,
      clean: false,
      changes: [
        change({}),
        change({ path: 'stories/solo.ink', id: 'f2', dir: 'f2', state: 'untracked', staged: true, unstaged: false }),
        change({ path: 'stories/example/story.yaml', id: null }),
      ],
    })
    const wrapper = mountPanel()
    await flushPromises()

    const rows = wrapper.findAll('.change-list li')
    expect(rows.map((r) => r.find('a, span:not(.git-mark):not(.state)').text())).toEqual([
      'Example Story / Chapter One',
      'A One-Shot',
      'Example Story / story.yaml',
    ])
    expect(rows[0]!.find('.git-mark').classes()).toContain('changed')
    expect(rows[1]!.find('.git-mark').classes()).toContain('staged')
    expect(rows[1]!.find('.state').text()).toBe('new')
    expect(rows[2]!.find('a').exists()).toBe(false)
  })

  it('disables Commit while nothing is staged, and enables it once something is', async () => {
    vi.mocked(gitService.status).mockResolvedValue(ONE_CHANGE)
    const wrapper = mountPanel()
    await flushPromises()
    const commit = () => wrapper.findAll('button').find((b) => b.text() === 'Commit…')
    expect(commit()?.attributes('disabled')).toBeDefined()

    vi.mocked(gitService.stage).mockResolvedValue(STAGED)
    await clickButton(wrapper, 'Stage all')
    await flushPromises()

    expect(gitService.stage).toHaveBeenCalledWith({})
    expect(commit()?.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('1 staged, 0 not staged')
  })

  it('discards everything only after a confirmation that counts the files', async () => {
    vi.mocked(gitService.status).mockResolvedValue({
      ...CLEAN,
      clean: false,
      changes: [change({}), change({ path: 'stories/solo.ink', id: 'f2', dir: 'f2', state: 'untracked' })],
    })
    vi.mocked(gitService.reset).mockResolvedValue(CLEAN)
    const wrapper = mountPanel()
    await flushPromises()

    await clickButton(wrapper, 'Reset all…')
    expect(gitService.reset).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Discard the changes to 1 file')

    await clickButton(wrapper, 'Discard')
    await flushPromises()
    expect(gitService.reset).toHaveBeenCalledWith({})
  })

  it('has nothing to reset when every change is a new file', async () => {
    vi.mocked(gitService.status).mockResolvedValue({
      ...CLEAN,
      clean: false,
      changes: [change({ state: 'untracked' })],
    })
    const wrapper = mountPanel()
    await flushPromises()

    const reset = wrapper.findAll('button').find((b) => b.text() === 'Reset all…')
    expect(reset?.attributes('disabled')).toBeDefined()
  })

  it('opens the message dialog, commits, and shows the result', async () => {
    vi.mocked(gitService.status).mockResolvedValue(STAGED)
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
    expect(wrapper.text()).toContain('Nothing changed')
  })

  it('refuses an empty commit message without calling the API', async () => {
    vi.mocked(gitService.status).mockResolvedValue(STAGED)
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
