// The addresses of the app, and who may see them. The pages are loaded when they are first visited (a person who only signs in does not download the board).
import { createRouter, createWebHistory } from 'vue-router'

/**
 * @param {ReturnType<import('./services').createServices>} services
 * @param {object} [options]
 * @param {import('vue-router').RouterHistory} [options.history] a test gives a memory history
 */
export function createAppRouter (services, { history = createWebHistory() } = {}) {
  const { session } = services
  const router = createRouter({
    history,
    routes: [
      { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
      { path: '/', name: 'projects', component: () => import('./views/ProjectsView.vue') },
      {
        path: '/p/:key',
        name: 'board',
        component: () => import('./views/BoardView.vue'),
        // a card opens beside the board, at its own address (/p/WEB/t/WEB-3): it can be linked, and the back button closes it
        children: [{ path: 't/:ref', name: 'task', component: () => import('./components/TaskPanel.vue') }]
      },
      { path: '/:rest(.*)*', name: 'missing', component: () => import('./views/MissingView.vue'), meta: { public: true } }
    ]
  })

  router.beforeEach(async (to) => {
    if (!session.state.checked) {
      await session.check()
    }
    const signedIn = Boolean(session.state.user)
    if (to.meta.public) {
      return signedIn && to.name === 'login' ? { name: 'projects' } : true
    }
    return signedIn ? true : { name: 'login', query: { redirect: to.fullPath } }
  })

  // the CMS says that nobody is signed in (the session ended while a page was open): the page is left for the login, and comes back to where it was
  services.onUnauthorized(() => {
    session.state.user = null
    if (router.currentRoute.value.name !== 'login') {
      router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
    }
  })
  return router
}
