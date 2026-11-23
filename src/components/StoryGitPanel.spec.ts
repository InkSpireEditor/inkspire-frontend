import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StoryGitPanel from './StoryGitPanel.vue'
import { gitService, type GitChange, type GitStatus } from '../services/git'
import { resetSharedGit } from '../services/sharedGit'

vi.mock('../services/git', () => ({
  gitService: { status: vi.fn(), stage: vi.fn(), reset: vi.fn() },
}))

const change = (over: Partial<GitChange>): GitChange => ({
  path: 'stories/example/chapters/one.ink', state: 'modified', staged: false, unstaged: true,
  id: 'f1', dir: 's1', committable: true, ...over,
})

const status = (...changes: GitChange[]): GitStatus => ({
  branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, fetched: false,
  clean: changes.length === 0, changes,
})

const mountPanel = (storyId = 's1') =>
  mount(StoryGitPanel, { props: { storyId }, global: { stubs: { teleport: true } } })

const button = (wrapper: ReturnType<typeof mountPanel>, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label)!

describe('StoryGitPanel.vue', () => {
  beforeEach(() => {
    document.cookie = 'auth_status=1; Path=/'
    resetSharedGit()
    vi.mocked(gitService.status).mockResolvedValue(status())
  })

  afterEach(() => {
    document.cookie = 'auth_status=; Path=/; Max-Age=0'
    vi.clearAllMocks()
  })

  it('says nothing changed, and offers nothing to do, for a clean story', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.text()).toContain('Nothing changed since the last commit')
    expect(button(wrapper, 'Stage all').attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Reset…').attributes('disabled')).toBeDefined()
  })

  it('has no Commit, Push or Pull: those are on the homepage', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['Stage all', 'Reset…'])
  })

  it("counts only this story's changes, and how many are staged", async () => {
    vi.mocked(gitService.status).mockResolvedValue(
      status(
        change({}),
        change({ id: 'f2', staged: true, unstaged: false }),
        change({ id: 'g1', dir: 's2' }),
      ),
    )
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.text()).toContain('2 changed, 1 staged')
  })

  it("stages this story's changes by its id", async () => {
    vi.mocked(gitService.status).mockResolvedValue(status(change({})))
    vi.mocked(gitService.stage).mockResolvedValue(status(change({ staged: true, unstaged: false })))
    const wrapper = mountPanel()
    await flushPromises()

    await button(wrapper, 'Stage all').trigger('click')
    await flushPromises()

    expect(gitService.stage).toHaveBeenCalledWith({ dir: 's1' })
    expect(wrapper.text()).toContain('1 changed, 1 staged')
    expect(button(wrapper, 'Stage all').attributes('disabled')).toBeDefined()
  })

  it('discards only after a confirmation that counts the files it will restore', async () => {
    vi.mocked(gitService.status).mockResolvedValue(
      status(change({}), change({ id: 'f2', state: 'untracked' })),
    )
    vi.mocked(gitService.reset).mockResolvedValue(status())
    const wrapper = mountPanel()
    await flushPromises()

    await button(wrapper, 'Reset…').trigger('click')
    expect(gitService.reset).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Discard the changes to 1 file of this story')

    await button(wrapper, 'Discard').trigger('click')
    await flushPromises()
    expect(gitService.reset).toHaveBeenCalledWith({ dir: 's1' })
  })

  it('shows a refusal in the error dialog', async () => {
    vi.mocked(gitService.status).mockResolvedValue(status(change({})))
    vi.mocked(gitService.stage).mockRejectedValue(new Error('Stage failed: Another git operation is running.'))
    const wrapper = mountPanel()
    await flushPromises()

    await button(wrapper, 'Stage all').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Another git operation is running.')
  })
})
