import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import CmsImport from '@c/pages/CmsImport.vue'
import RequestService from '@s/RequestService'
import NotificationsService from '@s/NotificationsService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/RequestService', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const CONFIG = { import: { gsheetId: 'sheet-1', resources: ['products', 'orders'] } }
const STATUS = { products: { create: 2, update: 1 }, orders: { remove: 4 } }

let wrapper
let sent
let loading
const page = async (config = CONFIG) => {
  RequestService.get.mockImplementation(async (url) => (url === './config' ? config : STATUS))
  wrapper = mountComponent(CmsImport, { global: { mocks: { $loading: loading } }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const button = (text) => wrapper.findAll('button').find((item) => item.text() === text)
const xlsx = (name = 'prices.xlsx') => new File(['data'], name, { type: 'text/xlsx' })
const drop = async (files) => {
  await wrapper.get('.file-input-card').trigger('drop', { dataTransfer: { files } })
  await flushPromises()
}
const messages = () => sent.mock.calls.map((call) => [call[1], call[0]])

beforeEach(() => {
  RequestService.get.mockReset()
  RequestService.post.mockReset().mockResolvedValue(STATUS)
  loading = { start: vi.fn(), stop: vi.fn() }
  sent = vi.spyOn(NotificationsService, 'send').mockImplementation(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('CmsImport (the import page)', () => {
  describe('what it shows', () => {
    it('lists the resources that the import covers', async () => {
      await page()
      expect(wrapper.findAll('.config-resources .v-chip').map((chip) => chip.text())).toEqual(['products', 'orders'])
    })

    it('reads the configuration of the import plugin next to it', async () => {
      await page()
      expect(RequestService.get).toHaveBeenCalledWith('./config')
    })

    it('has no resource chips while the import has none configured', async () => {
      await page({ import: {} })
      expect(wrapper.find('.config-resources .v-chip').exists()).toBe(false)
    })

    it('does not offer a difference or an import of the file before there is one', async () => {
      await page()
      expect(button('Check Difference') === undefined).toBe(false)
      const fileButtons = wrapper.findAll('.other-actions.margin-top button')
      expect(fileButtons.map((item) => item.attributes('disabled') !== undefined)).toEqual([true, true])
    })
  })

  describe('the Google Sheet', () => {
    it('opens the sheet in a new tab', async () => {
      const focus = vi.fn()
      const open = vi.spyOn(window, 'open').mockReturnValue({ focus })
      await page()
      await button('Edit Google Sheet').trigger('click')
      expect(open).toHaveBeenCalledWith('https://docs.google.com/spreadsheets/d/sheet-1/edit', '_blank')
      expect(focus).toHaveBeenCalled()
    })

    it('does not fail when the browser blocks the new tab', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null)
      await page()
      await expect(button('Edit Google Sheet').trigger('click')).resolves.not.toThrow()
    })

    it('shows the difference with the remote sheet', async () => {
      await page()
      await button('Check Difference').trigger('click')
      await flushPromises()
      expect(RequestService.get).toHaveBeenLastCalledWith('../import/status')
      expect(wrapper.get('h6').text()).toBe('Difference:')
      expect(wrapper.findAll('.status-resource').map((item) => item.text().replace(/\s+/g, ' '))).toEqual([
        'products:create: 2update: 1remove: 0',
        'orders:create: 0update: 0remove: 4'
      ])
    })

    it('imports from the remote sheet, and calls the result a status', async () => {
      await page()
      await button('Import from Remote').trigger('click')
      await flushPromises()
      expect(RequestService.get).toHaveBeenLastCalledWith('../import/execute')
      expect(wrapper.get('h6').text()).toBe('Status:')
      expect(wrapper.findAll('.status-resource')).toHaveLength(2)
    })

    it('shows the loading mark while it works, and tells the person at the start and the end', async () => {
      await page()
      await button('Check Difference').trigger('click')
      await flushPromises()
      expect(loading.start).toHaveBeenCalledWith('cms-import')
      expect(loading.stop).toHaveBeenCalledWith('cms-import')
      expect(messages().map((item) => item[0])).toEqual(['info', 'success'])
    })

    it('blocks the buttons while it works', async () => {
      let finish
      await page()
      RequestService.get.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
      await button('Import from Remote').trigger('click')
      await flushPromises()
      expect(button('Import from Remote').attributes('disabled')).toBeDefined()
      expect(button('Check Difference').attributes('disabled')).toBeDefined()
      finish(STATUS)
      await flushPromises()
      expect(button('Import from Remote').attributes('disabled')).toBeUndefined()
    })

    it('shows the failure instead of the numbers, says so, and lets the person try again', async () => {
      await page()
      RequestService.get.mockRejectedValueOnce(new Error('Sheet <b>not</b> shared'))
      await button('Import from Remote').trigger('click')
      await flushPromises()
      expect(wrapper.find('.status').exists()).toBe(false)
      expect(wrapper.get('pre').text()).toContain('Sheet')
      expect(messages().map((item) => item[0])).toEqual(['info', 'error'])
      expect(loading.stop).toHaveBeenCalledWith('cms-import')
      expect(button('Import from Remote').attributes('disabled')).toBeUndefined()
    })

    it('does not run a harmful tag from the error message', async () => {
      await page()
      RequestService.get.mockRejectedValueOnce(new Error('<img src=x onerror="window.pwned=1">'))
      await button('Import from Remote').trigger('click')
      await flushPromises()
      expect(wrapper.get('pre').html()).not.toContain('onerror')
    })

    it('forgets the last result when it starts again', async () => {
      await page()
      await button('Check Difference').trigger('click')
      await flushPromises()
      RequestService.get.mockRejectedValueOnce(new Error('late'))
      await button('Check Difference').trigger('click')
      await flushPromises()
      expect(wrapper.find('.status').exists()).toBe(false)
      expect(wrapper.find('pre').exists()).toBe(true)
    })
  })

  describe('the Excel file', () => {
    it('takes a file that is dropped, and shows its name', async () => {
      await page()
      expect(wrapper.get('.file-input-card').text()).toContain('drag & drop')
      await drop([xlsx()])
      expect(wrapper.get('.file-input-card').text()).toContain('prices.xlsx')
      expect(wrapper.get('.file-input-card').classes()).toContain('bold')
    })

    it('marks the card while a file is over it, and not after', async () => {
      await page()
      await wrapper.get('.file-input-card').trigger('dragover')
      expect(wrapper.get('.file-input-card').classes()).toContain('drag-and-drop')
      await wrapper.get('.file-input-card').trigger('dragleave')
      expect(wrapper.get('.file-input-card').classes()).not.toContain('drag-and-drop')
      await wrapper.get('.file-input-card').trigger('dragenter')
      await drop([xlsx()])
      expect(wrapper.get('.file-input-card').classes()).not.toContain('drag-and-drop')
    })

    it('refuses more than one file at a time, and says so in the console', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await page()
      await drop([xlsx('a.xlsx'), xlsx('b.xlsx')])
      expect(wrapper.get('.file-input-card').text()).toContain('drag & drop')
      expect(error).toHaveBeenCalled()
    })

    it('forgets the file when a drop holds none', async () => {
      await page()
      await drop([xlsx()])
      await drop([])
      expect(wrapper.get('.file-input-card').text()).toContain('drag & drop')
    })

    it('enables the two file buttons once there is a file', async () => {
      await page()
      await drop([xlsx()])
      const fileButtons = wrapper.findAll('.other-actions.margin-top button')
      expect(fileButtons.map((item) => item.attributes('disabled') !== undefined)).toEqual([false, false])
    })

    it('sends the file for a difference, as a form', async () => {
      await page()
      const file = xlsx()
      await drop([file])
      await button('Check Difference').trigger('click') // the sheet one is first; the file one follows
      await flushPromises()
      RequestService.post.mockClear()
      await wrapper.findAll('.other-actions.margin-top button')[0].trigger('click')
      await flushPromises()
      const [url, body] = RequestService.post.mock.calls[0]
      expect(url).toBe('../import/statusXlsx')
      expect(body).toBeInstanceOf(FormData)
      expect(body.get('xlsx').name).toBe('prices.xlsx')
      expect(wrapper.get('h6').text()).toBe('Difference:')
      expect(loading.start).toHaveBeenCalledWith('xlsx-import')
      expect(loading.stop).toHaveBeenCalledWith('xlsx-import')
    })

    it('sends the file to import', async () => {
      await page()
      await drop([xlsx()])
      await wrapper.findAll('.other-actions.margin-top button')[1].trigger('click')
      await flushPromises()
      expect(RequestService.post.mock.calls[0][0]).toBe('../import/executeXlsx')
      expect(wrapper.get('h6').text()).toBe('Status:')
      expect(wrapper.findAll('.status-resource')).toHaveLength(2)
    })

    it('shows the failure of an upload', async () => {
      RequestService.post.mockRejectedValue(new Error('Bad sheet'))
      await page()
      await drop([xlsx()])
      await wrapper.findAll('.other-actions.margin-top button')[1].trigger('click')
      await flushPromises()
      expect(wrapper.get('pre').text()).toContain('Bad sheet')
      expect(messages().map((item) => item[0])).toEqual(['info', 'error'])
      expect(loading.stop).toHaveBeenCalledWith('xlsx-import')
    })
  })
})
