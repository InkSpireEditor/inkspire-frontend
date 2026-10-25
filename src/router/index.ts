import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import DashboardView from '../views/DashboardView.vue'
import EditorRoute from '../views/EditorRoute.vue'
import ReadingView from '../views/ReadingView.vue'
import TimelineView from '../views/TimelineView.vue'
import LoreView from '../views/LoreView.vue'

/**
 * An id is 16 hexadecimal characters (`blake2b(...)[:16]`, inkspire-api/docs/routes.md), so
 * matching that and nothing else keeps a word in the path, such as `write`, from being read
 * as one.
 */
const ID = '[0-9a-f]{16}'
const SPACE = 'stories|notes'

/**
 * Every directory and every file has a URL, the same in both spaces. A directory's page is
 * `/:space/:id`; a file in a directory is `/:space/:id/write/:fileId`; a file outside any
 * directory (a one-shot, or a note at the root) is `/:space/write/:fileId`. The reading,
 * timeline and lorebook views exist only for stories. See docs/routes.md.
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: `/:space(${SPACE})/:id(${ID})`, name: 'dashboard', component: DashboardView },
    {
      path: `/:space(${SPACE})/:id(${ID})/write/:fileId(${ID})`,
      name: 'write',
      component: EditorRoute,
    },
    {
      path: `/:space(${SPACE})/write/:fileId(${ID})`,
      name: 'write-root',
      component: EditorRoute,
    },
    { path: `/stories/:id(${ID})/read`, name: 'read', component: ReadingView },
    { path: `/stories/:id(${ID})/timeline`, name: 'timeline', component: TimelineView },
    { path: `/stories/:id(${ID})/lore`, name: 'lore', component: LoreView },
    // The paths before the notes had routes: `/story/:id`, `/story/:id/write/:fileId`, ...
    {
      path: '/story/:rest(.*)',
      redirect: (to) => ({
        path: `/stories/${to.params.rest}`,
        query: to.query,
        hash: to.hash,
      }),
    },
  ],
})
