<script setup lang="ts">
/**
 * The whole job of this route is pointing the shared file selection at the chapter
 * the URL names, so Text.vue -- which knows nothing about routing and reads only
 * useSharedFiles() -- opens it exactly as it would if the sidebar had set the
 * selection directly.
 */
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSharedFiles } from '../services/sharedFiles'
import Text from '../components/Text.vue'

const route = useRoute()
const { setSelectedFile } = useSharedFiles()

watch(
  () => route.params.fileId,
  (fileId) => {
    if (typeof fileId === 'string') setSelectedFile('stories', fileId)
  },
  { immediate: true }
)
</script>

<template>
  <Text />
</template>
