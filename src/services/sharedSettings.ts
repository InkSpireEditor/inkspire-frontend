import { ref } from 'vue'
import { llmService, type GenerationDefaults } from './llm'

/**
 * Module-level singleton: the writer's own generation settings, read by `Text.vue`
 * when it generates and written to by `GenerationSettings.vue`'s panel. Shared by
 * importing this module rather than through a store, the way sharedModel is --
 * `thinkEnabled` stays there, shown in `GenerationSettings.vue`'s own panel
 * alongside the rest of these, rather than moving here with them.
 *
 * `.env` on the server is the default on a machine with nothing stored yet
 * (`GET /api/llm/defaults`); from the first change on, `localStorage` wins, since a
 * writer who sets a temperature wants it next session too. Nothing here is a secret
 * or shared between writers, so `localStorage` is the right place for it rather than
 * anything server-side.
 */
const STORAGE_KEY = 'inkspire.generationSettings'

interface StoredSettings {
  temperature: number
  promptBudget: number
  prefixShare: number
  numCtx: number | null
  sendSelection: boolean
  autoComplete: boolean
}

const temperature = ref(1.0)
const promptBudget = ref(10000)
const prefixShare = ref(0.75)
/** `null` means "leave it to the model's own default" -- a legitimate choice, not
 *  only the state before anything has loaded. */
const numCtx = ref<number | null>(null)
/** Whether a rewrite sends the selected passage's own text, rather than only its
 *  word count. Mirrors the server's own `INKSPIRE_LLM_SEND_SELECTION` (on by
 *  default) until the writer changes it. */
const sendSelection = ref(true)
/** Whether the editor proposes a completion on idle, shown in grey and accepted
 *  with Tab (frontend#9). Off by default -- unlike the settings above, there is
 *  no server default to start from: it is purely a writer's own choice, so it is
 *  not in `applyDefaults`/`reset` the way `thinkEnabled` (`sharedModel.ts`) is not
 *  either. */
const autoComplete = ref(false)
/** Whether `ensureLoaded` has already run once. */
const loaded = ref(false)

/** What `reset` restores -- the server's own defaults, fetched once and kept. */
let serverDefaults: GenerationDefaults | null = null

function readStored(): StoredSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredSettings) : null
  } catch {
    // A private window, cleared site data, or a browser that blocks storage
    // entirely -- nothing was stored, which reads the same as nothing being there.
    return null
  }
}

function persist(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        temperature: temperature.value,
        promptBudget: promptBudget.value,
        prefixShare: prefixShare.value,
        numCtx: numCtx.value,
        sendSelection: sendSelection.value,
        autoComplete: autoComplete.value,
      } satisfies StoredSettings),
    )
  } catch {
    // Same cases as readStored -- the settings just do not survive this session,
    // which is not worth failing a slider drag over.
  }
}

function applyDefaults(defaults: GenerationDefaults): void {
  temperature.value = defaults.temperature
  promptBudget.value = defaults.prompt_budget
  prefixShare.value = defaults.prefix_share
  numCtx.value = defaults.num_ctx
  sendSelection.value = defaults.send_selection
}

/**
 * Loads the server's defaults, then overlays whatever was stored from an earlier
 * session. Safe to call from every component that might mount first -- only the
 * first call does anything, so `GenerationSettings.vue` opening after `Text.vue` has
 * already generated once does not refetch or overwrite a change the writer made.
 */
async function ensureLoaded(): Promise<void> {
  if (loaded.value) return
  const defaults = await llmService.getDefaults()
  serverDefaults = defaults
  applyDefaults(defaults)

  const stored = readStored()
  if (stored) {
    temperature.value = stored.temperature
    promptBudget.value = stored.promptBudget
    prefixShare.value = stored.prefixShare
    numCtx.value = stored.numCtx
    // A session stored before this setting existed has no `sendSelection` key --
    // `undefined` falls through to the server's own default already applied above,
    // rather than becoming `false` for every writer who has used the app before.
    if (stored.sendSelection !== undefined) {
      sendSelection.value = stored.sendSelection
    }
    // Same guard, for the same reason: a session stored before this setting
    // existed must keep the off default, not read its absence as `false` --
    // which happens to be the default anyway here, but the guard is what makes
    // that a decision rather than a coincidence.
    if (stored.autoComplete !== undefined) {
      autoComplete.value = stored.autoComplete
    }
  }
  loaded.value = true
}

function setTemperature(value: number): void {
  temperature.value = value
  persist()
}

function setPromptBudget(value: number): void {
  promptBudget.value = value
  persist()
}

function setPrefixShare(value: number): void {
  prefixShare.value = value
  persist()
}

function setNumCtx(value: number | null): void {
  numCtx.value = value
  persist()
}

function setSendSelection(value: boolean): void {
  sendSelection.value = value
  persist()
}

function setAutoComplete(value: boolean): void {
  autoComplete.value = value
  persist()
}

/** Restores the server's own defaults, discarding whatever was stored or changed. */
function reset(): void {
  if (serverDefaults) {
    applyDefaults(serverDefaults)
    persist()
  }
}

/** Clears everything. Used by tests to isolate the shared singleton. */
export function resetSharedSettings() {
  temperature.value = 1.0
  promptBudget.value = 10000
  prefixShare.value = 0.75
  numCtx.value = null
  sendSelection.value = true
  autoComplete.value = false
  loaded.value = false
  serverDefaults = null
}

export const useSharedSettings = () => ({
  temperature,
  promptBudget,
  prefixShare,
  numCtx,
  sendSelection,
  autoComplete,
  loaded,
  ensureLoaded,
  setTemperature,
  setPromptBudget,
  setPrefixShare,
  setNumCtx,
  setSendSelection,
  setAutoComplete,
  reset,
})
