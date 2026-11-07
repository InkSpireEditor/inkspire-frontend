<script setup lang="ts">
/**
 * A file's tags as chips, each removable, and an input that adds one. It holds no list of its
 * own: `tags` comes in, and every add or removal is a `change` carrying the whole new list,
 * which the parent decides what to do with (the editor and a directory's page send it to the
 * API, the sidebar's edit modal keeps it until the writer confirms).
 *
 * Enter or a comma adds what is typed; an input that is not a tag says why and adds nothing.
 * Backspace in an empty input does nothing, so a tag is only ever removed by its own button.
 * `compact` keeps the input out of sight behind a small "+" button, for a row of a list.
 */
import { computed, nextTick, ref } from 'vue'
import { TAG_RULE, MAX_TAG_LENGTH, normaliseTag, withTag, withoutTag } from '../services/tags'

const props = defineProps<{
  tags: string[]
  /** Tags that exist elsewhere, offered while typing. */
  suggestions?: string[]
  compact?: boolean
  /** Where the buttons name the file, as in "Add a tag to First Chapter". */
  label?: string
}>()

const emit = defineEmits<{ change: [tags: string[]] }>()

const typed = ref('')
const problem = ref('')
const adding = ref(false)
const input = ref<HTMLInputElement | null>(null)

/** Unique per instance, so two editors on one page do not share a suggestion list. */
const listId = `tag-suggestions-${Math.random().toString(36).slice(2)}`

const addLabel = computed(() => (props.label ? `Add a tag to ${props.label}` : 'Add a tag'))
const removeLabel = (tag: string) =>
  props.label ? `Remove tag ${tag} from ${props.label}` : `Remove tag ${tag}`

/**
 * Adds what is typed. Several tags separated by commas (a paste) are added together, and
 * if any of them is not a tag none is added and the input keeps what was typed.
 */
const add = () => {
  const parts = typed.value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const found = parts.map(normaliseTag)
  if (found.includes(null)) {
    problem.value = TAG_RULE
    return
  }
  problem.value = ''
  typed.value = ''
  const added = (found as string[]).reduce((list, tag) => withTag(list, tag), props.tags)
  if (added.length !== props.tags.length) emit('change', added)
}

const remove = (tag: string) => emit('change', withoutTag(props.tags, tag))

const open = async () => {
  adding.value = true
  await nextTick()
  input.value?.focus()
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    add()
  } else if (event.key === 'Escape' && props.compact) {
    typed.value = ''
    problem.value = ''
    adding.value = false
  }
}

const onBlur = () => {
  if (typed.value.trim() === '' && props.compact) adding.value = false
}
</script>

<template>
  <div class="tag-editor" :class="{ compact }">
    <ul class="chips" aria-label="Tags">
      <li v-for="tag in tags" :key="tag" class="chip">
        <span class="chip-text">{{ tag }}</span>
        <button
          type="button"
          class="chip-remove"
          :aria-label="removeLabel(tag)"
          :title="`Remove tag ${tag}`"
          @click="remove(tag)"
        >
          ×
        </button>
      </li>
    </ul>

    <button
      v-if="compact && !adding"
      type="button"
      class="add-open"
      :aria-label="addLabel"
      title="Add a tag"
      @click="open"
    >
      + tag
    </button>
    <input
      v-else
      ref="input"
      v-model="typed"
      class="tag-input"
      type="text"
      placeholder="Add a tag"
      :aria-label="addLabel"
      :maxlength="MAX_TAG_LENGTH + 8"
      :list="listId"
      autocomplete="off"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <datalist :id="listId">
      <option v-for="tag in (suggestions ?? []).filter((s) => !tags.includes(s))" :key="tag" :value="tag" />
    </datalist>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
  </div>
</template>

<style scoped>
.tag-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.chips {
  display: contents;
  list-style: none;
  margin: 0;
  padding: 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-background-mute);
  color: var(--color-text);
  font-size: 0.8rem;
  line-height: 1.6;
}

.chip-remove,
.add-open {
  padding: 0;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font: inherit;
  cursor: pointer;
}

.chip-remove {
  font-size: 1rem;
  line-height: 1;
}

.add-open {
  font-size: 0.8rem;
  padding: 0 var(--space-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-pill);
}

.chip-remove:hover,
.add-open:hover {
  color: var(--color-primary);
}

.chip-remove:focus-visible,
.add-open:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-sm);
}

.tag-input {
  width: 9rem;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-background-soft);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  line-height: 1.6;
}

.tag-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.problem {
  flex-basis: 100%;
  margin: 0;
  color: var(--color-danger);
  font-size: 0.8rem;
}

/* A phone (frontend#54): the chip's own height does not change, but what a finger can hit does. */
@media (max-width: 640px) {
  .chip-remove {
    min-width: 28px;
    min-height: 28px;
    margin: -4px -6px -4px 0;
  }

  .add-open {
    padding: var(--space-2) var(--space-3);
  }

  .tag-input {
    padding: var(--space-1) var(--space-3);
  }
}
</style>
