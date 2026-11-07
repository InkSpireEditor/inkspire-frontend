<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isLoggedIn } from './services/api'
import Login from './components/Login.vue'
import Tree from './components/Tree.vue'
import Icon from './components/Icon.vue'
import { useNarrow } from './services/viewport'

const router = useRouter()
const route = useRoute()
const isAuthenticated = ref(false)
// At phone width the sidebar covers the page, so it starts closed (frontend#51).
const narrow = useNarrow()
const isSidebarOpen = ref(!narrow.value)

/**
 * 'auth:expired' is a window event dispatched from services/api.ts (manual
 * logout) and services/apiFetch.ts (a 401 that could not be refreshed). It is
 * the single signal that returns the app to the login screen, so neither of
 * those modules needs a reference to this component.
 */
const handleAuthExpired = () => {
  isAuthenticated.value = false
}

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
  // What is stored is the desktop's choice: opening the sidebar on a phone must not make the
  // desktop open it too, nor must closing it there.
  if (!narrow.value) localStorage.setItem('sidebarOpen', String(isSidebarOpen.value))
}

// Over the page, the sidebar is in the way as soon as it has done its job: after a file or a page
// has been picked from it, and when the window becomes narrow with it open.
watch(
  () => route.fullPath,
  () => {
    if (narrow.value) isSidebarOpen.value = false
  },
)
watch(narrow, (now) => {
  // Back to the desktop's choice once the window is wide again.
  isSidebarOpen.value = now ? false : localStorage.getItem('sidebarOpen') !== 'false'
})

onMounted(() => {
  // The JWT lives in an httpOnly cookie; the readable auth_status flag tells us
  // whether a session is already active on load.
  if (isLoggedIn()) {
    isAuthenticated.value = true
  }
  // Restore the last sidebar state so it survives reloads.
  const storedSidebar = localStorage.getItem('sidebarOpen')
  if (storedSidebar !== null && !narrow.value) {
    isSidebarOpen.value = storedSidebar === 'true'
  }
  window.addEventListener('auth:expired', handleAuthExpired)
})

onUnmounted(() => {
  window.removeEventListener('auth:expired', handleAuthExpired)
})

const handleLoginSuccess = () => {
  isAuthenticated.value = true
  router.push({ name: 'home' }).catch(() => {})
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
      <Icon :name="isSidebarOpen ? 'chevron-left' : 'menu'" />
    </button>

    <div
      v-if="narrow && isSidebarOpen"
      class="sidebar-backdrop"
      data-testid="sidebar-backdrop"
      @click="toggleSidebar"
    ></div>

    <aside :class="{ collapsed: !isSidebarOpen }">
      <Tree />
    </aside>

    <main>
      <router-view />
    </main>
  </div>
  <Login v-else @login-success="handleLoginSuccess" />
</template>

<style scoped>
/* App Layout */
.app-layout {
  display: flex;
  height: 100vh;
  /* The height that is on screen, with the browser's own bars where they are shown. */
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
}

aside {
  width: 300px;
  height: 100%;
  border-right: 1px solid var(--color-divider);
  overflow: hidden;
  background-color: var(--color-panel);
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
}

.sidebar-toggle:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

main {
  flex: 1;
  padding: 2rem 2rem 2.5rem;
  overflow-y: auto;
  background-color: var(--color-background);
}

/* A phone: the sidebar is drawn over the page, not beside it, and a tap outside it closes it. */
@media (max-width: 640px) {
  aside {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 300px;
    max-width: 85vw;
    z-index: 250;
    transition: transform 220ms ease, visibility 0s;
  }

  aside.collapsed {
    margin-left: 0;
    transform: translateX(-100%);
    /* Not reachable by Tab while it is off screen, once it has finished sliding. */
    visibility: hidden;
    transition: transform 220ms ease, visibility 0s 220ms;
  }

  .sidebar-toggle {
    top: 4px;
    left: 8px;
    width: 40px;
    height: 40px;
  }

  /* The toggle is fixed in the top-left corner, so the page starts below it and a long title
     cannot run under it. */
  main {
    padding: 3rem var(--space-3) var(--space-4);
  }

  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--color-backdrop);
  }
}

.content-placeholder {
  text-align: center;
  margin-top: 5rem;
  color: var(--color-text);
}
</style>
