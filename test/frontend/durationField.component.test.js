import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import DurationField from '@c/fields/DurationField.vue'
import { mountField, TranslateService } from './helpers/mountField.js'

// The duration field: one box, a length written the way people write it, kept as a number of seconds.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(DurationField, { model, schema: { model: 'length', label: 'Length', ...schema }, attachTo: document.body })
  return wrapper
}
const box = () => wrapper.get('input')
const value = () => box().element.value
const type = async (text) => {
  box().element.value = text
  await box().trigger('input')
  await flushPromises()
}
const leave = async () => {
  await box().trigger('focus')
  await box().trigger('blur')
  await flushPromises()
}
const messages = () => wrapper.findAll('.v-messages__message').map(message => message.text())

afterEach(() => wrapper?.unmount())

describe('DurationField', () => {
  describe('what it shows', () => {
    it('has one box with the label and the hint, and shows how to write a length while it is empty', () => {
      mount({ options: { hint: 'How long it takes' } })
      expect(wrapper.findAll('input')).toHaveLength(1)
      expect(wrapper.text()).toContain('Length')
      expect(wrapper.get('.help-block').text()).toBe('How long it takes')
      expect(box().attributes('placeholder')).toBe('h:mm')
    })

    it('shows how to write a length in the units of the field', () => {
      mount({ options: { units: ['hours', 'minutes', 'seconds'] } })
      expect(box().attributes('placeholder')).toBe('h:mm:ss')
      wrapper.unmount()
      mount({ options: { units: ['days', 'hours'] } })
      expect(box().attributes('placeholder')).toBe('0d 0h')
    })

    it('shows a value as a clock for hours and minutes', () => {
      mount({}, { length: 5400 })
      expect(value()).toBe('1:30')
      wrapper.unmount()
      mount({}, { length: 100 * 3600 })
      expect(value()).toBe('100:00')
    })

    it('shows a value in letters for days, or for one unit', () => {
      mount({ options: { units: ['days', 'hours', 'minutes', 'seconds'] } }, { length: 90061 })
      expect(value()).toBe('1d 1h 1m 1s')
      wrapper.unmount()
      mount({ options: { units: ['minutes'] } }, { length: 5400 })
      expect(value()).toBe('90m')
    })

    it('shows nothing for no value, and 0:00 for a length of zero', () => {
      mount({}, {})
      expect(value()).toBe('')
      wrapper.unmount()
      mount({}, { length: 0 })
      expect(value()).toBe('0:00')
    })

    it('has a real label that is for the box, with the id Vuetify points the box back to', () => {
      mount({})
      const id = box().attributes('id')
      expect(id).toBeTruthy()
      expect(box().attributes('name')).toBe('length')
      expect(wrapper.get(`label[for="${id}"]`).text()).toContain('Length')
      expect(box().attributes('aria-labelledby')).toBe(`${id}-label`)
    })

    it('marks a required field with a star', () => {
      mount({ required: true })
      expect(wrapper.find('.required-mark').exists()).toBe(true)
    })

    it('shows a value of another record when the record changes', async () => {
      mount({}, { length: 3600 })
      expect(value()).toBe('1:00')
      await wrapper.setProps({ model: { length: 7260 } })
      expect(value()).toBe('2:01')
    })
  })

  describe('typing', () => {
    it('writes the seconds of what is typed, in any of the ways to write a length, and tells the form', async () => {
      const model = {}
      mount({}, model)
      await type('1:30')
      expect(model.length).toBe(5400)
      expect(wrapper.emitted('input').at(-1)).toEqual([5400, 'length'])
      await type('2h 15m')
      expect(model.length).toBe(8100)
      await type('45')
      expect(model.length).toBe(2700)
      await type('1.5h')
      expect(model.length).toBe(5400)
    })

    it('holds nothing when the box is empty, and a length of zero when zero is typed', async () => {
      const model = { length: 5400 }
      mount({}, model)
      await type('')
      expect(model.length).toBeUndefined()
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'length'])
      await type('0')
      expect(model.length).toBe(0)
    })

    it('leaves what is typed alone while it is typed', async () => {
      const model = {}
      mount({}, model)
      await type('90')
      expect(model.length).toBe(5400)
      expect(value()).toBe('90')
    })

    it('writes the length in the form of the field when the box is left: 90 minutes are 1:30', async () => {
      const model = {}
      mount({}, model)
      await type('90')
      await leave()
      expect(value()).toBe('1:30')
      expect(model.length).toBe(5400)
      await type('2h')
      await leave()
      expect(value()).toBe('2:00')
    })

    it('rounds to the smallest unit of the field, in the value and in the box', async () => {
      const model = {}
      mount({}, model)
      await type('1h 30s')
      expect(model.length).toBe(3660)
      await leave()
      expect(value()).toBe('1:01')
    })

    it('holds nothing for what is not a length, says so when the box is left, and keeps the text so that it can be corrected', async () => {
      const model = { length: 600 }
      mount({}, model)
      await type('soon')
      expect(model.length).toBeUndefined()
      await leave()
      expect(messages()).toEqual([TranslateService.get('TL_INVALID_DURATION')])
      expect(value()).toBe('soon')
      await type('5m')
      expect(model.length).toBe(300)
      await leave()
      expect(messages()).toEqual([])
    })

    it('does not write when it is read-only or disabled', async () => {
      const model = { length: 600 }
      mount({ readonly: true }, model)
      await type('45')
      expect(model.length).toBe(600)
      wrapper.unmount()
      mount({ disabled: true }, model)
      expect(box().attributes('disabled')).toBeDefined()
    })

    it('writes at the path of a locale', async () => {
      const model = { length: { enUS: 3600 } }
      mount({ model: 'length.enUS' }, model)
      expect(value()).toBe('1:00')
      await type('1:15')
      expect(model.length.enUS).toBe(4500)
    })
  })

  describe('entering the box', () => {
    it('selects its text, so that typing replaces it', async () => {
      mount({}, { length: 3600 })
      box().element.select = vi.fn()
      await box().trigger('focus')
      expect(box().element.select).toHaveBeenCalledTimes(1)
    })
  })

  describe('the rules', () => {
    it('says what the value must be when the box is left: the least and the most', async () => {
      const model = {}
      mount({ min: 900, max: 7200 }, model)
      await type('5m')
      await leave()
      expect(messages()).toEqual([TranslateService.get('TL_DURATION_TOO_SHORT', { min: '15m' })])
      await type('3h')
      await leave()
      expect(messages()).toEqual([TranslateService.get('TL_DURATION_TOO_LONG', { max: '2h' })])
      await type('1h')
      await leave()
      expect(messages()).toEqual([])
    })

    it('refuses a required length that is missing when the form asks, and is not red before anyone has touched it', async () => {
      mount({ required: true, options: { hint: 'Needed' } }, {})
      await flushPromises()
      expect(wrapper.find('.v-input--error').exists()).toBe(false)
      expect(wrapper.get('.help-block').text()).toBe('Needed')
      expect(wrapper.vm.rule()).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
      await type('1:00')
      expect(wrapper.vm.rule()).toBe(true)
      await type('0')
      expect(wrapper.vm.rule()).toBe(true)
    })

    it('is valid with no length when it is not required', () => {
      mount({}, {})
      expect(wrapper.vm.rule()).toBe(true)
    })
  })
})
