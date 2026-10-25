<script setup lang="ts">
/**
 * The whole job of this route is pointing the shared file selection at the file the URL
 * names, so Text.vue -- which knows nothing about routing and reads only useSharedFiles() --
 * opens it exactly as it would if the sidebar had set the selection directly. Serves both
 * `write` (a file in a directory) and `write-root` (a file outside any), in either space.
 */
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSharedFiles } from '../services/sharedFiles'
import { asSpace } from '../services/spaces'
import Text from '../components/Text.vue'

const route = useRoute()
const { setSelectedFile } = useSharedFiles()

watch(
  () => [route.params.space, route.params.fileId],
  ([space, fileId]) => {
    if (typeof space === 'string' && typeof fileId === 'string') {
      setSelectedFile(asSpace(space), fileId)
    }
  },
  { immediate: true }
)
</script>

<template>
  <Text />
</template>
