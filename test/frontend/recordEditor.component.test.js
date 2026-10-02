import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import RecordEditor from '@c/records/RecordEditor.vue'
import RequestService from '@s/RequestService'
import NotificationsService from '@s/NotificationsService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/RequestService', () => ({
  default: { post: vi.fn(), put: vi.fn(), get: vi.fn(), delete: vi.fn() }
}))

// The editor's form (CustomForm, one component per field) is a component of its own: a stand-in keeps these tests on what the
// editor does around it, which is what they are about: the buttons, the unsaved and missing markers, and what a save sends.
const CustomForm = { props: ['model', 'schema'], template: '<div class="form-stub" />' }

const resource = {
  title: 'products',
  displayname: { enUS: 'Products' },
  locales: ['enUS'],
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true },
    { field: 'price', input: 'number', label: 'Price', localised: false },
    { field: 'featured', input: 'checkbox', label: 'Featured', localised: false },
    { field: 'terms', input: 'checkbox', label: 'Terms', localised: false, required: true }
  ]
}

let wrapper
let notifications
let dialogs
const onNotification = (data) => notifications.push(data)

const editor = async (record = { _local: true }, props = {}) => {
  wrapper = mountComponent(RecordEditor, {
    props: { resource, record, locale: 'enUS', userLocale: 'enUS', ...props },
    global: { components: { CustomForm }, mocks: { $loading: { start: vi.fn(), stop: vi.fn() } } },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}
const button = (selector) => wrapper.find(selector)
// "typing" into the form: the stand-in form has no fields, so the model is edited the way a field does. The editor ignores
// changes for a moment after it opens (fields fill in their own defaults), hence the wait.
const edit = async (changes) => {
  vi.advanceTimersByTime(1000)
  await flushPromises()
  Object.assign(wrapper.vm.editingRecord, changes)
  await wrapper.vm.$nextTick()
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  notifications = []
  dialogs = { send: vi.fn(), show: vi.fn() }
  window.DialogService = dialogs
  NotificationsService.events.on('notification', onNotification)
  RequestService.post.mockReset().mockImplementation(async (url, body) => ({ ...body, _id: 'mu0new' }))
  RequestService.put.mockReset().mockResolvedValue({})
  RequestService.get.mockReset().mockResolvedValue({ _id: 'mu0aaaaa', name: 'Aurora lamp' })
  RequestService.delete.mockReset().mockResolvedValue({})
})
afterEach(() => {
  NotificationsService.events.off('notification', onNotification)
  wrapper?.unmount()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('RecordEditor', () => {
  describe('a new record', () => {
    it('offers Create, no delete and no unsaved marker', async () => {
      await editor()
      expect(button('.update').text()).toBe('Create')
      expect(button('.delete').exists()).toBe(false)
      expect(button('.status-dirty').exists()).toBe(false)
      expect(button('.status-saved').exists()).toBe(false)
    })

    it('shows the unsaved marker, with its explanation, and Discard once something is typed', async () => {
      await editor()
      await edit({ name: 'Aurora lamp' })
      expect(button('.status-dirty').exists()).toBe(true)
      expect(button('.status-dirty').attributes('title')).toContain('not saved')
      expect(button('.discard').exists()).toBe(true)
    })

    it('does not refuse the save because of a switch nobody touched', async () => {
      await editor()
      await edit({ name: 'Aurora lamp' })
      await button('.update').trigger('click')
      await flushPromises()
      expect(RequestService.post).toHaveBeenCalled()
    })

    it('refuses to save while a required field is empty, says which, and sends nothing', async () => {
      await editor()
      await edit({ price: 10 })
      await button('.update').trigger('click')
      await flushPromises()
      expect(RequestService.post).not.toHaveBeenCalled()
      const error = notifications.find((n) => n.type === 'error')
      expect(error, JSON.stringify(notifications)).toBeTruthy()
      expect(error.message).toContain('Name')
      expect(button('.status-missing').exists()).toBe(true)
      expect(button('.status-missing').text()).toContain('1')
    })

    it('can be saved again after the refusal (the button is not stuck)', async () => {
      await editor()
      await button('.update').trigger('click')
      await flushPromises()
      expect(button('.update').attributes('disabled')).toBeUndefined()
    })

    it('creates the record: posts it to its resource, tells the list, and says it was created', async () => {
      await editor()
      await edit({ name: 'Aurora lamp', price: 49.9, featured: true })
      await button('.update').trigger('click')
      await flushPromises()
      expect(RequestService.post).toHaveBeenCalledTimes(1)
      const [url, body] = RequestService.post.mock.calls[0]
      expect(url).toBe('../api/products')
      expect(body).toMatchObject({ name: 'Aurora lamp', price: 49.9, featured: true })
      expect(wrapper.emitted('updateRecordList')[0][0]._id).toBe('mu0new')
      expect(notifications.some((n) => n.type === 'success')).toBe(true)
    })

    it('saves the switches that were left alone as false, never as nothing', async () => {
      await editor()
      await edit({ name: 'Aurora lamp' })
      await button('.update').trigger('click')
      await flushPromises()
      const body = RequestService.post.mock.calls[0][1]
      expect(body.featured).toBe(false)
      expect(body.terms).toBe(false)
    })

    it('tells the person when the server refuses the record, and does not tell the list', async () => {
      RequestService.post.mockRejectedValue({ code: 400, message: 'Field name is duplicated' })
      await editor()
      await edit({ name: 'Aurora lamp' })
      await button('.update').trigger('click')
      await flushPromises()
      expect(notifications.some((n) => n.type === 'error')).toBe(true)
      expect(wrapper.emitted('updateRecordList')).toBeUndefined()
      expect(button('.update').attributes('disabled')).toBeUndefined()
    })
  })

  describe('an existing record', () => {
    const saved = () => ({ _id: 'mu0aaaaa', _local: true, name: 'Aurora lamp', price: 49.9, featured: true, terms: true })

    it('offers Save and delete, and says everything is saved', async () => {
      await editor(saved())
      expect(button('.update').text()).toBe('Save')
      expect(button('.delete').exists()).toBe(true)
      expect(button('.status-saved').exists()).toBe(true)
      expect(button('.status-dirty').exists()).toBe(false)
    })

    it('is not marked unsaved just because it was opened', async () => {
      await editor(saved())
      vi.advanceTimersByTime(2000)
      await flushPromises()
      expect(wrapper.vm.isDirty).toBe(false)
    })

    it('marks an edit as unsaved, and Discard takes it back', async () => {
      await editor(saved())
      await edit({ name: 'Aurora lamp 2' })
      expect(button('.status-dirty').exists()).toBe(true)
      await button('.discard').trigger('click')
      await flushPromises()
      expect(wrapper.vm.editingRecord.name).toBe('Aurora lamp')
      expect(button('.status-dirty').exists()).toBe(false)
    })

    it('saves with a PUT to the record, and reads it back', async () => {
      await editor(saved())
      await edit({ price: 59 })
      await button('.update').trigger('click')
      await flushPromises()
      expect(RequestService.put).toHaveBeenCalledTimes(1)
      expect(RequestService.put.mock.calls[0][0]).toBe('../api/products/mu0aaaaa')
      expect(RequestService.put.mock.calls[0][1]).toMatchObject({ price: 59 })
      expect(RequestService.get).toHaveBeenCalledWith('../api/products/mu0aaaaa')
      expect(wrapper.emitted('updateRecordList')).toBeTruthy()
    })

    it('does not save before it has checked the required fields', async () => {
      await editor(saved())
      await edit({ name: '' })
      await button('.update').trigger('click')
      await flushPromises()
      expect(RequestService.put).not.toHaveBeenCalled()
      expect(button('.status-missing').exists()).toBe(true)
    })

    it('asks before deleting, and names what it deletes', async () => {
      await editor(saved())
      await button('.delete').trigger('click')
      expect(dialogs.show).toHaveBeenCalledTimes(1)
      const dialog = dialogs.show.mock.calls[0][0]
      expect(dialog.destructive).toBe(true)
      expect(dialog.title).toContain('Aurora lamp')
      expect(RequestService.delete).not.toHaveBeenCalled()
    })

    it('deletes once the dialog is confirmed, and tells the list', async () => {
      await editor(saved())
      await button('.delete').trigger('click')
      await dialogs.show.mock.calls[0][0].callback()
      await flushPromises()
      expect(RequestService.delete).toHaveBeenCalledWith('../api/products/mu0aaaaa')
      expect(wrapper.emitted('updateRecordList')[0]).toEqual([null])
    })
  })

  describe('leaving', () => {
    it('stops the browser closing the tab while there are unsaved edits', async () => {
      await editor({ _id: 'mu0aaaaa', _local: true, name: 'x', terms: true })
      await edit({ name: 'y' })
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })

    it('lets the browser close the tab when everything is saved', async () => {
      await editor({ _id: 'mu0aaaaa', _local: true, name: 'x', terms: true })
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    })

    it('tells the app there is nothing unsaved once it goes away', async () => {
      await editor()
      wrapper.unmount()
      expect(dialogs.send).toHaveBeenCalledWith(false)
    })
  })

  it('looks locked when the record cannot be edited', async () => {
    await editor({ _id: 'mu0aaaaa', _local: false, name: 'x' })
    expect(wrapper.classes()).toContain('frozen')
  })
})
