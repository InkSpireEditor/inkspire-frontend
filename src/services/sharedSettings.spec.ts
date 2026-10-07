import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { llmService } from './llm'
import { useSharedSettings, resetSharedSettings } from './sharedSettings'

vi.mock('./llm', () => ({
  llmService: {
    getDefaults: vi.fn(),
  },
}))

const DEFAULTS = {
  temperature: 1.0,
  prompt_budget: 10000,
  prefix_share: 0.75,
  num_ctx: null,
  think: null,
}

describe('useSharedSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(llmService.getDefaults).mockResolvedValue({ ...DEFAULTS })
    localStorage.clear()
    resetSharedSettings()
  })

  afterEach(() => {
    localStorage.clear()
    resetSharedSettings()
  })

  it('starts out unloaded, at a sensible fallback', () => {
    const { loaded, temperature, promptBudget, prefixShare, numCtx } = useSharedSettings()
    expect(loaded.value).toBe(false)
    expect(temperature.value).toBe(1.0)
    expect(promptBudget.value).toBe(10000)
    expect(prefixShare.value).toBe(0.75)
    expect(numCtx.value).toBeNull()
  })

  it('loads the servers defaults when nothing is stored', async () => {
    vi.mocked(llmService.getDefaults).mockResolvedValue({
      temperature: 0.8,
      prompt_budget: 5000,
      prefix_share: 0.6,
      num_ctx: 8192,
      think: false,
    })
    const { ensureLoaded, loaded, temperature, promptBudget, prefixShare, numCtx } =
      useSharedSettings()

    await ensureLoaded()

    expect(loaded.value).toBe(true)
    expect(temperature.value).toBe(0.8)
    expect(promptBudget.value).toBe(5000)
    expect(prefixShare.value).toBe(0.6)
    expect(numCtx.value).toBe(8192)
  })

  it('fetches the defaults only once across repeated calls', async () => {
    const { ensureLoaded } = useSharedSettings()
    await ensureLoaded()
    await ensureLoaded()
    expect(llmService.getDefaults).toHaveBeenCalledTimes(1)
  })

  it('a stored value from an earlier session wins over the servers default', async () => {
    localStorage.setItem(
      'inkspire.generationSettings',
      JSON.stringify({ temperature: 0.3, promptBudget: 3000, prefixShare: 0.5, numCtx: 4096 }),
    )
    const { ensureLoaded, temperature, promptBudget, prefixShare, numCtx } = useSharedSettings()

    await ensureLoaded()

    expect(temperature.value).toBe(0.3)
    expect(promptBudget.value).toBe(3000)
    expect(prefixShare.value).toBe(0.5)
    expect(numCtx.value).toBe(4096)
  })

  it('persists a change so it survives into a later session', async () => {
    const { ensureLoaded, setTemperature } = useSharedSettings()
    await ensureLoaded()

    setTemperature(1.4)

    const stored = JSON.parse(localStorage.getItem('inkspire.generationSettings')!)
    expect(stored.temperature).toBe(1.4)
  })

  it('reset restores the servers defaults and persists that too', async () => {
    const { ensureLoaded, setTemperature, setNumCtx, reset, temperature, numCtx } =
      useSharedSettings()
    await ensureLoaded()
    setTemperature(1.9)
    setNumCtx(2048)

    reset()

    expect(temperature.value).toBe(1.0)
    expect(numCtx.value).toBeNull()
    const stored = JSON.parse(localStorage.getItem('inkspire.generationSettings')!)
    expect(stored.temperature).toBe(1.0)
    expect(stored.numCtx).toBeNull()
  })

  it('does not throw when localStorage is unavailable', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    const { ensureLoaded, setTemperature } = useSharedSettings()
    await expect(ensureLoaded()).resolves.toBeUndefined()
    expect(() => setTemperature(1.2)).not.toThrow()

    getItemSpy.mockRestore()
    setItemSpy.mockRestore()
  })
})
