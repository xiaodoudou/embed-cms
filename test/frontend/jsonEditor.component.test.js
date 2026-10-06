import { describe, it, expect, afterEach, vi } from 'vitest'
import JsonEditor from '@c/fields/JsonEditor.vue'
import { mountField } from './helpers/mountField.js'

// The form is built by @json-editor/json-editor (with the `cms` theme of the component) from the JSON schema of the field.

const SETTINGS = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean', default: true },
    title: { type: 'string' },
    count: { type: 'integer', minimum: 0, maximum: 10, default: 1 },
    mode: { type: 'string', enum: ['fast', 'balanced', 'thorough'], default: 'balanced' }
  },
  required: ['title']
}
const ROWS = {
  type: 'array',
  format: 'table',
  items: { type: 'object', properties: { label: { type: 'string' }, amount: { type: 'number' } } }
}

let wrapper
const editor = async (jsonEditorOptions = SETTINGS, model = {}, schema = {}, props = {}) => {
  wrapper = mountField(JsonEditor, {
    model,
    schema: { model: 'settings', label: 'Settings', jsonEditorOptions: structuredClone(jsonEditorOptions), ...schema },
    props,
    attachTo: document.body
  })
  // the library builds the form, then says it is ready
  await vi.waitFor(() => expect(wrapper.vm.originalValue).not.toBe(null), { timeout: 3000 })
  return wrapper
}
const root = () => wrapper.get('.json-editor').element
const inputOf = (name) => root().querySelector(`[name="${wrapper.vm.inputId}[${name}]"]`)
const labels = () => [...root().querySelectorAll('.json-editor-input-label')].map((label) => label.textContent.trim())
const change = (input, value) => {
  input.value = value
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
const modalHost = () => wrapper.vm.modalHost
const openModal = () => modalHost().querySelector('.json-editor-modal:not([style*="display: none"])')
const button = (selector) => root().querySelector(selector)

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('JsonEditor (object and list fields)', () => {
  describe('the box', () => {
    it('shows the label, the required mark and the hint', async () => {
      await editor(SETTINGS, {}, { required: true, options: { hint: 'A form from a JSON schema' } })
      expect(wrapper.find('.field-label').text()).toContain('Settings')
      expect(wrapper.find('.required-mark').exists()).toBe(true)
      expect(wrapper.find('.help-block').text()).toBe('A form from a JSON schema')
    })
  })

  describe('an object', () => {
    it('builds a form from the schema, one labelled field per property', async () => {
      await editor()
      expect(labels()).toEqual(expect.arrayContaining(['enabled', 'title', 'count', 'mode']))
      expect(inputOf('title')).not.toBe(null)
      expect(inputOf('mode').tagName).toBe('SELECT')
      expect([...inputOf('mode').options].map((option) => option.value)).toEqual(['fast', 'balanced', 'thorough'])
    })

    it('puts the defaults of the schema in the record', async () => {
      const model = {}
      await editor(SETTINGS, model)
      await vi.waitFor(() => expect(model.settings).toBeTruthy())
      expect(model.settings).toMatchObject({ enabled: true, count: 1, mode: 'balanced' })
    })

    it('shows the values the record already has, and keeps the defaults for the rest', async () => {
      const model = { settings: { title: 'Hello', count: 4 } }
      await editor(SETTINGS, model)
      await vi.waitFor(() => expect(inputOf('title').value).toBe('Hello'))
      expect(inputOf('count').value).toBe('4')
      expect(inputOf('mode').value).toBe('balanced')
    })

    it('writes what is typed into the record', async () => {
      const model = {}
      await editor(SETTINGS, model)
      change(inputOf('title'), 'Typed title')
      await vi.waitFor(() => expect(model.settings.title).toBe('Typed title'))
    })

    it('writes a number as a number', async () => {
      const model = {}
      await editor(SETTINGS, model)
      change(inputOf('count'), '7')
      await vi.waitFor(() => expect(model.settings.count).toBe(7))
    })

    it('writes the choice made in a list', async () => {
      const model = {}
      await editor(SETTINGS, model)
      change(inputOf('mode'), 'thorough')
      await vi.waitFor(() => expect(model.settings.mode).toBe('thorough'))
    })

    it('still shows the values of the record when it is disabled (it used to fail to start at all)', async () => {
      const model = { settings: { title: 'Locked', count: 2 } }
      await editor(SETTINGS, model, {}, { disabled: true })
      await vi.waitFor(() => expect(inputOf('title').value).toBe('Locked'))
      expect(inputOf('count').value).toBe('2')
      expect(inputOf('title').disabled).toBe(true)
    })

    it('cannot be edited when disabled', async () => {
      await editor(SETTINGS, {}, {}, { disabled: true })
      expect(inputOf('title').disabled).toBe(true)
      expect(inputOf('mode').disabled).toBe(true)
    })
  })

  describe('a list', () => {
    it('starts empty, adds a row and reports it', async () => {
      const model = {}
      await editor(ROWS, model, { model: 'rows', label: 'Rows' })
      await vi.waitFor(() => expect(model.rows).toEqual([]))
      button('.json-editor-btntype-add').click()
      await vi.waitFor(() => expect(model.rows).toHaveLength(1))
    })

    it('shows the rows the record has', async () => {
      const model = { rows: [{ label: 'one', amount: 1 }, { label: 'two', amount: 2 }] }
      await editor(ROWS, model, { model: 'rows', label: 'Rows' })
      await vi.waitFor(() => expect(root().querySelectorAll('tbody tr').length).toBe(2))
    })

    it('removes the last row', async () => {
      const model = { rows: [{ label: 'one' }, { label: 'two' }] }
      await editor(ROWS, model, { model: 'rows', label: 'Rows' })
      await vi.waitFor(() => expect(root().querySelectorAll('tbody tr').length).toBe(2))
      button('.json-editor-btntype-deletelast').click()
      await vi.waitFor(() => expect(model.rows).toHaveLength(1))
    })
  })

  describe('the Object Properties pop-up', () => {
    const open = async (model = {}) => {
      await editor(SETTINGS, model)
      button('.json-editor-btntype-properties').click()
      await vi.waitFor(() => expect(openModal()).not.toBe(null))
      return openModal()
    }

    it('opens in front of the page, titled after its button, with a line saying what it does', async () => {
      const modal = await open()
      expect(modal.parentElement).toBe(modalHost())
      expect(modalHost().parentElement).toBe(document.body)
      expect(modal.dataset.title).toBe('Object Properties')
      expect(modal.querySelector('.je-modal-hint').textContent).toContain('Tick the properties to keep')
    })

    it('lists the properties as a checklist, with the required one locked', async () => {
      const modal = await open()
      const boxes = [...modal.querySelectorAll('.property-selector input[type=checkbox]')]
      expect(boxes).toHaveLength(4)
      const locked = boxes.filter((box) => box.disabled)
      expect(locked).toHaveLength(1)
      expect(locked[0].closest('label').textContent).toContain('title')
    })

    it('removes a property from the record when it is unticked', async () => {
      const model = {}
      const modal = await open(model)
      await vi.waitFor(() => expect(model.settings.count).toBe(1))
      const box = [...modal.querySelectorAll('.property-selector label')].find((label) => label.textContent.includes('count')).querySelector('input')
      box.click()
      await vi.waitFor(() => expect(model.settings.count).toBeUndefined())
    })

    it('adds a property typed by name', async () => {
      const model = {}
      const modal = await open(model)
      const input = modal.querySelector('.property-selector-input')
      input.value = 'note'
      modal.querySelector('.json-editor-btntype-add').click()
      await vi.waitFor(() => expect(labels().some((label) => label.includes('note'))).toBe(true))
    })

    it('has a Close button that closes it and puts it back in its place', async () => {
      const modal = await open()
      modal.querySelector('.je-modal-close').click()
      await vi.waitFor(() => expect(openModal()).toBe(null))
      expect(modal.parentElement).not.toBe(modalHost())
      expect(wrapper.get('.json-editor').element.contains(modal)).toBe(true)
    })

    it('closes with Escape', async () => {
      const modal = await open()
      modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await vi.waitFor(() => expect(openModal()).toBe(null))
    })

    it('closes when the page behind it is clicked, but not when the pop-up is', async () => {
      const modal = await open()
      modal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      expect(openModal()).not.toBe(null)
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await vi.waitFor(() => expect(openModal()).toBe(null))
    })

    it('puts its holder away with the field', async () => {
      await open()
      const host = modalHost()
      wrapper.unmount()
      wrapper = undefined
      expect(document.body.contains(host)).toBe(false)
    })
  })

  describe('the Edit JSON pop-up', () => {
    const open = async (model = {}) => {
      await editor(SETTINGS, model)
      button('.json-editor-btntype-editjson').click()
      await vi.waitFor(() => expect(openModal()).not.toBe(null))
      await vi.waitFor(() => expect(openModal().querySelector('.CodeMirror')).not.toBe(null))
      return openModal()
    }
    const codeOf = (modal) => modal.querySelector('.je-edit-json--textarea')._cm

    it('opens as a code editor holding the JSON of the form', async () => {
      const modal = await open({ settings: { title: 'Hello' } })
      expect(modal.dataset.title).toMatch(/json/i)
      expect(modal.parentElement).toBe(modalHost())
      const value = JSON.parse(codeOf(modal).getValue())
      expect(value.title).toBe('Hello')
    })

    it('updates the form and the record when the JSON is saved', async () => {
      const model = {}
      const modal = await open(model)
      codeOf(modal).setValue(JSON.stringify({ enabled: false, title: 'From the editor', count: 7, mode: 'fast' }))
      modal.querySelector('.json-editor-btntype-save').click()
      await vi.waitFor(() => expect(model.settings.title).toBe('From the editor'))
      expect(model.settings).toMatchObject({ enabled: false, count: 7, mode: 'fast' })
      expect(inputOf('title').value).toBe('From the editor')
      await vi.waitFor(() => expect(openModal()).toBe(null))
    })

    it('leaves the record alone on Cancel', async () => {
      const model = { settings: { title: 'Keep me' } }
      const modal = await open(model)
      await vi.waitFor(() => expect(inputOf('title').value).toBe('Keep me'))
      codeOf(modal).setValue(JSON.stringify({ title: 'Do not keep me' }))
      modal.querySelector('.json-editor-btntype-cancel').click()
      await vi.waitFor(() => expect(openModal()).toBe(null))
      expect(model.settings.title).toBe('Keep me')
    })

    it('closes with Escape', async () => {
      const modal = await open()
      modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await vi.waitFor(() => expect(openModal()).toBe(null))
    })
  })
  describe('the constraints of the JSON schema', () => {
    const verdict = async () => {
      const input = wrapper.findComponent({ name: 'VInput' })
      await input.vm.validate()
      await wrapper.vm.$nextTick()
      return input
    }

    it('block the save with a message, then follow the edits', async () => {
      await editor({ type: 'object', properties: { count: { type: 'integer', minimum: 5, default: 1 }, title: { type: 'string', minLength: 1 } } })
      expect(wrapper.vm.schemaRule()).toMatch(/count/)
      let input = await verdict()
      expect(input.classes()).toContain('v-input--error')
      expect(wrapper.find('.schema-validity .v-messages').text()).toMatch(/count/)
      change(inputOf('count'), '7')
      change(inputOf('title'), 'Hello')
      await vi.waitFor(() => expect(wrapper.vm.schemaRule()).toBe(true), { timeout: 3000 })
      input = await verdict()
      expect(input.classes()).not.toContain('v-input--error')
    })

    it('are not checked on a locked field', async () => {
      await editor({ type: 'object', properties: { count: { type: 'integer', minimum: 5, default: 1 } } }, {}, { readonly: true })
      expect(wrapper.vm.schemaRule()).toBe(true)
    })
  })
})
