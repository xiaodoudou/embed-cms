import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import Dayjs from 'dayjs'
import DateRangeField from '@c/fields/DateRangeField.vue'
import { mountField, TranslateService } from './helpers/mountField.js'

// The daterange field: a start and an end on one calendar, kept as { start, end }.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(DateRangeField, { model, schema: { model: 'stay', label: 'Stay', input: 'daterange', ...schema }, global: { components: { DatePicker: VueDatePicker } }, attachTo: document.body })
  return wrapper
}
const inner = () => wrapper.findComponent(VueDatePicker)
const input = () => wrapper.get('input.dp--input')
const day = (text) => Dayjs(text).startOf('day').valueOf()
const pick = async (value) => {
  inner().vm.$emit('update:model-value', value)
  await flushPromises()
}

afterEach(() => wrapper?.unmount())

describe('DateRangeField', () => {
  describe('what it shows', () => {
    it('has the label, a box that says how to write a range, and the hint', () => {
      mount({ options: { hint: 'Check in and out' } })
      expect(wrapper.text()).toContain('Stay')
      expect(input().attributes('placeholder')).toBe('YYYY/MM/DD – YYYY/MM/DD')
      expect(wrapper.get('.help-block').text()).toBe('Check in and out')
    })

    it('shows the two days of the range in the box', async () => {
      mount({}, { stay: { start: day('2026-10-01'), end: day('2026-10-05') } })
      await flushPromises()
      expect(input().element.value).toBe('2026/10/01 – 2026/10/05')
    })

    it('shows nothing for no value, and for a value that is not a range', () => {
      mount({}, {})
      expect(input().element.value).toBe('')
      wrapper.unmount()
      mount({}, { stay: { start: day('2026-10-01') } })
      expect(input().element.value).toBe('')
    })

    it('writes the time too when the field has one', async () => {
      mount({ options: { time: true } }, { stay: { start: Dayjs('2026-10-01 09:30').valueOf(), end: Dayjs('2026-10-01 17:00').valueOf() } })
      await flushPromises()
      expect(input().element.value).toBe('2026/10/01 09:30 – 2026/10/01 17:00')
      expect(inner().props('timeConfig')).toMatchObject({ enableTimePicker: true })
    })

    it('writes the days in the format the field gives', async () => {
      mount({ options: { format: 'DD.MM.YYYY' } }, { stay: { start: day('2026-10-01'), end: day('2026-10-05') } })
      await flushPromises()
      expect(input().element.value).toBe('01.10.2026 – 05.10.2026')
    })

    it('is a calendar of a range with no time by default, and two months side by side', () => {
      mount()
      expect(inner().props('range')).toMatchObject({ partialRange: false })
      expect(inner().props('timeConfig')).toMatchObject({ enableTimePicker: false })
      expect(inner().props('multiCalendars')).toBe(true)
    })

    it('marks a required field with a star', () => {
      mount({ required: true })
      expect(wrapper.find('.required-mark').exists()).toBe(true)
    })

    it('shows another range when the record changes', async () => {
      mount({}, { stay: { start: day('2026-10-01'), end: day('2026-10-05') } })
      await wrapper.setProps({ model: { stay: { start: day('2026-11-01'), end: day('2026-11-02') } } })
      expect(input().element.value).toBe('2026/11/01 – 2026/11/02')
    })
  })

  describe('picking', () => {
    it('writes the start and the end to the record, and tells the form', async () => {
      const model = {}
      mount({}, model)
      await pick([day('2026-10-01'), day('2026-10-05')])
      expect(model.stay).toEqual({ start: day('2026-10-01'), end: day('2026-10-05') })
      expect(wrapper.emitted('input')[0]).toEqual([{ start: day('2026-10-01'), end: day('2026-10-05') }, 'stay'])
    })

    it('puts the earlier moment first when the calendar gives them the other way round', async () => {
      const model = {}
      mount({}, model)
      await pick([day('2026-10-05'), day('2026-10-01')])
      expect(model.stay).toEqual({ start: day('2026-10-01'), end: day('2026-10-05') })
    })

    it('holds nothing when the range is cleared', async () => {
      const model = { stay: { start: day('2026-10-01'), end: day('2026-10-05') } }
      mount({}, model)
      await pick(null)
      expect(model.stay).toBeUndefined()
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'stay'])
      await pick([])
      expect(model.stay).toBeUndefined()
    })

    it('waits for the end: a start alone is not a range', async () => {
      const model = {}
      mount({}, model)
      await pick([day('2026-10-01')])
      expect(model.stay).toBeUndefined()
      expect(wrapper.emitted('input')).toBeUndefined()
      await pick([day('2026-10-01'), null])
      expect(wrapper.emitted('input')).toBeUndefined()
    })

    it('keeps the time of the moments picked, for a field with a time', async () => {
      const model = {}
      mount({ options: { time: true } }, model)
      const start = Dayjs('2026-10-01 09:30').valueOf()
      const end = Dayjs('2026-10-02 17:15').valueOf()
      await pick([start, end])
      expect(model.stay).toEqual({ start, end })
    })

    it('writes at the path of a locale', async () => {
      const model = { stay: { enUS: { start: day('2026-10-01'), end: day('2026-10-03') } } }
      mount({ model: 'stay.enUS' }, model)
      await flushPromises()
      expect(input().element.value).toBe('2026/10/01 – 2026/10/03')
      await pick([day('2026-10-02'), day('2026-10-04')])
      expect(model.stay.enUS).toEqual({ start: day('2026-10-02'), end: day('2026-10-04') })
    })

    it('does not write when it is read-only or disabled', async () => {
      const model = { stay: { start: day('2026-10-01'), end: day('2026-10-05') } }
      mount({ readonly: true }, model)
      await pick([day('2026-11-01'), day('2026-11-02')])
      expect(model.stay.start).toBe(day('2026-10-01'))
      wrapper.unmount()
      mount({ disabled: true }, model)
      expect(inner().props('disabled')).toBe(true)
    })
  })

  describe('the rules of the calendar', () => {
    it('gives it the first and the last day the field takes', () => {
      mount({ options: { minDate: '2026-10-05', maxDate: '2026-12-31' } })
      expect(inner().props('minDate')).toBe(day('2026-10-05'))
      expect(inner().props('maxDate')).toBe(day('2026-12-31'))
    })

    it('gives it the fewest and the most days, as the days between the first and the last', () => {
      mount({ options: { minDays: 2, maxDays: 7 } })
      expect(inner().props('range')).toMatchObject({ minRange: 1, maxRange: 6 })
    })

    it('does not limit the calendar when the field says nothing', () => {
      mount()
      expect(inner().props('minDate')).toBeUndefined()
      expect(inner().props('range').minRange).toBeUndefined()
    })
  })

  describe('a range the record holds that the field does not take', () => {
    it('says so under the box, in place of the hint', async () => {
      mount({ options: { minDays: 3, hint: 'Check in and out' } }, { stay: { start: day('2026-10-01'), end: day('2026-10-02') } })
      await flushPromises()
      expect(wrapper.get('.daterange-error').text()).toBe(TranslateService.get('TL_DATE_RANGE_TOO_SHORT', { min: 3 }))
      expect(wrapper.get('.daterange-error').attributes('role')).toBe('alert')
      expect(wrapper.find('.help-block').exists()).toBe(false)
    })

    it('says so for an end before the start, and for a value that is not a range', () => {
      mount({}, { stay: { start: day('2026-10-05'), end: day('2026-10-01') } })
      expect(wrapper.get('.daterange-error').text()).toBe(TranslateService.get('TL_DATE_RANGE_ORDER'))
      wrapper.unmount()
      mount({}, { stay: { start: day('2026-10-05') } })
      expect(wrapper.get('.daterange-error').text()).toBe(TranslateService.get('TL_INVALID_DATE_RANGE'))
    })

    it('says nothing for a range that is fine, or for no range', () => {
      mount({ options: { minDays: 2 } }, { stay: { start: day('2026-10-01'), end: day('2026-10-02') } })
      expect(wrapper.find('.daterange-error').exists()).toBe(false)
      wrapper.unmount()
      mount({ required: true }, {})
      expect(wrapper.find('.daterange-error').exists()).toBe(false)
    })
  })
})
