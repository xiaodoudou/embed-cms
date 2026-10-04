import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import RecordEditor from '@c/records/RecordEditor.vue'
import RequestService from '@s/RequestService'
import NotificationsService from '@s/NotificationsService'
import ResourceService from '@s/ResourceService'
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
  describe('the fields that take files', () => {
    const withFiles = { ...resource, schema: [...resource.schema, { field: 'photo', input: 'image', label: 'Photo', localised: false }, { field: 'avatar', input: 'cropimage', label: 'Avatar', localised: false }, { field: 'plan', input: 'imagemap', label: 'Plan', localised: false }, { field: 'doc', input: 'file', label: 'Doc', localised: false }] }

    it('are the file, the image, the crop image and the image map field', async () => {
      await editor({ _local: true }, { resource: withFiles })
      expect(['photo', 'avatar', 'plan', 'doc', 'name', 'price'].map(model => wrapper.vm.isAttachmentField(model))).toEqual([true, true, true, true, false, false])
    })
  })

  describe('what a save sends for the files of a field', () => {
    const gallery = { title: 'products', locales: ['enUS'], _attachmentFields: { '^photo(\\.\\d+)$': true }, schema: [] }
    const file = (id, name, order, extra = {}) => ({ _isAttachment: true, _id: id, _filename: name, _name: 'photo', order, ...extra })
    const original = () => ({ name: 'Lamp', photo: [file('a', 'one.png', 1), file('b', 'two.png', 2), file('c', 'three.png', 3)] })

    it('sends nothing for the files of a record that was not changed', async () => {
      await editor()
      const sent = wrapper.vm.getDataToUpload(gallery, original(), original())
      expect(sent.updatedAttachments).toEqual([])
      expect(sent.deletedAttachments).toEqual([])
      expect(sent.newAttachments).toEqual([])
    })

    it('sends the new order of the files that moved, with the position each one has now', async () => {
      await editor()
      const moved = original()
      moved.photo = [moved.photo[2], moved.photo[0], moved.photo[1]].map((item, i) => ({ ...item, order: i + 1, orderUpdated: true }))
      const sent = wrapper.vm.getDataToUpload(gallery, original(), moved)
      const byId = Object.fromEntries(sent.updatedAttachments.map((item) => [item._id, item.order]))
      expect(byId).toEqual({ c: 1, a: 2, b: 3 })
      expect(sent.deletedAttachments).toEqual([])
      expect(sent.newAttachments).toEqual([])
    })

    it('counts a file taken out as deleted and one added as new, leaving the others alone', async () => {
      await editor()
      const changed = original()
      changed.photo = [changed.photo[0], changed.photo[2], { _isAttachment: true, _filename: 'four.png', _name: 'photo', file: { name: 'four.png' }, data: 'data:' }]
      const sent = wrapper.vm.getDataToUpload(gallery, original(), changed)
      expect(sent.deletedAttachments.map((item) => item._id)).toEqual(['b'])
      expect(sent.newAttachments.map((item) => item._filename)).toEqual(['four.png'])
    })

    it('takes the files out of the record that is sent: they travel on their own, not inside it', async () => {
      await editor()
      const sent = wrapper.vm.getDataToUpload(gallery, original(), original())
      expect(sent.uploadObject.name).toBe('Lamp')
      expect(sent.uploadObject.photo).toBeUndefined()
    })
  })

  describe('the attachments a save sends', () => {
    it('counts a file dragged to another place (its order changed) as an update, as a rename or a crop is', async () => {
      await editor()
      const saved = { _id: 'a1', _name: 'photo', order: 1 }
      expect(wrapper.vm.attachmentWasUpdated(saved, { ...saved })).toBe(false)
      expect(wrapper.vm.attachmentWasUpdated(saved, { ...saved, order: 2 })).toBe(true)
      expect(wrapper.vm.attachmentWasUpdated(saved, { ...saved, cropOptions: { updated: true } })).toBe(true)
      // the areas of an image map too: only when they were just made in the tool
      expect(wrapper.vm.attachmentWasUpdated(saved, { ...saved, imageMap: { areas: [{ id: 'a' }], updated: true } })).toBe(true)
      expect(wrapper.vm.attachmentWasUpdated(saved, { ...saved, imageMap: { areas: [{ id: 'a' }] } })).toBe(false)
      expect(wrapper.vm.attachmentWasUpdated(saved, { ...saved, _name: 'cover' })).toBe(true)
      // a file that never had an order gets one on the first drag: sent too
      expect(wrapper.vm.attachmentWasUpdated({ _id: 'a1', _name: 'photo' }, { _id: 'a1', _name: 'photo', order: 1, orderUpdated: true })).toBe(true)
    })
  })

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

  describe('jump to', () => {
    const page = {
      title: 'pages',
      displayname: { enUS: 'Pages' },
      locales: ['enUS'],
      schema: [
        { field: 'name', input: 'string', label: 'Name', localised: false },
        { field: 'tiles', input: 'paragraph', label: 'Tiles', localised: false, options: { types: ['tile'] } }
      ]
    }

    beforeEach(() => {
      ResourceService.paragraphs = { tile: { title: 'tile', displayname: { enUS: 'Tile' }, schema: [{ field: 'heading', input: 'string', label: 'Heading' }] } }
    })
    afterEach(() => { ResourceService.paragraphs = {} })

    it('offers the menu on every resource, short or long', async () => {
      await editor({ _local: true }, { resource: { ...page, schema: [page.schema[0]] } })
      expect(wrapper.find('.jump-to').exists()).toBe(true)
      wrapper.unmount()
      await editor()
      expect(wrapper.find('.jump-to').exists()).toBe(true)
    })

    it('lists the blocks of a paragraph field under it, named by their type and first text', async () => {
      await editor({ _local: true, tiles: [{ _type: 'tile', heading: 'News' }, { _type: 'tile' }] }, { resource: page })
      expect(wrapper.vm.outlineEntries.map((entry) => entry.label)).toEqual(['Name', 'Tiles', 'Tile · News', 'Heading', 'Tile 2', 'Heading'])
      await edit({ tiles: [{ _type: 'tile', heading: 'Only' }] })
      expect(wrapper.vm.outlineEntries.map((entry) => entry.label)).toEqual(['Name', 'Tiles', 'Tile · Only', 'Heading'])
    })

    it('marks the rows that changed since the record was loaded', async () => {
      await editor({ _id: 'mu0aaaaa', _local: true, name: 'Home', tiles: [{ _type: 'tile', heading: 'News' }] }, { resource: page })
      const changed = () => wrapper.vm.outlineEntries.filter((entry) => entry.dirty).map((entry) => entry.label)
      expect(changed()).toEqual([])
      await edit({ name: 'Home page' })
      expect(changed()).toEqual(['Name'])
      await edit({ tiles: [{ _type: 'tile', heading: 'Latest' }] })
      expect(changed()).toEqual(['Name', 'Tiles', 'Tile · Latest', 'Heading'])
    })

    it('scrolls to the block of the row, and to the field for a row of a field', async () => {
      await editor({ _local: true, tiles: [{ _type: 'tile' }, { _type: 'tile' }] }, { resource: page })
      const field = document.createElement('div')
      field.className = 'field-wrapper'
      field.dataset.model = 'tiles'
      field.innerHTML = '<div class="item nested-level-1"></div><div class="item nested-level-1"><div class="item nested-level-2"></div></div>'
      wrapper.element.appendChild(field)
      const [first, second] = field.querySelectorAll('.item.nested-level-1')
      const scrolled = []
      for (const element of [field, first, second]) {
        element.scrollIntoView = () => scrolled.push(element)
      }
      const entries = wrapper.vm.outlineEntries
      // rows: Name, Tiles, Tile 1, Heading, Tile 2, Heading
      wrapper.vm.jumpToEntry(entries[4])
      wrapper.vm.jumpToEntry(entries[1])
      expect(scrolled).toEqual([second, field])
    })

    it('scrolls to the field of a block, not to the same field of a block inside it, and to the block when it is not drawn', async () => {
      await editor({ _local: true, tiles: [{ _type: 'tile' }] }, { resource: page })
      const field = document.createElement('div')
      field.className = 'field-wrapper'
      field.dataset.model = 'tiles'
      field.innerHTML = '<div class="item nested-level-1"><div class="item nested-level-2"><div class="field-wrapper" data-model="_value.heading"></div></div><div class="field-wrapper" data-model="_value.heading"></div></div>'
      wrapper.element.appendChild(field)
      const block = field.querySelector('.item.nested-level-1')
      const own = block.querySelector(':scope > .field-wrapper')
      const scrolled = []
      for (const element of [field, block, own]) {
        element.scrollIntoView = () => scrolled.push(element)
      }
      wrapper.vm.jumpToEntry(wrapper.vm.outlineEntries[3])
      expect(scrolled).toEqual([own])
      scrolled.length = 0
      own.remove()
      wrapper.vm.jumpToEntry(wrapper.vm.outlineEntries[3])
      expect(scrolled).toEqual([block])
    })

    it('lights up the place it jumps to for a moment, and again at a second jump', async () => {
      await editor({ _local: true, tiles: [{ _type: 'tile' }, { _type: 'tile' }] }, { resource: page })
      const field = document.createElement('div')
      field.className = 'field-wrapper'
      field.dataset.model = 'tiles'
      field.innerHTML = '<div class="item nested-level-1"><div class="field-wrapper" data-model="_value.heading"></div></div><div class="item nested-level-1"></div>'
      wrapper.element.appendChild(field)
      const [first, second] = field.querySelectorAll('.item.nested-level-1')
      const heading = first.querySelector('.field-wrapper')
      for (const element of [field, first, second, heading]) {
        element.scrollIntoView = () => {}
      }
      // rows: Name, Tiles, Tile 1, Heading, Tile 2, Heading
      const entries = wrapper.vm.outlineEntries
      wrapper.vm.jumpToEntry(entries[1])
      wrapper.vm.jumpToEntry(entries[4])
      wrapper.vm.jumpToEntry(entries[3])
      expect([field, second, heading].map((element) => element.classList.contains('jump-flash'))).toEqual([true, true, true])
      expect(first.classList.contains('jump-flash')).toBe(false)
      vi.advanceTimersByTime(1300)
      expect([field, second, heading].map((element) => element.classList.contains('jump-flash'))).toEqual([false, false, false])
      wrapper.vm.jumpToEntry(entries[1])
      expect(field.classList.contains('jump-flash')).toBe(true)
    })

    it('lights the place for the whole time after a second jump to it, not only until the first one would have ended', async () => {
      await editor({ _local: true, tiles: [] }, { resource: page })
      const field = document.createElement('div')
      field.className = 'field-wrapper'
      field.dataset.model = 'tiles'
      field.scrollIntoView = () => {}
      wrapper.element.appendChild(field)
      wrapper.vm.jumpToEntry(wrapper.vm.outlineEntries[1])
      vi.advanceTimersByTime(1000)
      wrapper.vm.jumpToEntry(wrapper.vm.outlineEntries[1])
      // the first jump would have ended at 1200ms
      vi.advanceTimersByTime(1000)
      expect(field.classList.contains('jump-flash')).toBe(true)
      vi.advanceTimersByTime(300)
      expect(field.classList.contains('jump-flash')).toBe(false)
    })

    it('falls back to the field when the block is not drawn', async () => {
      await editor({ _local: true, tiles: [{ _type: 'tile' }] }, { resource: page })
      const field = document.createElement('div')
      field.className = 'field-wrapper'
      field.dataset.model = 'tiles'
      wrapper.element.appendChild(field)
      const scrolled = []
      field.scrollIntoView = () => scrolled.push(field)
      wrapper.vm.jumpToEntry(wrapper.vm.outlineEntries[2])
      expect(scrolled).toEqual([field])
    })
  })
})
