import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import CmsConfig from '@c/pages/CmsConfig.vue'
import { mountComponent } from './helpers/mountField.js'

const CONFIG = { port: 9990, title: 'Acme' }

let wrapper
let fetchMock
let reload
const answer = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
const page = async () => {
  wrapper = mountComponent(CmsConfig, { attachTo: document.body })
  await flushPromises()
  return wrapper
}
const textarea = () => wrapper.get('textarea')
const button = (text) => wrapper.findAll('button').find((item) => item.text().includes(text))
const edit = async (text) => {
  await textarea().setValue(text)
  await flushPromises()
}
const chip = () => wrapper.get('.v-chip').text()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fetchMock = vi.fn(async () => answer(CONFIG))
  vi.stubGlobal('fetch', fetchMock)
  reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, pathname: '/admin/', reload })
  window.DialogService = { ask: vi.fn(async () => true) }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  delete window.DialogService
})

describe('CmsConfig (the configuration editor)', () => {
  describe('loading', () => {
    it('reads the configuration of the server next to this admin, and shows it as formatted JSON', async () => {
      await page()
      expect(fetchMock).toHaveBeenCalledWith('/admin/cms-config')
      expect(textarea().element.value).toBe(JSON.stringify(CONFIG, null, 2))
      expect(chip()).toBe('Saved')
    })

    it('finds the configuration when the admin path has no trailing slash', async () => {
      vi.stubGlobal('location', { ...window.location, pathname: '/admin', reload })
      await page()
      expect(fetchMock).toHaveBeenCalledWith('/admin/cms-config')
    })

    it('says when the configuration cannot be loaded', async () => {
      fetchMock.mockResolvedValue(answer('nope', false, 403))
      await page()
      expect(wrapper.get('.v-alert').text()).toContain('Failed to load configuration: HTTP error! status: 403')
    })

    it('says when the server cannot be reached', async () => {
      fetchMock.mockRejectedValue(new Error('offline'))
      await page()
      expect(wrapper.get('.v-alert').text()).toContain('offline')
    })

    it('hides the message after a few seconds', async () => {
      fetchMock.mockRejectedValue(new Error('offline'))
      await page()
      vi.advanceTimersByTime(5100)
      await flushPromises()
      expect(wrapper.find('.v-alert').exists()).toBe(false)
    })
  })

  describe('editing', () => {
    it('shows Modified once the text differs, and Saved again when it is put back', async () => {
      await page()
      await edit('{"port": 1}')
      expect(chip()).toBe('Modified')
      await edit(JSON.stringify(CONFIG, null, 2))
      expect(chip()).toBe('Saved')
    })

    it('says what is wrong with text that is not JSON, and blocks saving', async () => {
      await page()
      await edit('{ nope')
      expect(wrapper.text()).toContain('Invalid JSON:')
      expect(button('Save').attributes('disabled')).toBeDefined()
    })

    it('allows saving when the text is valid and changed', async () => {
      await page()
      expect(button('Save').attributes('disabled')).toBeDefined()
      await edit('{"port": 1}')
      expect(button('Save').attributes('disabled')).toBeUndefined()
    })

    it('goes back to the saved configuration with Reset', async () => {
      await page()
      await edit('{"port": 1}')
      await button('Reset').trigger('click')
      await flushPromises()
      expect(textarea().element.value).toBe(JSON.stringify(CONFIG, null, 2))
      expect(chip()).toBe('Saved')
    })
  })

  describe('saving', () => {
    const save = async () => {
      await edit('{"port": 1}')
      fetchMock.mockClear()
      await button('Save').trigger('click')
      await flushPromises()
    }

    it('asks first, because the server restarts', async () => {
      await page()
      await save()
      expect(window.DialogService.ask).toHaveBeenCalledTimes(1)
      expect(window.DialogService.ask.mock.calls[0][0]).toMatchObject({ destructive: true, confirm: 'Save and restart' })
    })

    it('sends nothing when the person says no', async () => {
      await page()
      window.DialogService.ask.mockResolvedValue(false)
      await save()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(chip()).toBe('Modified')
    })

    it('posts the parsed JSON to the same address the configuration was read from', async () => {
      await page()
      await save()
      const [url, options] = fetchMock.mock.calls[0]
      expect(url).toBe('/admin/cms-config')
      expect(options.method).toBe('POST')
      expect(options.headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(options.body)).toEqual({ port: 1 })
    })

    it('says it is saved, then that the server restarts, and reloads the page', async () => {
      await page()
      await save()
      expect(chip()).toBe('Saved')
      expect(wrapper.get('.v-alert').text()).toContain('Configuration saved successfully')
      vi.advanceTimersByTime(1100)
      await flushPromises()
      expect(wrapper.get('.v-alert').text()).toContain('Server is restarting')
      expect(reload).not.toHaveBeenCalled()
      vi.advanceTimersByTime(4000)
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it('says why the server refused, and keeps the edit', async () => {
      await page()
      await edit('{"port": 1}')
      fetchMock.mockResolvedValue(answer('Port in use', false, 400))
      await button('Save').trigger('click')
      await flushPromises()
      expect(wrapper.get('.v-alert').text()).toContain('Failed to save configuration: Port in use')
      expect(chip()).toBe('Modified')
      expect(reload).not.toHaveBeenCalled()
    })
  })
})
