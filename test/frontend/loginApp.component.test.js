import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import LoginApp from '@c/LoginApp.vue'
import ConfigService from '@s/ConfigService'
import TranslateService from '@s/TranslateService'
import LoginService from '@s/LoginService'
import RequestService from '@s/RequestService'
import LoadingService from '@s/LoadingService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/ConfigService', () => ({ default: { init: vi.fn(async () => {}) } }))
vi.mock('@s/LoginService', () => ({ default: { init: vi.fn() } }))
vi.mock('@s/RequestService', () => ({ default: { post: vi.fn(async () => ({})) } }))

let wrapper
let reload
// the loading bar is the app's: a start/stop pair on the shared loading service
const $loading = { start: (name) => LoadingService.start(name), stop: (name) => LoadingService.stop(name) }

const page = async () => {
  wrapper = mountComponent(LoginApp, { global: { mocks: { $loading } }, attachTo: document.body })
  await flushPromises()
  vi.advanceTimersByTime(150)
  await flushPromises()
  return wrapper
}
const type = async (username, password) => {
  if (username !== undefined) await wrapper.get('#cms-login-username').setValue(username)
  if (password !== undefined) await wrapper.get('#cms-login-password').setValue(password)
}
const submit = async () => {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, pathname: '/admin/', reload })
  vi.spyOn(TranslateService, 'init').mockResolvedValue()
  ConfigService.init.mockReset().mockResolvedValue()
  LoginService.init.mockReset()
  RequestService.post.mockReset().mockResolvedValue({})
  LoadingService.list = []
  delete window.noLogin
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  delete window.noLogin
})

describe('LoginApp (the login page)', () => {
  describe('starting up', () => {
    it('shows the form with the brand, labelled fields and a confirm button', async () => {
      await page()
      expect(wrapper.find('.brand-logo').exists()).toBe(true)
      expect(wrapper.get('h1').text()).toBe('Login')
      expect(wrapper.get('label[for="cms-login-username"]').text()).toBe('Username')
      expect(wrapper.get('label[for="cms-login-password"]').text()).toBe('Password')
      expect(wrapper.get('#cms-login-password').attributes('type')).toBe('password')
      expect(wrapper.get('button[type="submit"]').text()).toBe('Confirm')
    })

    it('lets the password manager fill the fields', async () => {
      await page()
      expect(wrapper.get('#cms-login-username').attributes('autocomplete')).toBe('username')
      expect(wrapper.get('#cms-login-password').attributes('autocomplete')).toBe('current-password')
    })

    it('loads the configuration and the translations, and watches the session', async () => {
      await page()
      expect(ConfigService.init).toHaveBeenCalledTimes(1)
      expect(TranslateService.init).toHaveBeenCalledTimes(1)
      expect(LoginService.init).toHaveBeenCalledTimes(1)
    })

    it('does not watch the session when the login is turned off', async () => {
      window.noLogin = true
      await page()
      expect(LoginService.init).not.toHaveBeenCalled()
    })

    it('fades the form in a moment after it is there', async () => {
      wrapper = mountComponent(LoginApp, { global: { mocks: { $loading } } })
      await flushPromises()
      expect(wrapper.get('.login-layout').classes()).not.toContain('displayed')
      vi.advanceTimersByTime(150)
      await flushPromises()
      expect(wrapper.get('.login-layout').classes()).toContain('displayed')
    })

    it('shows the form even when the configuration cannot be loaded, and says so', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      ConfigService.init.mockRejectedValue(new Error('down'))
      await page()
      expect(wrapper.find('form').exists()).toBe(true)
      expect(error).toHaveBeenCalled()
    })

    describe('the colour scheme', () => {
      const withSystem = async (dark, config) => {
        const original = window.matchMedia
        window.matchMedia = () => ({ matches: dark, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {} })
        ConfigService.config = config
        try {
          await page()
        } finally {
          window.matchMedia = original
        }
        return document.documentElement.dataset.theme
      }
      afterEach(() => { delete ConfigService.config })

      it('follows the system when dark mode is turned on', async () => {
        expect(await withSystem(true, { disableDarkMode: false })).toBe('dark')
      })

      it('is light when the system is light', async () => {
        expect(await withSystem(false, { disableDarkMode: false })).toBe('light')
      })

      it('is light when dark mode is turned off, whatever the system prefers', async () => {
        expect(await withSystem(true, { disableDarkMode: true })).toBe('light')
      })

      it('is light when the configuration could not be read', async () => {
        expect(await withSystem(true, undefined)).toBe('light')
      })
    })

    it('shows the loading mark while it starts, and not after', async () => {
      wrapper = mountComponent(LoginApp, { global: { mocks: { $loading } } })
      await flushPromises()
      vi.advanceTimersByTime(150)
      await flushPromises()
      expect(wrapper.find('.showbox').exists()).toBe(false)
      LoadingService.start('other')
      await flushPromises()
      expect(wrapper.find('.showbox').exists()).toBe(true)
      expect(wrapper.get('.v-application').classes()).toContain('unclickable')
      LoadingService.stop('other')
      await flushPromises()
      expect(wrapper.find('.showbox').exists()).toBe(false)
    })

    it('stops listening to the loading state when it goes away', async () => {
      await page()
      const off = vi.spyOn(LoadingService.events, 'off')
      wrapper.unmount()
      wrapper = undefined
      expect(off).toHaveBeenCalledWith('has-loading', expect.any(Function))
    })
  })

  describe('signing in', () => {
    it('looks unavailable until both fields are filled', async () => {
      await page()
      const wrap = () => wrapper.get('.login-btn-wrapper')
      expect(wrap().classes()).toContain('disabled')
      expect(wrapper.get('button[type="submit"]').attributes('aria-disabled')).toBe('true')
      await type('admin')
      expect(wrap().classes()).toContain('disabled')
      await type(undefined, 'secret')
      expect(wrap().classes()).not.toContain('disabled')
      expect(wrapper.get('button[type="submit"]').attributes('aria-disabled')).toBe('false')
    })

    it('sends the credentials to the login of this admin, then reloads into the app', async () => {
      await page()
      await type('admin', 'secret')
      await submit()
      expect(RequestService.post).toHaveBeenCalledTimes(1)
      expect(RequestService.post).toHaveBeenCalledWith('/admin/login', { username: 'admin', password: 'secret' })
      expect(reload).toHaveBeenCalledTimes(1)
      expect(wrapper.find('#cms-login-error').exists()).toBe(false)
      expect(LoadingService.list).toEqual([])
    })

    it('sends it from the Enter key too (the form submits)', async () => {
      await page()
      await type('admin', 'secret')
      await wrapper.get('#cms-login-password').trigger('keydown.enter')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(RequestService.post).toHaveBeenCalled()
    })

    it('puts the focus on the missing field instead of sending', async () => {
      await page()
      await type('', '')
      await submit()
      expect(RequestService.post).not.toHaveBeenCalled()
      await type('admin')
      await submit()
      expect(RequestService.post).not.toHaveBeenCalled()
    })

    it('focuses the username when it is missing, and the password when only it is', async () => {
      await page()
      const username = wrapper.get('#cms-login-username').element
      const password = wrapper.get('#cms-login-password').element
      const focusUsername = vi.spyOn(username, 'focus')
      const focusPassword = vi.spyOn(password, 'focus')
      await submit()
      expect(focusUsername).toHaveBeenCalledTimes(1)
      await type('admin')
      await submit()
      expect(focusPassword).toHaveBeenCalledTimes(1)
    })

    it('says when the login is wrong, marks both fields, and stays', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      RequestService.post.mockRejectedValue(new Error('401'))
      await page()
      await type('admin', 'wrong')
      await submit()
      const message = wrapper.get('#cms-login-error')
      expect(message.text()).toBe('Login or password is invalid.')
      expect(message.attributes('role')).toBe('alert')
      expect(wrapper.get('#cms-login-username').attributes('aria-invalid')).toBe('true')
      expect(wrapper.get('#cms-login-password').attributes('aria-describedby')).toBe('cms-login-error')
      expect(reload).not.toHaveBeenCalled()
      expect(LoadingService.list).toEqual([])
    })

    it('can be tried again after a failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      RequestService.post.mockRejectedValueOnce(new Error('401'))
      await page()
      await type('admin', 'wrong')
      await submit()
      expect(wrapper.find('#cms-login-error').exists()).toBe(true)
      await type(undefined, 'right')
      await submit()
      expect(RequestService.post).toHaveBeenCalledTimes(2)
      expect(RequestService.post).toHaveBeenLastCalledWith('/admin/login', { username: 'admin', password: 'right' })
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it('sends only once while a login is under way', async () => {
      let finish
      RequestService.post.mockReturnValue(new Promise((resolve) => { finish = resolve }))
      await page()
      await type('admin', 'secret')
      await wrapper.get('form').trigger('submit')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(RequestService.post).toHaveBeenCalledTimes(1)
      expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
      finish({})
      await flushPromises()
      expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    })
  })
})
