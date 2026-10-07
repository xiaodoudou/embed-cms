// Who is signed in. The CMS keeps the login in a cookie that JavaScript cannot read (HttpOnly), so the app never holds a token: it asks the CMS who it is, and the browser sends the cookie.
import { computed, reactive } from 'vue'
import { ApiError } from './http.js'

/**
 * @param {ReturnType<import('./http').createHttp>} http
 */
export function createSession (http) {
  const state = reactive({ user: null, checked: false })

  /** What the CMS puts on what this person writes (`group~account`): the way to know that a change that comes in is one's own. */
  const stamp = computed(() => (state.user ? `${state.user.group}~${state.user.username}` : null))

  /**
   * Asks the CMS who is signed in: `GET /admin/login` answers an empty object when nobody is.
   * @returns {Promise<object|null>}
   */
  async function check () {
    try {
      const user = await http.get('/admin/login')
      state.user = user && user.username ? user : null
    } catch {
      state.user = null
    }
    state.checked = true
    return state.user
  }

  /**
   * @param {string} username
   * @param {string} password
   * @returns {Promise<object>} the person
   * @throws {ApiError} 401 with a sentence for the person, whatever the reason (the CMS does not say which)
   */
  async function login (username, password) {
    try {
      await http.post('/admin/login', { username, password })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new ApiError(401, 'The account or the password is wrong.')
      }
      throw error
    }
    const user = await check()
    if (!user) {
      throw new ApiError(401, 'The sign-in did not hold: is the browser refusing cookies?')
    }
    return user
  }

  /** Ends the session of this browser, at the CMS and here. */
  async function logout () {
    try {
      await http.get('/admin/logout')
    } finally {
      state.user = null
    }
  }

  /**
   * @param {'read'|'create'|'update'|'remove'|'attachments'} action
   * @param {string} resource
   * @returns {boolean} whether the group of the person has that right (the CMS decides again at every request: this is only to hide what would be refused)
   */
  const can = (action, resource) => Boolean(state.user && state.user.rights && (state.user.rights[action] || []).includes(resource))

  return { state, stamp, check, login, logout, can }
}
