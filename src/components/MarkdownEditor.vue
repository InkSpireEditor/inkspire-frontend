<script setup lang="ts">
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
  height: 100%;
}

textarea {
  width: 100%;
  height: 80vh;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-background-soft);
  color: var(--color-text);
  font-family: 'Courier New', Courier, monospace;
  font-size: 1rem;
  line-height: 1.5;
  resize: vertical;
}

textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}
</style>
