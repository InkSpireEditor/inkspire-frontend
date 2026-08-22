<script setup lang="ts">
/**
 * Plain textarea wrapper for the editor body. Deliberately uncontrolled beyond
 * the initial value: it emits every keystroke as 'contentChange' and lets the
 * parent own the text, so typing is never interrupted by a re-render.
 */
const props = defineProps<{
  content: string
}>()

const emit = defineEmits(['contentChange'])

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('contentChange', target.value)
}
</script>

<template>
  <div class="markdown-editor">
    <textarea 
      :value="content" 
      @input="handleInput"
      placeholder="Start writing..."
    ></textarea>
  </div>
</template>

<style scoped>
.markdown-editor {
  width: 100%;
  /* Fill the space the editor-container gives us instead of a fixed 80vh,
     so the page never overflows and the action buttons keep steady spacing. */
  flex: 1;
  min-height: 0;
  display: flex;
}

textarea {
  width: 100%;
  flex: 1;
  min-height: 240px;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-background-soft);
  color: var(--color-text);
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code',
    Menlo, Consolas, monospace;
  font-size: 1rem;
  line-height: 1.7;
  resize: none;
  /* Raised writing surface above the recessed canvas. */
  box-shadow: var(--shadow-card);
  transition: border-color var(--transition), box-shadow var(--transition);
}

textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  /* Keep the card elevation, add the focus ring on top. */
  box-shadow: var(--focus-ring), var(--shadow-card);
}
</style>
