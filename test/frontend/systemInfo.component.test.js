import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import SystemInfo from '@c/layout/SystemInfo.vue'
import DialogService from '@s/DialogService'
import LoginService from '@s/LoginService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/LoginService', () => ({ default: { user: { theme: 'dark' }, logout: vi.fn(async () => {}) } }))

// The live stream of the system numbers: a stand-in for the browser's EventSource that the tests drive by hand.
class FakeEventSource {
  static instances = []
  constructor (url) {
    this.url = url
    this.closed = false
    this.listeners = {}
    FakeEventSource.instances.push(this)
  }
  addEventListener (name, fn) { this.listeners[name] = fn }
  close () { this.closed = true }
  message (data) { this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) }) }
  fail () { this.onerror(new Event('error')) }
  end () { this.listeners.end() }
}

const REPORT = {
  cpu: { count: 32, usage: 43.4, model: 'Fast CPU' },
  memory: { totalMemMb: 65536, usedMemMb: 40960, freeMemMb: 24576, freeMemPercentage: 37.5 },
  network: { total: { inputMb: 2048, outputMb: 512 } },
  drive: { totalGb: 1000, usedGb: 750, usedPercentage: 75 },
  uptime: 7200
}

// the theme switch is a component of its own
const ThemeSwitch = { name: 'ThemeSwitch', template: '<button class="theme-switch-stub" />' }

let wrapper
const info = async (props = {}) => {
  wrapper = mountComponent(SystemInfo, {
    props: { config: { version: '2.6.1' }, settingsData: false, ...props },
    global: { stubs: { ThemeSwitch } },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}
const stream = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]
const connect = async () => {
  vi.advanceTimersByTime(1100)
  await flushPromises()
  return stream()
}
const openSystem = async () => {
  await wrapper.get('button[aria-label="System"]').trigger('click')
  await flushPromises()
  vi.advanceTimersByTime(300)
  await flushPromises()
}
const menuText = () => (document.body.querySelector('.system-info-wrapper') || { textContent: '' }).textContent.replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  window.DialogService = DialogService
  delete window.disableJwtLogin
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  LoginService.logout.mockClear()
})
afterEach(() => {
  wrapper?.unmount()
  DialogService.send(false)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.disableJwtLogin
  document.body.innerHTML = ''
})

describe('SystemInfo (the system menu of the top bar)', () => {
  describe('the stream of system numbers', () => {
    it('connects a moment after it starts, to the system endpoint next to the admin', async () => {
      await info()
      expect(FakeEventSource.instances).toHaveLength(0)
      const source = await connect()
      expect(FakeEventSource.instances).toHaveLength(1)
      expect(source.url).toMatch(/\.\.\/api\/system$/)
    })

    it('shows the numbers it receives in the menu', async () => {
      await info()
      const source = await connect()
      await openSystem()
      expect(menuText()).toContain('0 cores (Unknown)')
      source.message(REPORT)
      await flushPromises()
      const text = menuText()
      expect(text).toContain('43%')
      expect(text).toContain('32 cores (Fast CPU)')
      expect(text).toContain('63%')
      expect(text).toContain('40.0 GB / 64.0 GB')
      expect(text).toContain('75%')
      expect(text).toContain('750.0 GB / 1000.0 GB')
      expect(text).toContain('512 MB')
      expect(text).toContain('2.0 GB')
    })

    it('shows the version of the CMS', async () => {
      await info({ config: { version: '9.9.9' } })
      await openSystem()
      expect(menuText()).toContain('v9.9.9')
    })

    it('hides the disk and the network when the system cannot tell', async () => {
      await info()
      const source = await connect()
      source.message({ ...REPORT, drive: 'not supported', network: 'not supported' })
      await openSystem()
      expect(document.body.querySelector('.system-info-wrapper .drive')).toBe(null)
      expect(document.body.querySelector('.system-info-wrapper .network')).toBe(null)
      expect(document.body.querySelector('.system-info-wrapper .uptime')).not.toBe(null)
    })

    it('says how long the server has been up', async () => {
      await info()
      const source = await connect()
      source.message(REPORT)
      await openSystem()
      expect(menuText()).toMatch(/2 hours/)
    })

    it('keeps the last numbers when a message cannot be read, and says so', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await info()
      const source = await connect()
      source.message(REPORT)
      source.message('not json')
      await openSystem()
      expect(menuText()).toContain('32 cores')
      expect(error).toHaveBeenCalled()
    })

    it('puts the theme of the person on the page with the first message, and only then', async () => {
      await info()
      const source = await connect()
      source.message(REPORT)
      expect(document.documentElement.getAttribute('data-theme') || document.documentElement.className).toMatch(/dark/)
      document.documentElement.removeAttribute('data-theme')
      source.message(REPORT)
      expect(document.documentElement.getAttribute('data-theme')).toBe(null)
    })
  })

  describe('when the stream drops', () => {
    it('reconnects after a growing delay, and starts the delays again once a message comes', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await info()
      let source = await connect()
      source.fail()
      expect(source.closed).toBe(true)
      vi.advanceTimersByTime(1999)
      expect(FakeEventSource.instances).toHaveLength(1)
      vi.advanceTimersByTime(2 + 1000)
      expect(FakeEventSource.instances).toHaveLength(2)
      source = stream()
      source.fail()
      vi.advanceTimersByTime(3999)
      expect(FakeEventSource.instances).toHaveLength(2)
      vi.advanceTimersByTime(2 + 1000)
      expect(FakeEventSource.instances).toHaveLength(3)
      stream().message(REPORT)
      stream().fail()
      vi.advanceTimersByTime(2000 + 1002)
      expect(FakeEventSource.instances).toHaveLength(4)
    })

    it('gives up after ten failed attempts, and says so', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await info()
      await connect()
      for (let attempt = 0; attempt < 10; attempt++) {
        stream().fail()
        vi.advanceTimersByTime(40000)
      }
      const count = FakeEventSource.instances.length
      stream().fail()
      vi.advanceTimersByTime(60000)
      expect(FakeEventSource.instances.length).toBe(count)
      expect(error.mock.calls.some((call) => String(call[0]).includes('Giving up'))).toBe(true)
    })

    it('reconnects when the server ends the stream', async () => {
      await info()
      const source = await connect()
      source.end()
      expect(source.closed).toBe(true)
      vi.advanceTimersByTime(1100)
      expect(FakeEventSource.instances).toHaveLength(2)
    })
  })

  describe('when it goes away', () => {
    it('closes the stream, and does not connect again later', async () => {
      await info()
      const source = await connect()
      wrapper.unmount()
      wrapper = undefined
      expect(source.closed).toBe(true)
      source.fail()
      vi.advanceTimersByTime(60000)
      expect(FakeEventSource.instances).toHaveLength(1)
    })

    it('does not connect at all if it goes away before the stream starts', async () => {
      await info()
      wrapper.unmount()
      wrapper = undefined
      vi.advanceTimersByTime(5000)
      expect(FakeEventSource.instances).toHaveLength(0)
    })
  })

  describe('the theme switch', () => {
    it('is offered unless dark mode is turned off', async () => {
      await info()
      expect(wrapper.findComponent({ name: 'ThemeSwitch' }).exists()).toBe(true)
      wrapper.unmount()
      await info({ config: { disableDarkMode: true } })
      expect(wrapper.findComponent({ name: 'ThemeSwitch' }).exists()).toBe(false)
    })
  })

  describe('signing out', () => {
    it('has a sign out button that signs out', async () => {
      await info()
      await wrapper.get('button[aria-label="Log out"], button[aria-label="Logout"], button[aria-label="Sign out"]').trigger('click')
      expect(LoginService.logout).toHaveBeenCalledTimes(1)
    })

    it('asks before signing out over unsaved edits, and signs out once confirmed', async () => {
      await info()
      DialogService.send(true)
      const button = wrapper.get('button[aria-label="Log out"], button[aria-label="Logout"], button[aria-label="Sign out"]')
      const shown = vi.fn()
      DialogService.events.on('dialog:show', shown)
      await button.trigger('click')
      expect(LoginService.logout).not.toHaveBeenCalled()
      expect(shown).toHaveBeenCalledTimes(1)
      DialogService.send(false)
      await shown.mock.calls[0][0].callback()
      expect(LoginService.logout).toHaveBeenCalledTimes(1)
      DialogService.events.off('dialog:show', shown)
    })

    it('has no button, and says why, with the Basic login (the browser keeps the credentials)', async () => {
      window.disableJwtLogin = true
      await info()
      expect(wrapper.find('button[aria-label="Log out"], button[aria-label="Logout"], button[aria-label="Sign out"]').exists()).toBe(false)
      await openSystem()
      expect(document.body.querySelector('.sign-out-hint')).not.toBe(null)
    })

    it('shows no hint when there is a button', async () => {
      await info()
      await openSystem()
      expect(document.body.querySelector('.sign-out-hint')).toBe(null)
    })
  })

  describe('the links menu', () => {
    const settings = {
      linksGroups: [
        { _type: '_settingsLink', name: 'Docs', url: 'https://docs.example.com/home' },
        { _type: '_settingsLinkGroup', title: 'Tools', links: [{ name: 'Status', url: 'https://status.example.com' }, { name: 'Here', url: `${window.location.origin}/somewhere` }] }
      ]
    }
    const openLinks = async () => {
      await wrapper.get('button[aria-label="Links"]').trigger('click')
      await flushPromises()
      vi.advanceTimersByTime(300)
      await flushPromises()
    }
    const links = () => [...document.body.querySelectorAll('.links-wrapper a.link')]

    it('is absent without links in the settings', async () => {
      await info()
      expect(wrapper.find('button[aria-label="Links"]').exists()).toBe(false)
      wrapper.unmount()
      await info({ settingsData: { linksGroups: [] } })
      expect(wrapper.find('button[aria-label="Links"]').exists()).toBe(false)
    })

    it('lists a single link and a titled group of links', async () => {
      await info({ settingsData: settings })
      await openLinks()
      expect(links().map((link) => link.textContent.trim())).toEqual(['Docs', 'Status', 'Here'])
      expect(document.body.querySelector('.links-wrapper .embed-cms-title').textContent).toBe('Tools')
    })

    it('opens links in a new tab without handing over the opener', async () => {
      await info({ settingsData: settings })
      await openLinks()
      for (const link of links()) {
        expect(link.getAttribute('target')).toBe('_blank')
        expect(link.getAttribute('rel')).toContain('noopener')
        expect(link.getAttribute('rel')).toContain('noreferrer')
      }
    })

    it('marks the links that lead back into this site', async () => {
      await info({ settingsData: settings })
      await openLinks()
      const active = links().filter((link) => link.classList.contains('active')).map((link) => link.textContent.trim())
      expect(active).toEqual(['Here'])
    })
  })
})
