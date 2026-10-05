import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ChoiceField from '@c/fields/ChoiceField.vue'
import { mountField } from './helpers/mountField.js'

// The radio and segmented fields: one value chosen from a short list that is all in view.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(ChoiceField, { model, schema: { model: 'status', label: 'Status', input: 'segmented', source: ['draft', 'review', 'published'], ...schema }, attachTo: document.body })
  return wrapper
}
const radios = () => wrapper.findAll('input[type=radio]')
const radio = (value) => radios().find(input => input.element.value === String(value))
const checked = () => radios().filter(input => input.element.checked).map(input => input.element.value)
const choose = async (value) => {
  await radio(value).trigger('click')
  await flushPromises()
}

afterEach(() => wrapper?.unmount())

describe('ChoiceField', () => {
  describe('what it shows', () => {
    it('has a button for each choice, in a group named by the label, with the hint', () => {
      mount({ options: { hint: 'Where it is in the process' } })
      expect(radios().map(input => input.element.value)).toEqual(['draft', 'review', 'published'])
      const group = wrapper.get('[role=radiogroup]')
      expect(group.attributes('aria-label')).toBe('Status')
      expect(wrapper.text()).toContain('Status')
      expect(wrapper.get('.help-block').text()).toBe('Where it is in the process')
    })

    it('draws joined buttons for segmented and circles for radio', () => {
      mount({ input: 'segmented' })
      expect(wrapper.classes()).toContain('is-segmented')
      expect(wrapper.find('.choice-mark').exists()).toBe(false)
      wrapper.unmount()
      mount({ input: 'radio' })
      expect(wrapper.classes()).toContain('is-radio')
      expect(wrapper.findAll('.choice-mark')).toHaveLength(3)
    })

    it('says the label of each choice', () => {
      mount({ options: { labels: { draft: 'Draft', review: { enUS: 'In review', zhCN: '审核中' } } } })
      expect(wrapper.findAll('.choice-label').map(label => label.text())).toEqual(['Draft', 'In review', 'published'])
    })

    it('says the labels in the language of the field', () => {
      mount({ locale: 'zhCN', options: { labels: { review: { enUS: 'In review', zhCN: '审核中' } } } })
      expect(wrapper.findAll('.choice-label')[1].text()).toBe('审核中')
    })

    it('has the chosen value pressed, and only that one', () => {
      mount({}, { status: 'review' })
      expect(checked()).toEqual(['review'])
      expect(wrapper.findAll('.choice-item.is-selected')).toHaveLength(1)
      expect(wrapper.get('.choice-item.is-selected').text()).toBe('review')
    })

    it('has none pressed for no value, and for a value that is not one of the choices', () => {
      mount({}, {})
      expect(checked()).toEqual([])
      wrapper.unmount()
      mount({}, { status: 'gone' })
      expect(checked()).toEqual([])
    })

    it('shows the value of another record when the record changes', async () => {
      mount({}, { status: 'draft' })
      await wrapper.setProps({ model: { status: 'published' } })
      expect(checked()).toEqual(['published'])
      await wrapper.setProps({ model: {} })
      expect(checked()).toEqual([])
    })

    it('marks a required field with a star', () => {
      mount({ required: true })
      expect(wrapper.find('.required-mark').exists()).toBe(true)
      expect(wrapper.get('[role=radiogroup]').attributes('aria-required')).toBe('true')
    })

    it('puts the radio buttons of a field in one group, apart from the ones of another field', () => {
      mount({})
      const first = radios().map(input => input.attributes('name'))
      expect(new Set(first).size).toBe(1)
      const other = mountField(ChoiceField, { model: {}, schema: { model: 'size', label: 'Size', input: 'radio', source: ['S', 'M'] }, attachTo: document.body })
      expect(other.get('input[type=radio]').attributes('name')).not.toBe(first[0])
      other.unmount()
    })
  })

  describe('descriptions', () => {
    const options = { descriptions: { draft: 'Not seen by anyone', review: { enUS: 'Waiting for a second pair of eyes', zhCN: '等待复核' } } }

    it('writes a line under the label of a radio button, which the button points at', () => {
      mount({ input: 'radio', options })
      const lines = wrapper.findAll('.choice-description')
      expect(lines.map(line => line.text())).toEqual(['Not seen by anyone', 'Waiting for a second pair of eyes'])
      expect(radio('draft').attributes('aria-describedby')).toBe(lines[0].attributes('id'))
      expect(radio('published').attributes('aria-describedby')).toBeUndefined()
    })

    it('puts it in the tooltip of a segmented button instead', () => {
      mount({ input: 'segmented', options })
      expect(wrapper.find('.choice-description').exists()).toBe(false)
      expect(wrapper.findAll('.choice-item')[0].attributes('title')).toBe('Not seen by anyone')
      expect(wrapper.findAll('.choice-item')[2].attributes('title')).toBeUndefined()
    })
  })

  describe('layout', () => {
    it('is a column of radio buttons, or a row with inline', () => {
      mount({ input: 'radio' })
      expect(wrapper.classes()).not.toContain('is-inline')
      wrapper.unmount()
      mount({ input: 'radio', options: { inline: true } })
      expect(wrapper.classes()).toContain('is-inline')
    })

    it('has no row of circles for segmented', () => {
      mount({ input: 'segmented', options: { inline: true } })
      expect(wrapper.classes()).not.toContain('is-inline')
    })
  })

  describe('choosing', () => {
    it('writes the value to the record, and tells the form', async () => {
      const model = {}
      mount({}, model)
      await choose('review')
      expect(model.status).toBe('review')
      expect(wrapper.emitted('input').at(-1)).toEqual(['review', 'status'])
      expect(checked()).toEqual(['review'])
    })

    it('moves the choice to another', async () => {
      const model = { status: 'draft' }
      mount({}, model)
      await choose('published')
      expect(model.status).toBe('published')
      expect(checked()).toEqual(['published'])
    })

    it('keeps a number a number', async () => {
      const model = {}
      mount({ model: 'columns', source: [1, 2, 3] }, model)
      await choose(2)
      expect(model.columns).toBe(2)
      expect(wrapper.emitted('input').at(-1)).toEqual([2, 'columns'])
    })

    it('chooses a choice that is written { value, text }', async () => {
      const model = {}
      mount({ source: [{ value: 'a', text: 'Alpha' }, { value: 'b', text: 'Beta' }] }, model)
      await choose('b')
      expect(model.status).toBe('b')
    })
  })

  describe('taking the choice away', () => {
    it('is done by pressing the chosen one again', async () => {
      const model = { status: 'review' }
      mount({}, model)
      await choose('review')
      expect(model.status).toBeUndefined()
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'status'])
      expect(checked()).toEqual([])
    })

    it('is done by Delete or Backspace', async () => {
      const model = { status: 'review' }
      mount({}, model)
      await radio('review').trigger('keydown', { key: 'Delete' })
      expect(model.status).toBeUndefined()
      expect(checked()).toEqual([])
      model.status = 'draft'
      await wrapper.setProps({ model: { status: 'draft' } })
      await radio('draft').trigger('keydown', { key: 'Backspace' })
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'status'])
    })

    it('leaves other keys alone', async () => {
      const model = { status: 'review' }
      mount({}, model)
      await radio('review').trigger('keydown', { key: 'a' })
      await radio('review').trigger('keydown', { key: 'ArrowRight' })
      expect(model.status).toBe('review')
    })

    it('is not done for a field that is required', async () => {
      const model = { status: 'review' }
      mount({ required: true }, model)
      await choose('review')
      expect(model.status).toBe('review')
      await radio('review').trigger('keydown', { key: 'Delete' })
      expect(model.status).toBe('review')
    })

    it('is not done for a field that says clearable: false', async () => {
      const model = { status: 'review' }
      mount({ options: { clearable: false } }, model)
      await choose('review')
      expect(model.status).toBe('review')
    })

    it('has nothing to take away when nothing is chosen', async () => {
      const model = {}
      mount({}, model)
      await radio('draft').trigger('keydown', { key: 'Delete' })
      expect(wrapper.emitted('input')).toBeUndefined()
    })
  })

  describe('read-only and disabled', () => {
    it('shows the choice and does not change it', async () => {
      const model = { status: 'review' }
      mount({ readonly: true }, model)
      expect(checked()).toEqual(['review'])
      expect(wrapper.classes()).toContain('is-readonly')
      expect(radio('review').attributes('aria-readonly')).toBe('true')
      await choose('draft')
      await choose('review')
      await radio('review').trigger('keydown', { key: 'Delete' })
      expect(model.status).toBe('review')
      expect(wrapper.emitted('input')).toBeUndefined()
      expect(checked()).toEqual(['review'])
    })

    it('greys it out, and the buttons cannot be reached', () => {
      mount({ disabled: true }, { status: 'review' })
      expect(wrapper.classes()).toContain('is-disabled')
      expect(radios().every(input => input.attributes('disabled') !== undefined)).toBe(true)
      expect(wrapper.get('[role=radiogroup]').attributes('aria-disabled')).toBe('true')
    })
  })
})
