<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Login from './components/Login.vue'
import Tree from './components/Tree.vue'
import Text from './components/Text.vue'

const isAuthenticated = ref(false)

onMounted(() => {
  const token = localStorage.getItem('jwt_token')
  if (token) {
    isAuthenticated.value = true
  }
})

const handleLoginSuccess = (token: string) => {
  localStorage.setItem('jwt_token', token)
  isAuthenticated.value = true
}
</script>

<template>
  <div v-if="isAuthenticated" class="app-layout">
    <aside>
      <Tree />
    </aside>

    <main>
      <Text />
    </main>
  </div>
  <Login v-else @login-success="handleLoginSuccess" />
</template>

<style scoped>
/* App Layout */
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

aside {
  width: 300px;
  height: 100%;
  border-right: 1px solid var(--color-border);
  overflow: hidden;
  background-color: var(--color-background);
}

main {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  background-color: var(--color-background-soft);
}

.content-placeholder {
  text-align: center;
  margin-top: 5rem;
  color: var(--color-text);
}
</style>
