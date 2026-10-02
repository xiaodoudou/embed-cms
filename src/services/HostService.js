import _ from 'lodash'
import Emitter from 'tiny-emitter'
import { getCurrentInstance, inject, reactive, watch } from 'vue'
import RequestService from '@s/RequestService'
import LoginService from '@s/LoginService'
import ConfigService from '@s/ConfigService'
import TranslateService from '@s/TranslateService'
import NotificationsService from '@s/NotificationsService'
import DialogService from '@s/DialogService'
import vuetify from '../vuetify.js'

/**
 * What a plugin of the admin may rely on, in one object: `window.embedCms.host`, `useAdmin()` in a Vue component, `this.$admin` in an
 * options API component. A thin facade over the services of the admin, so that a plugin does not reach for the loose globals.
 * Documented in docs/extending/PLUGIN_SYSTEM_DESIGN.md and typed in types/global.d.ts (EmbedCMS.Host).
 */
class HostService {
  constructor () {
    this.events = new Emitter()
    this.theme = reactive({ mode: 'light' })
    this.kitSheet = null
  }

  /** Starts to follow the theme and the language of the admin. Called once, when the admin starts. */
  start () {
    if (this.started) {
      return this
    }
    this.started = true
    this.theme.mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => {
        const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
        if (mode !== this.theme.mode) {
          this.theme.mode = mode
          this.events.emit('theme:changed', mode)
        }
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    }
    watch(() => TranslateService.locale, (locale) => this.events.emit('locale:changed', locale))
    return this
  }

  // ---- the CMS

  /** The page's base: where `../api/...` and `../dashboard/summary` are counted from (the admin is served from /admin/) */
  get base () {
    return window.location.pathname
  }

  /** `fetch` to the CMS: relative URLs are counted from the admin page, and the login cookie goes along. Resolves to a Response. */
  fetch (url, init = {}) {
    return window.fetch(new URL(url, new URL(this.base, window.location.origin)), { credentials: 'same-origin', ...init })
  }

  /** The records of a resource over REST, with the login and the rights of the person: list, find, create, update, remove */
  api (resource) {
    const url = (suffix = '') => `${this.base}../api/${resource}${suffix}`
    return {
      list: (query = {}, { page, limit, locale } = {}) => {
        const params = new URLSearchParams()
        if (!_.isEmpty(query)) {
          params.set('query', JSON.stringify(query))
        }
        _.each({ page, limit, locale }, (value, key) => !_.isNil(value) && params.set(key, value))
        const text = params.toString()
        return RequestService.get(url(text ? `?${text}` : ''))
      },
      find: (id) => RequestService.get(url(`/${id}`)),
      create: (record) => RequestService.post(url(), record),
      update: (id, record) => RequestService.put(url(`/${id}`), record),
      remove: (id) => RequestService.delete(url(`/${id}`))
    }
  }

  // ---- the person and the rights

  /** The person who is logged in: `{ username, group, language, theme }`, or null */
  get user () {
    return LoginService.user ? _.pick(LoginService.user, ['username', 'group', 'language', 'theme']) : null
  }

  /** Whether the group of the person has a right (`read`, `create`, `update`, `remove`, `attachments`) on a resource. The server decides in the end. */
  can (right, resource) {
    return _.includes(_.get(LoginService.user, ['rights', right]), resource)
  }

  /** The public part of the configuration (title, locales, features) */
  get config () {
    return ConfigService.config
  }

  // ---- words

  t (key, params) {
    return TranslateService.get(key, params)
  }

  get locale () {
    return TranslateService.locale
  }

  // ---- feedback and navigation

  /** A toast. `kind` is 'success', 'info', 'warn' or 'error'. */
  notify (message, kind = 'info', extra = {}) {
    return NotificationsService.send(message, kind, extra)
  }

  /** The shared dialog: resolves to true on confirm, false on cancel or Escape */
  confirm (options) {
    return DialogService.ask(options)
  }

  /** Opens a resource, or a record of it, with the address the admin itself uses */
  navigate ({ resource, record } = {}) {
    window.location.hash = `#/?id=${encodeURIComponent(resource)}${record ? `&record=${encodeURIComponent(record)}` : ''}`
  }

  // ---- looks

  /** The SVG of an icon the admin uses (Material Design Icons), by the name of its alias: 'lockOutline', 'magnify'... Empty for an unknown name. */
  icon (name) {
    const path = _.get(vuetify, ['icons', 'aliases', name])
    return _.isString(path) ? `<svg class="cms-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>` : ''
  }

  /** The UI kit as a constructable stylesheet, for a plugin in a shadow root: `shadowRoot.adoptedStyleSheets = [await host.kitStyles()]`. Null where the browser has no such sheets. */
  async kitStyles () {
    if (!this.kitSheet) {
      if (typeof CSSStyleSheet === 'undefined' || !_.isFunction(CSSStyleSheet.prototype.replaceSync)) {
        return null
      }
      const response = await this.fetch('kit.css')
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(await response.text())
      this.kitSheet = sheet
    }
    return this.kitSheet
  }

  // ---- events

  /** Listens to `record:saved`, `record:removed`, `locale:changed` or `theme:changed`. Returns a function that stops listening. */
  on (event, listener) {
    this.events.on(event, listener)
    return () => this.events.off(event, listener)
  }

  /** For the admin itself: a record was saved or removed */
  emit (event, payload) {
    this.events.emit(event, payload)
  }
}

export const host = new HostService()

/** In a component of the admin or of a plugin built into it: `const admin = useAdmin()` */
export function useAdmin () {
  return getCurrentInstance() ? inject('host', host) : host
}
