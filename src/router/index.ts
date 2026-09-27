import { createRouter, createWebHistory } from 'vue-router'
import Text from '../components/Text.vue'
import DashboardView from '../views/DashboardView.vue'
import EditorRoute from '../views/EditorRoute.vue'
import ReadingView from '../views/ReadingView.vue'
import TimelineView from '../views/TimelineView.vue'
import LoreView from '../views/LoreView.vue'

/**
 * Only the stories space has routes. A note has no URL of its own: selecting one
 * sets the shared file selection directly, the same way it always has, and Text.vue
 * renders under '/' regardless of what was open there before.
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Text },
    { path: '/story/:id', name: 'dashboard', component: DashboardView },
    { path: '/story/:id/write/:fileId', name: 'write', component: EditorRoute },
    { path: '/story/:id/read', name: 'read', component: ReadingView },
    { path: '/story/:id/timeline', name: 'timeline', component: TimelineView },
    { path: '/story/:id/lore', name: 'lore', component: LoreView },
  ],
})
