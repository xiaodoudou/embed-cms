import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import DurationField from '@c/fields/DurationField.vue'
import { mountField, TranslateService } from './helpers/mountField.js'

// The duration field: one number box for each unit, kept as a number of seconds.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(DurationField, { model, schema: { model: 'length', label: 'Length', ...schema }, attachTo: document.body })
  return wrapper
}
const boxes = () => wrapper.findAll('input')
const values = () => boxes().map(box => box.element.value)
const type = async (index, text) => {
  boxes()[index].element.value = text
  await boxes()[index].trigger('input')
  await flushPromises()
}
const leave = async (index) => {
  await boxes()[index].trigger('blur')
  await flushPromises()
}

afterEach(() => wrapper?.unmount())

describe('DurationField', () => {
  describe('what it shows', () => {
    it('has a box for hours and one for minutes, with their names, the label and the hint', () => {
      mount({ options: { hint: 'How long it takes' } })
      expect(boxes()).toHaveLength(2)
      expect(wrapper.findAll('.duration-suffix').map(label => label.text())).toEqual(['hours', 'minutes'])
      expect(wrapper.text()).toContain('Length')
      expect(wrapper.get('.help-block').text()).toBe('How long it takes')
      expect(wrapper.get('[role=group]').attributes('aria-label')).toBe('Length')
    })

    it('shows a value in its units, the largest taking all it can hold', () => {
      mount({}, { length: 5400 })
      expect(values()).toEqual(['1', '30'])
      wrapper.unmount()
      mount({}, { length: 100 * 3600 })
      expect(values()).toEqual(['100', '0'])
    })

    it('shows nothing for no value, and 0 for a length of zero', () => {
      mount({}, {})
      expect(values()).toEqual(['', ''])
      wrapper.unmount()
      mount({}, { length: 0 })
      expect(values()).toEqual(['0', '0'])
    })

    it('shows the units the field says, from days to seconds', () => {
      mount({ options: { units: ['days', 'hours', 'minutes', 'seconds'] } }, { length: 90061 })
      expect(values()).toEqual(['1', '1', '1', '1'])
      expect(wrapper.findAll('.duration-suffix').map(label => label.text())).toEqual(['days', 'hours', 'minutes', 'seconds'])
    })

    it('shows a value in a single unit', () => {
      mount({ options: { units: ['minutes'] } }, { length: 5400 })
      expect(values()).toEqual(['90'])
    })

    it('marks a required field with a star', () => {
      mount({ required: true })
      expect(wrapper.find('.required-mark').exists()).toBe(true)
    })

    it('shows a value of another record when the record changes', async () => {
      const model = { length: 3600 }
      mount({}, model)
      expect(values()).toEqual(['1', '0'])
      await wrapper.setProps({ model: { length: 7260 } })
      expect(values()).toEqual(['2', '1'])
    })
  })

  describe('typing', () => {
    it('writes the seconds of what is typed, and tells the form', async () => {
      const model = {}
      mount({}, model)
      await type(0, '1')
      expect(model.length).toBe(3600)
      await type(1, '30')
      expect(model.length).toBe(5400)
      expect(wrapper.emitted('input').at(-1)).toEqual([5400, 'length'])
    })

    it('counts an empty box as nothing, and holds nothing when every box is empty', async () => {
      const model = { length: 5400 }
      mount({}, model)
      await type(1, '')
      expect(model.length).toBe(3600)
      await type(0, '')
      expect(model.length).toBeUndefined()
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'length'])
    })

    it('holds a length of zero when zero is typed', async () => {
      const model = {}
      mount({}, model)
      await type(0, '0')
      expect(model.length).toBe(0)
    })

    it('leaves what is typed alone while it is typed: more minutes than an hour holds', async () => {
      const model = {}
      mount({}, model)
      await type(1, '90')
      expect(model.length).toBe(5400)
      expect(values()).toEqual(['', '90'])
    })

    it('carries the lengths up when a box is left: 90 minutes are 1 hour 30', async () => {
      const model = {}
      mount({}, model)
      await type(1, '90')
      await leave(1)
      expect(values()).toEqual(['1', '30'])
      expect(model.length).toBe(5400)
    })

    it('does not carry up when there is no unit above', async () => {
      const model = {}
      mount({ options: { units: ['minutes'] } }, model)
      await type(0, '90')
      await leave(0)
      expect(values()).toEqual(['90'])
    })

    it('keeps whole seconds of what is typed with a fraction', async () => {
      const model = {}
      mount({ options: { units: ['minutes'] } }, model)
      await type(0, '1.5')
      expect(model.length).toBe(90)
    })

    it('holds nothing for what is not a length (a minus sign), and says so', async () => {
      const model = { length: 600 }
      mount({}, model)
      await type(1, '-5')
      expect(model.length).toBeUndefined()
      await leave(1)
      expect(wrapper.get('.duration-error').text()).toBe(TranslateService.get('TL_INVALID_DURATION'))
      expect(wrapper.get('.duration-error').attributes('role')).toBe('alert')
      await type(1, '5')
      expect(model.length).toBe(300)
      expect(wrapper.find('.duration-error').exists()).toBe(false)
    })

    it('does not write when it is read-only or disabled', async () => {
      const model = { length: 600 }
      mount({ readonly: true }, model)
      await type(1, '45')
      expect(model.length).toBe(600)
      wrapper.unmount()
      mount({ disabled: true }, model)
      expect(boxes().every(box => box.attributes('disabled') !== undefined)).toBe(true)
    })

    it('writes at the path of a locale', async () => {
      const model = { length: { enUS: 3600 } }
      mount({ model: 'length.enUS' }, model)
      expect(values()).toEqual(['1', '0'])
      await type(1, '15')
      expect(model.length.enUS).toBe(4500)
    })
  })

  describe('entering a box', () => {
    it('selects its number, so that typing replaces it', async () => {
      mount({}, { length: 3600 })
      const box = boxes()[1].element
      box.select = vi.fn()
      await boxes()[1].trigger('focus')
      expect(box.select).toHaveBeenCalledTimes(1)
    })
  })

  describe('the rules', () => {
    it('says what the value must be when the box is left: the least and the most', async () => {
      const model = {}
      mount({ min: 900, max: 7200 }, model)
      await type(1, '5')
      await leave(1)
      expect(wrapper.get('.duration-error').text()).toBe(TranslateService.get('TL_DURATION_TOO_SHORT', { min: '15m' }))
      await type(0, '3')
      await leave(0)
      expect(wrapper.get('.duration-error').text()).toBe(TranslateService.get('TL_DURATION_TOO_LONG', { max: '2h' }))
      await type(0, '1')
      expect(wrapper.find('.duration-error').exists()).toBe(false)
    })

    it('says a required length is missing when the form asks, and the hint comes back when it is given', async () => {
      const model = {}
      mount({ required: true, options: { hint: 'Needed' } }, model)
      expect(wrapper.vm.rule()).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
      await flushPromises()
      expect(wrapper.get('.duration-error').text()).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
      expect(wrapper.find('.help-block').exists()).toBe(false)
      await type(0, '1')
      await leave(0)
      expect(wrapper.vm.rule()).toBe(true)
      await flushPromises()
      expect(wrapper.find('.duration-error').exists()).toBe(false)
      expect(wrapper.find('.help-block').exists()).toBe(true)
    })

    it('has the rule on the first box only, and marks the boxes red when there is an error', async () => {
      mount({ max: 60 }, { length: 7200 })
      await leave(0)
      expect(wrapper.findAll('.v-input--error').length).toBeGreaterThan(0)
    })

    it('is valid with no length when it is not required', () => {
      mount({}, {})
      expect(wrapper.vm.rule()).toBe(true)
    })
  })

  describe('what the browser checks in DevTools Issues', () => {
    it('gives each box an id, a name and a label that is for it, with the id Vuetify points the box back to', () => {
      mount({ options: { units: ['days', 'hours', 'minutes'] } })
      for (const input of boxes()) {
        const element = input.element
        expect(element.id, 'an id').toBeTruthy()
        expect(element.getAttribute('name'), `${element.id} has a name`).toBeTruthy()
        const label = document.body.querySelector(`label[for="${element.id}"]`)
        expect(label, `${element.id} has a label for it`).not.toBe(null)
        expect(document.body.querySelector(`#${element.getAttribute('aria-labelledby')}`), `${element.id} labelled by something that exists`).toBe(label)
      }
      expect(wrapper.findAll('.v-field-label')).toHaveLength(0)
    })
  })
})

