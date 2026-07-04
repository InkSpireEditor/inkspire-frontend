<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { isLoggedIn } from './services/api'
import Login from './components/Login.vue'
import Tree from './components/Tree.vue'
import Text from './components/Text.vue'

const isAuthenticated = ref(false)
const isSidebarOpen = ref(true)

const handleAuthExpired = () => {
  isAuthenticated.value = false
}

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
  localStorage.setItem('sidebarOpen', String(isSidebarOpen.value))
}

onMounted(() => {
  // The JWT lives in an httpOnly cookie; the readable auth_status flag tells us
  // whether a session is already active on load.
  if (isLoggedIn()) {
    isAuthenticated.value = true
  }
  // Restore the last sidebar state so it survives reloads.
  const storedSidebar = localStorage.getItem('sidebarOpen')
  if (storedSidebar !== null) {
    isSidebarOpen.value = storedSidebar === 'true'
  }
  window.addEventListener('auth:expired', handleAuthExpired)
})

onUnmounted(() => {
  window.removeEventListener('auth:expired', handleAuthExpired)
})

const handleLoginSuccess = () => {
  isAuthenticated.value = true
}
</script>

<template>
  <div v-if="isAuthenticated" class="app-layout">
    <button
      class="sidebar-toggle"
      type="button"
      @click="toggleSidebar"
      :aria-label="isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'"
      :aria-expanded="isSidebarOpen"
    >
      {{ isSidebarOpen ? '«' : '☰' }}
    </button>

    <aside :class="{ collapsed: !isSidebarOpen }">
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
  /* Slide out via negative margin so the tree contents don't squish while
     animating; .app-layout's overflow:hidden clips the off-screen panel. */
  transition: margin-left 220ms ease;
}

aside.collapsed {
  margin-left: -300px;
}

/* Pinned toggle that stays put in both states: it sits in the tree's empty
   title-bar corner when open, and floats over the editor when collapsed. */
.sidebar-toggle {
  position: fixed;
  top: 8px;
  left: 12px;
  z-index: 300;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text);
  font-size: 1.1rem;
  line-height: 1;
  transition: background-color var(--transition), color var(--transition);
}

.sidebar-toggle:hover {
  background-color: var(--color-background-mute);
  color: var(--color-primary);
}

.sidebar-toggle:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

main {
  flex: 1;
  padding: 2rem 2rem 2.5rem;
  overflow-y: auto;
  /* Slightly recessed canvas so the editor card reads as raised above it. */
  background-color: var(--color-background);
}

.content-placeholder {
  text-align: center;
  margin-top: 5rem;
  color: var(--color-text);
}
</style>
