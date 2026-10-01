import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import UploadPanel from '@c/UploadPanel.vue'
import UploadService from '@s/UploadService'
import { mountComponent } from './helpers/mountField.js'

let wrapper
let seq = 0
const add = (extra = {}) => {
  const item = { id: ++seq, name: `file-${seq}.png`, size: 2048, status: 'uploading', progress: 0, indeterminate: true, error: '', url: '/u', formData: null, meta: {}, xhr: null, ...extra }
  UploadService.items.push(item)
  UploadService.emitChange()
  return item
}
const panel = async () => {
  wrapper = mountComponent(UploadPanel, { attachTo: document.body })
  await flushPromises()
  return wrapper
}
const change = async () => {
  UploadService.emitChange()
  await flushPromises()
}
const rows = () => wrapper.findAll('.upload-item')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  UploadService.items = []
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('UploadPanel (the uploads in the corner)', () => {
  it('is not there when nothing is uploading', async () => {
    await panel()
    expect(wrapper.find('.upload-panel').exists()).toBe(false)
  })

  it('shows the uploads that are already under way when it starts', async () => {
    add({ name: 'a.png' })
    await panel()
    expect(rows()).toHaveLength(1)
  })

  it('appears when an upload starts, with its name and size', async () => {
    await panel()
    add({ name: 'photo.png', size: 1536 })
    await flushPromises()
    expect(wrapper.get('.upload-name').text()).toBe('photo.png')
    expect(wrapper.get('.upload-size').text()).toBe('1.5 KB')
  })

  it.each([[500, '500 B'], [2048, '2.0 KB'], [5 * 1024 * 1024, '5.0 MB']])('writes %i bytes as %s', async (size, text) => {
    add({ size })
    await panel()
    expect(wrapper.get('.upload-size').text()).toBe(text)
  })

  it('shows no size when it is not known', async () => {
    add({ size: 0 })
    await panel()
    expect(wrapper.find('.upload-size').exists()).toBe(false)
  })

  describe('each upload', () => {
    it('shows an upload that has no progress yet as working', async () => {
      add()
      await panel()
      expect(wrapper.get('.upload-state').text()).toBe('Uploading...')
      expect(wrapper.find('.upload-bar .v-progress-linear__indeterminate').exists()).toBe(true)
    })

    it('shows the percentage once it is known', async () => {
      add({ indeterminate: false, progress: 42 })
      await panel()
      expect(wrapper.get('.upload-state').text()).toBe('42%')
      expect(wrapper.find('.upload-bar .v-progress-linear__indeterminate').exists()).toBe(false)
    })

    it('shows that it is done, failed or cancelled', async () => {
      add({ status: 'done', progress: 100, indeterminate: false })
      add({ status: 'error', error: 'HTTP 500', indeterminate: false })
      add({ status: 'cancelled', indeterminate: false })
      await panel()
      expect(rows().map((row) => row.get('.upload-state').text())).toEqual(['Uploaded', 'Upload failed: HTTP 500', 'Cancelled'])
      expect(rows().map((row) => row.classes().find((name) => name.startsWith('is-')))).toEqual(['is-done', 'is-error', 'is-cancelled'])
    })

    it('can cancel an upload that is under way, and only that', async () => {
      const cancel = vi.spyOn(UploadService, 'cancel').mockImplementation(() => {})
      const item = add()
      await panel()
      const button = wrapper.get('.upload-actions button')
      expect(button.text()).toBe('Cancel')
      expect(button.attributes('aria-label')).toBe(`Cancel ${item.name}`)
      await button.trigger('click')
      expect(cancel).toHaveBeenCalledWith(item.id)
    })

    it('can retry an upload that failed or was cancelled', async () => {
      const retry = vi.spyOn(UploadService, 'retry').mockResolvedValue(true)
      const failed = add({ status: 'error', error: 'x', indeterminate: false })
      const cancelled = add({ status: 'cancelled', indeterminate: false })
      await panel()
      for (const row of rows()) await row.findAll('button')[0].trigger('click')
      expect(retry.mock.calls).toEqual([[failed.id], [cancelled.id]])
    })

    it('can remove a finished upload from the list, but not one under way', async () => {
      const done = add({ status: 'done', indeterminate: false })
      add()
      await panel()
      expect(rows()[1].find('button[aria-label^="Remove"]').exists()).toBe(false)
      await rows()[0].get('button[aria-label^="Remove"]').trigger('click')
      await flushPromises()
      expect(rows()).toHaveLength(1)
      expect(UploadService.items.find((item) => item.id === done.id)).toBeUndefined()
    })
  })

  describe('the summary', () => {
    it('counts the uploads under way', async () => {
      add()
      add()
      await panel()
      expect(wrapper.get('.upload-summary').text()).toBe('2 uploading')
    })

    it('says when all are done', async () => {
      add({ status: 'done', indeterminate: false })
      await panel()
      expect(wrapper.get('.upload-summary').text()).toBe('All uploads complete')
    })

    it('counts the ones that failed', async () => {
      add({ status: 'error', error: 'x', indeterminate: false })
      add({ status: 'done', indeterminate: false })
      await panel()
      expect(wrapper.get('.upload-summary').text()).toContain('1 upload(s) failed')
    })

    it('is announced politely to a screen reader', async () => {
      add()
      await panel()
      expect(wrapper.get('.upload-summary').attributes('role')).toBe('status')
      expect(wrapper.get('.upload-summary').attributes('aria-live')).toBe('polite')
    })
  })

  describe('clearing', () => {
    it('offers Clear once something has finished, and not before', async () => {
      add()
      await panel()
      expect(wrapper.find('.upload-head button').exists()).toBe(false)
      UploadService.items[0].status = 'done'
      await change()
      expect(wrapper.get('.upload-head button').text()).toBe('Clear')
    })

    it('clears the finished uploads, and keeps those under way and the failed ones', async () => {
      add({ status: 'done', indeterminate: false })
      add()
      add({ status: 'error', error: 'x', indeterminate: false })
      await panel()
      await wrapper.get('.upload-head button').trigger('click')
      await flushPromises()
      expect(rows().map((row) => row.classes().find((name) => name.startsWith('is-')))).toEqual(['is-uploading', 'is-error'])
    })

    it('clears itself some time after everything is done, and shows the time left', async () => {
      add({ status: 'done', indeterminate: false })
      await panel()
      expect(wrapper.find('.upload-countdown').exists()).toBe(true)
      vi.advanceTimersByTime(5900)
      await flushPromises()
      expect(wrapper.find('.upload-panel').exists()).toBe(true)
      vi.advanceTimersByTime(200)
      await flushPromises()
      expect(wrapper.find('.upload-panel').exists()).toBe(false)
    })

    it('starts the countdown when the last upload finishes', async () => {
      add()
      await panel()
      expect(wrapper.find('.upload-countdown').exists()).toBe(false)
      UploadService.items[0].status = 'done'
      await change()
      expect(wrapper.find('.upload-countdown').exists()).toBe(true)
    })

    it('does not clear itself while a failed upload is waiting for a decision', async () => {
      add({ status: 'done', indeterminate: false })
      add({ status: 'error', error: 'x', indeterminate: false })
      await panel()
      expect(wrapper.find('.upload-countdown').exists()).toBe(false)
      vi.advanceTimersByTime(20000)
      await flushPromises()
      expect(rows()).toHaveLength(2)
    })

    it('waits while the pointer is over it, and goes on when it leaves', async () => {
      add({ status: 'done', indeterminate: false })
      await panel()
      await wrapper.get('.upload-panel').trigger('mouseenter')
      expect(wrapper.get('.upload-countdown').classes()).toContain('paused')
      vi.advanceTimersByTime(30000)
      await flushPromises()
      expect(wrapper.find('.upload-panel').exists()).toBe(true)
      await wrapper.get('.upload-panel').trigger('mouseleave')
      expect(wrapper.get('.upload-countdown').classes()).not.toContain('paused')
      vi.advanceTimersByTime(6100)
      await flushPromises()
      expect(wrapper.find('.upload-panel').exists()).toBe(false)
    })

    it('waits while a control in it has the focus', async () => {
      add({ status: 'done', indeterminate: false })
      await panel()
      await wrapper.get('.upload-panel').trigger('focusin')
      expect(wrapper.get('.upload-countdown').classes()).toContain('paused')
      await wrapper.get('.upload-panel').trigger('focusout')
      expect(wrapper.get('.upload-countdown').classes()).not.toContain('paused')
    })

    it('does not pause when there is no countdown', async () => {
      add()
      await panel()
      await wrapper.get('.upload-panel').trigger('mouseenter')
      await wrapper.get('.upload-panel').trigger('mouseleave')
      expect(wrapper.find('.upload-countdown').exists()).toBe(false)
    })
  })

  describe('room for the toasts', () => {
    it('tells the page how much room it takes, and gives it back when it goes away', async () => {
      const root = document.documentElement
      add()
      await panel()
      expect(root.style.getPropertyValue('--cms-upload-panel-h')).toBe('8px')
      wrapper.unmount()
      wrapper = undefined
      expect(root.style.getPropertyValue('--cms-upload-panel-h')).toBe('0px')
    })

    it('stops listening to the uploads when it goes away', async () => {
      await panel()
      const off = vi.spyOn(UploadService.events, 'off')
      wrapper.unmount()
      wrapper = undefined
      expect(off).toHaveBeenCalledWith('change', expect.any(Function))
    })
  })
})
