import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import CustomForm from '@c/records/CustomForm.vue'
import AbstractEditorView from '@m/AbstractEditorView'
import FieldSelectorService from '@s/FieldSelectorService'
import NotificationsService from '@s/NotificationsService'
import RequestService from '@s/RequestService'
import UploadService from '@s/UploadService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/RequestService', () => ({ default: { delete: vi.fn(), put: vi.fn() } }))

// the fields are components of their own: these draw their schema and report an input when asked
const Field = {
  props: ['schema', 'model', 'disabled', 'focused', 'paragraphLevel', 'paragraphIndex'],
  emits: ['input'],
  template: '<div class="field-stub" :data-focused="String(focused)" :data-disabled="String(disabled)" :data-level="paragraphLevel" :data-index="paragraphIndex">{{ schema.model }}</div>'
}
const components = { CustomInput: { ...Field, name: 'CustomInput' }, CustomTextarea: { ...Field, name: 'CustomTextarea' } }

let wrapper
const form = (props = {}) => {
  wrapper = mountComponent(CustomForm, { props: { model: {}, schema: { fields: [] }, ...props }, global: { components }, attachTo: document.body })
  return wrapper
}
const field = (model, extra = {}) => ({ model, type: 'input', overrideType: 'CustomInput', ...extra })

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('CustomForm (draws the fields of a schema)', () => {
  describe('a plain list of fields', () => {
    it('draws one field for each entry, with the type the schema names', () => {
      form({ schema: { fields: [field('a'), field('b', { overrideType: 'CustomTextarea' })] } })
      expect(wrapper.findAll('.field-wrapper').map((item) => item.attributes('data-model'))).toEqual(['a', 'b'])
      expect(wrapper.findAllComponents({ name: 'CustomTextarea' })).toHaveLength(1)
      expect(wrapper.findAllComponents({ name: 'CustomInput' })).toHaveLength(1)
    })

    it('uses the type when there is no override', () => {
      form({ schema: { fields: [{ model: 'a', type: 'CustomTextarea' }] } })
      expect(wrapper.findAllComponents({ name: 'CustomTextarea' })).toHaveLength(1)
    })

    it('gives every wrapper an id made of the field and the form', () => {
      form({ formId: 7, schema: { fields: [field('a')] } })
      expect(wrapper.get('.field-wrapper').attributes('id')).toBe('a-7')
    })

    it('passes the model, the level and the position to each field', () => {
      form({ paragraphLevel: 2, paragraphIndex: 3, schema: { fields: [field('a')] } })
      const stub = wrapper.get('.field-stub')
      expect(stub.attributes('data-level')).toBe('2')
      expect(stub.attributes('data-index')).toBe('3')
    })

    it('locks a field that the schema locks', () => {
      form({ schema: { fields: [field('a', { disabled: true }), field('b')] } })
      expect(wrapper.findAll('.field-stub').map((item) => item.attributes('data-disabled'))).toEqual(['true', 'undefined'])
    })

    it('draws nothing without a schema', () => {
      form({ schema: null })
      expect(wrapper.find('.vue-form-generator').exists()).toBe(false)
    })
  })

  describe('a layout', () => {
    const layout = { lines: [{ slots: 2, fields: [{ model: 'a', width: 1, schema: field('a') }, { model: 'b', width: 1, schema: field('b') }] }, { fields: [{ model: 'c', schema: field('c') }] }] }

    it('draws the lines, with their sizes, and the fields in them', () => {
      form({ schema: { fields: [field('a'), field('b'), field('c')], layout } })
      const lines = wrapper.findAll('.line-wrapper')
      expect(lines).toHaveLength(2)
      expect(lines[0].classes()).toEqual(expect.arrayContaining(['slots-2', 'nb-fields-2']))
      expect(lines[1].classes()).toEqual(expect.arrayContaining(['slots-1', 'nb-fields-1']))
      expect(lines[0].findAll('.field-wrapper').map((item) => item.attributes('data-model'))).toEqual(['a', 'b'])
    })

    it('gives a field its width in slots, one by default', () => {
      form({ schema: { fields: [], layout: { lines: [{ fields: [{ model: 'a', width: 3, schema: field('a') }, { model: 'b', schema: field('b') }] }] } } })
      expect(wrapper.findAll('.field-wrapper').map((item) => item.classes().find((name) => name.startsWith('width-')))).toEqual(['width-3', 'width-1'])
    })

    it('skips a field whose schema is missing', () => {
      form({ schema: { fields: [], layout: { lines: [{ fields: [{ model: 'a' }] }] } } })
      expect(wrapper.find('.field-stub').exists()).toBe(false)
    })
  })

  describe('a field type that is not known', () => {
    it('says which type is missing, by the schema of the resource, and does not draw it', () => {
      const unknown = { model: 'a', originalModel: 'a', overrideType: undefined, type: false, resource: { schema: [{ field: 'a', input: 'weird' }] } }
      form({ schema: { fields: [unknown] } })
      expect(console.error.mock.calls[0][0]).toContain('undefined field type \'weird\'')
    })

    it('says so for a component that is not registered', () => {
      form({ schema: { fields: [field('a', { overrideType: 'Nope' })] } })
      expect(console.error.mock.calls[0][0]).toContain('isn\'t defined as a custom field type')
    })
  })

  describe('input', () => {
    it('passes up what a field reports, with the position of the form', async () => {
      form({ paragraphIndex: 4, schema: { fields: [field('a')] } })
      wrapper.findComponent({ name: 'CustomInput' }).vm.$emit('input', 'v', 'a')
      expect(wrapper.emitted('input')).toEqual([['v', 'a', 4]])
    })

    it('finds the model in the value when the field does not say', () => {
      form({ schema: { fields: [field('a')] } })
      wrapper.findComponent({ name: 'CustomInput' }).vm.$emit('input', [{ parentKey: 'blocks' }])
      expect(wrapper.emitted('input')[0][1]).toBe('blocks')
    })
  })

  describe('being pointed to', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
    afterEach(() => vi.useRealTimers())

    it('lights up the field that another part of the app selects, then lets it go', async () => {
      form({ schema: { fields: [field('title'), field('body')] } })
      FieldSelectorService.events.emit('select', { field: 'body' })
      await flushPromises()
      vi.advanceTimersByTime(5)
      await flushPromises()
      expect(wrapper.findAll('.field-wrapper').map((item) => item.classes('focused'))).toEqual([false, true])
    })

    it('looks for the field of the language in use when the field is localised', async () => {
      form({ schema: { fields: [field('title.enUS', { localised: true }), field('title.zhCN', { localised: true })] } })
      FieldSelectorService.events.emit('select', { field: 'title' })
      await flushPromises()
      vi.advanceTimersByTime(5)
      await flushPromises()
      expect(wrapper.findAll('.field-wrapper').map((item) => item.classes('focused'))).toEqual([true, false])
    })

    it('stops listening when it goes away', () => {
      form({ schema: { fields: [field('a')] } })
      const off = vi.spyOn(FieldSelectorService.events, 'off')
      wrapper.unmount()
      wrapper = undefined
      expect(off).toHaveBeenCalledWith('select', expect.any(Function))
    })
  })
})

describe('AbstractEditorView (what the editor pages share)', () => {
  let loading
  // the mixin has no template: a host that uses it the way the editor does
  const host = (props = {}) => {
    wrapper = mountComponent({
      mixins: [AbstractEditorView],
      props: { resource: { type: Object, default: () => ({ title: 'articles' }) } },
      template: '<div />'
    }, { props, global: { mocks: { $loading: loading } } })
    return wrapper
  }

  beforeEach(() => {
    loading = { start: vi.fn(), stop: vi.fn() }
    RequestService.delete.mockReset().mockResolvedValue({})
    RequestService.put.mockReset().mockResolvedValue({})
    vi.spyOn(NotificationsService, 'send').mockImplementation(() => {})
  })

  describe('formatAttachments', () => {
    it('keeps only what the server needs', () => {
      host()
      expect(wrapper.vm.formatAttachments([{ _id: '1', _name: 'photo', order: 2, cropOptions: { x: 1 }, imageMap: { areas: [] }, url: '/x', file: {} }])).toEqual([{ _id: '1', _name: 'photo', order: 2, cropOptions: { x: 1 }, imageMap: { areas: [] } }])
    })

    it('keeps the fields it is told to', () => {
      host()
      expect(wrapper.vm.formatAttachments([{ _id: '1', _name: 'a' }], ['_id'])).toEqual([{ _id: '1' }])
    })
  })

  describe('uploadAttachments', () => {
    let upload
    beforeEach(() => {
      upload = vi.spyOn(UploadService, 'upload').mockResolvedValue(true)
    })
    const file = (name = 'a.png') => new File(['x'], name, { type: 'image/png' })

    it('sends each file to the attachments of the record, with what the server needs', async () => {
      host()
      await wrapper.vm.uploadAttachments('r1', [
        { field: 'photo', file: file('a.png'), _fields: { locale: 'zhCN' }, _filename: 'renamed.png', cropOptions: { x: 1 }, imageMap: { areas: [{ id: 'a', shape: 'rect', coords: [0, 0, 1, 1] }], updated: true }, orderUpdated: true, order: 2 }
      ])
      const [url, data, meta] = upload.mock.calls[0]
      expect(url).toBe('../api/articles/r1/attachments')
      expect(data.get('photo').name).toBe('a.png')
      expect(data.get('locale')).toBe('zhCN')
      expect(data.get('_filename')).toBe('renamed.png')
      expect(JSON.parse(data.get('cropOptions'))).toEqual({ x: 1 })
      expect(JSON.parse(data.get('imageMap')).areas[0].id).toBe('a')
      expect(data.get('order')).toBe('2')
      expect(meta).toMatchObject({ name: 'a.png', recordId: 'r1', resource: 'articles' })
    })

    it('leaves out the order unless it was changed', async () => {
      host()
      await wrapper.vm.uploadAttachments('r1', [{ field: 'photo', file: file(), order: 2 }])
      expect(upload.mock.calls[0][1].has('order')).toBe(false)
      expect(upload.mock.calls[0][1].has('locale')).toBe(false)
    })

    it('says how many failed, and goes on with the rest', async () => {
      upload.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      host()
      await wrapper.vm.uploadAttachments('r1', [{ field: 'a', file: file() }, { field: 'b', file: file() }])
      expect(upload).toHaveBeenCalledTimes(2)
      expect(NotificationsService.send.mock.calls[0][1]).toBe('error')
      expect(NotificationsService.send.mock.calls[0][0]).toContain('1 upload(s) failed')
      expect(loading.stop).toHaveBeenCalledWith('uploadAttachments')
    })

    it('says nothing when all went well', async () => {
      host()
      await wrapper.vm.uploadAttachments('r1', [{ field: 'a', file: file() }])
      expect(NotificationsService.send).not.toHaveBeenCalled()
    })
  })

  describe('removeAttachments', () => {
    it('asks the server to remove them by id', async () => {
      host()
      await wrapper.vm.removeAttachments('r1', [{ _id: 'x', _name: 'photo' }])
      expect(RequestService.delete).toHaveBeenCalledWith('../api/articles/r1/attachments', [{ _id: 'x' }])
      expect(loading.stop).toHaveBeenCalledWith('remove-attachments')
    })

    it('says when it fails, and gives the screen back', async () => {
      RequestService.delete.mockRejectedValue(new Error('no'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      host()
      await wrapper.vm.removeAttachments('r1', [{ _id: 'x' }])
      expect(loading.stop).toHaveBeenCalledWith('remove-attachments')
    })
  })

  describe('manageError', () => {
    it('says what kind of change failed', () => {
      host()
      wrapper.vm.manageError({ code: 500 }, 'delete', { _id: '1' })
      expect(NotificationsService.send).toHaveBeenCalledWith('Error on record delete', 'error', {})
    })

    it('adds the reason when the server gave one for a bad request', () => {
      host()
      wrapper.vm.manageError({ code: 400, message: 'Title is required' }, 'create')
      expect(NotificationsService.send.mock.calls[0][0]).toBe('Error on record creation: Title is required')
    })

    it('does not show the reason of other errors', () => {
      host()
      wrapper.vm.manageError({ code: 500, message: 'stack trace' }, 'update')
      expect(NotificationsService.send.mock.calls[0][0]).not.toContain('stack trace')
    })
  })

  describe('formatSchemaLayout', () => {
    const schema = (extra = {}) => ({ fields: [{ model: 'a' }, { model: 'b', originalModel: 'b' }, { model: 'c.enUS', originalModel: 'c' }], ...extra })

    it('leaves a schema without a layout alone', () => {
      host()
      const original = schema()
      expect(wrapper.vm.formatSchemaLayout(original)).toBe(original)
    })

    it('puts the schema of each field in its place', () => {
      host()
      const result = wrapper.vm.formatSchemaLayout(schema({ layout: { lines: [{ fields: [{ model: 'a' }, { model: 'b' }] }] } }))
      expect(result.layout.lines[0].fields.map((item) => item.schema.model)).toEqual(['a', 'b'])
      expect(result.layout.lines[0].slots).toBe(2)
    })

    it('finds a localised field by its original name', () => {
      host()
      const result = wrapper.vm.formatSchemaLayout(schema({ layout: { lines: [{ slots: 1, fields: [{ model: 'c' }] }] } }))
      expect(result.layout.lines[0].fields[0].schema.model).toBe('c.enUS')
    })

    it('puts the fields that the layout forgot at the end, and says so', () => {
      host()
      const result = wrapper.vm.formatSchemaLayout(schema({ layout: { lines: [{ fields: [{ model: 'a' }] }] } }))
      expect(result.layout.lines.slice(1).map((line) => line.fields[0].model)).toEqual(['b', 'c.enUS'])
      expect(console.warn).toHaveBeenCalledTimes(2)
    })

    it('puts a group of nested fields where the layout names it by its first part', () => {
      host()
      const group = { type: 'group', key: 'address', label: 'Address', groupOptions: { fields: [] } }
      const result = wrapper.vm.formatSchemaLayout({ fields: [{ model: 'a' }, group], layout: { lines: [{ slots: 2, fields: [{ model: 'address' }, { model: 'a' }] }] } })
      expect(result.layout.lines).toHaveLength(1)
      expect(result.layout.lines[0].fields.map((item) => item.schema)).toEqual([group, { model: 'a' }])
      expect(console.warn).not.toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
    })

    it('puts a group the layout forgot at the end, with its first part for its model, and says so', () => {
      host()
      const group = { type: 'group', key: 'address', label: 'Address', groupOptions: { fields: [] } }
      const result = wrapper.vm.formatSchemaLayout({ fields: [{ model: 'a' }, group], layout: { lines: [{ fields: [{ model: 'a' }] }] } })
      expect(result.layout.lines[1].fields).toEqual([{ model: 'address', schema: group }])
      expect(console.warn).toHaveBeenCalledTimes(1)
    })

    it('says when the layout names a field that does not exist', () => {
      host()
      wrapper.vm.formatSchemaLayout(schema({ layout: { lines: [{ fields: [{ model: 'ghost' }] }] } }))
      expect(console.error).toHaveBeenCalled()
    })
  })
})
