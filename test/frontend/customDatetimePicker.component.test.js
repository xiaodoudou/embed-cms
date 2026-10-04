import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import Dayjs from 'dayjs'
import CustomDatetimePicker from '@c/fields/CustomDatetimePicker.vue'
import { mountField } from './helpers/mountField.js'
import TranslateService from '@s/TranslateService'

// The three kinds of schema FormService prepares for the input types date, time and datetime (see src/services/FormService.js).
const KINDS = {
  date: { input: 'date', format: 'YYYY-MM-DD', placeholder: 'YYYY-MM-DD' },
  time: { input: 'time', format: 'HH:mm:ss', placeholder: 'HH:mm:ss' },
  datetime: { input: 'datetime', format: 'YYYY-MM-DD HH:mm:ss', placeholder: 'YYYY-MM-DD HH:mm:ss' }
}

let wrapper
const picker = (kind = 'date', model = {}, schema = {}, props = {}) => {
  const { input, format, placeholder } = KINDS[kind]
  wrapper = mountField(CustomDatetimePicker, {
    model,
    schema: {
      model: 'when',
      originalModel: 'when',
      label: 'When',
      locale: 'enUS',
      format,
      customDatetimePickerOptions: { placeholder },
      resource: { schema: [{ field: 'when', input }] },
      ...schema
    },
    props,
    global: { components: { DatePicker: VueDatePicker } },
    attachTo: document.body
  })
  return wrapper
}
const inner = () => wrapper.findComponent(VueDatePicker)
const input = () => wrapper.get('input.dp--input')
// 2026-10-01 14:30:15 in the local time zone, as the pickers work in local time
const LOCAL = new Date(2026, 9, 1, 14, 30, 15).getTime()

afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('CustomDatetimePicker (date, time and datetime)', () => {
  describe('the box', () => {
    it('shows the label, the required mark and the hint', () => {
      picker('date', {}, { required: true, options: { hint: 'Calendar date' } })
      expect(wrapper.find('.field-label').text()).toContain('When')
      expect(wrapper.find('.required-mark').exists()).toBe(true)
      expect(wrapper.find('.help-block').text()).toBe('Calendar date')
    })

    it.each(Object.keys(KINDS))('shows the placeholder of a %s field', (kind) => {
      picker(kind)
      expect(input().attributes('placeholder')).toBe(KINDS[kind].placeholder)
    })

    it('falls back to the date placeholder, and says so, when the schema has none', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      picker('date', {}, { customDatetimePickerOptions: {} })
      expect(input().attributes('placeholder')).toBe('YYYY-MM-DD')
      expect(warn).toHaveBeenCalled()
    })
  })

  describe('what each kind offers', () => {
    it('a date field picks a day, without a time', () => {
      picker('date')
      expect(inner().props('timePicker')).toBe(false)
      expect(inner().props('timeConfig')).toMatchObject({ enableTimePicker: false, timePickerInline: false })
      expect(wrapper.vm.enableDatePicker).toBe(true)
      expect(wrapper.get('.date-now').text()).toBe('Today')
    })

    it('a time field picks a time, without a calendar', () => {
      picker('time')
      expect(inner().props('timePicker')).toBe(true)
      expect(inner().props('timeConfig')).toMatchObject({ enableTimePicker: true })
      expect(wrapper.vm.enableDatePicker).toBe(false)
      expect(wrapper.find('.date-now').exists()).toBe(true)
    })

    it('a datetime field picks a day and a time together', () => {
      picker('datetime')
      expect(inner().props('timePicker')).toBe(false)
      expect(inner().props('timeConfig')).toMatchObject({ enableTimePicker: true, timePickerInline: true })
      expect(wrapper.vm.enableDatePicker).toBe(true)
      expect(wrapper.find('.date-now').exists()).toBe(true)
    })

    it('offers minutes and seconds only when the format shows them', () => {
      picker('datetime')
      expect(inner().props('timeConfig')).toMatchObject({ enableMinutes: true, enableSeconds: true })
      wrapper.unmount()
      picker('datetime', {}, { format: 'YYYY-MM-DD HH:mm' })
      expect(inner().props('timeConfig')).toMatchObject({ enableMinutes: true, enableSeconds: false })
    })

    it('takes its format from the schema, and has one to fall back to', () => {
      picker('date')
      expect(wrapper.vm.schema.format).toBe('YYYY-MM-DD')
      wrapper.unmount()
      picker('date', {}, { format: undefined })
      expect(wrapper.vm.schema.format).toEqual(expect.any(String))
      expect(wrapper.vm.schema.format.length).toBeGreaterThan(0)
    })

    it('parses typed text with the format of the schema, written the way the picker wants it', () => {
      picker('datetime')
      expect(inner().props('textInput')).toMatchObject({ format: 'yyyy-MM-dd HH:mm:ss', enterSubmit: true, tabSubmit: true })
    })

    it('speaks the language of the person, not the language of the field they edit', () => {
      const original = TranslateService.locale
      try {
        TranslateService.setLocale('enUS')
        picker('date', {}, { locale: 'zhCN' })
        expect(inner().props('locale').code).toBe('en-US')
        wrapper.unmount()
        TranslateService.setLocale('zhCN')
        picker('date', {}, { locale: 'enUS' })
        expect(inner().props('locale').code).toBe('zh-CN')
      } finally {
        TranslateService.setLocale(original)
      }
    })

    it('follows the dark theme', () => {
      picker('date', {}, {}, { theme: 'dark' })
      expect(inner().props('dark')).toBe(true)
    })
  })

  describe('the value', () => {
    it('shows the stored timestamp in the format of the field', async () => {
      picker('datetime', { when: LOCAL })
      await flushPromises()
      expect(input().element.value).toBe('2026-10-01 14:30:15')
    })

    it('shows a date without its time', async () => {
      picker('date', { when: LOCAL })
      await flushPromises()
      expect(input().element.value).toBe('2026-10-01')
    })

    it('shows a time without its date', async () => {
      picker('time', { when: LOCAL })
      await flushPromises()
      expect(input().element.value).toBe('14:30:15')
    })

    it('stays empty while the record has no value', async () => {
      picker('date')
      await flushPromises()
      expect(input().element.value).toBe('')
    })

    it('writes the timestamp the person picks into the record, with its path', async () => {
      const model = {}
      picker('datetime', model)
      inner().vm.$emit('update:modelValue', LOCAL)
      await flushPromises()
      expect(model.when).toBe(LOCAL)
      expect(wrapper.emitted('input')[0]).toEqual([LOCAL, 'when'])
    })

    it('writes nothing when the value is cleared, and the record loses it', async () => {
      const model = { when: LOCAL }
      picker('date', model)
      inner().vm.$emit('update:modelValue', null)
      await flushPromises()
      expect(model.when).toBe(null)
    })

    it('can be cleared by the person while it is editable', () => {
      picker('date')
      expect(inner().props('inputAttrs').clearable).toBe(true)
    })

    it('formats the picked date for the field with the schema format', () => {
      picker('datetime')
      expect(wrapper.vm.formatDateSelection(new Date(2026, 0, 5, 9, 4, 3))).toBe('2026-01-05 09:04:03')
    })
  })

  describe('the Now button', () => {
    it('sets the current moment', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(LOCAL)
      const model = {}
      picker('datetime', model)
      await wrapper.get('.date-now').trigger('click')
      expect(model.when).toBe(LOCAL)
    })

    it('is Today on a date field, and sets the start of the day, as picking the day in the calendar does', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(LOCAL)
      const model = {}
      picker('date', model)
      expect(wrapper.get('.date-now').text()).toBe('Today')
      await wrapper.get('.date-now').trigger('click')
      expect(model.when).toBe(new Date(new Date(LOCAL).setHours(0, 0, 0, 0)).getTime())
      expect(new Date(model.when).getHours()).toBe(0)
    })

    it('is not offered on a locked field', () => {
      picker('datetime', {}, { readonly: true })
      expect(wrapper.find('.date-now').exists()).toBe(false)
      wrapper.unmount()
      picker('datetime', {}, { disabled: true })
      expect(wrapper.find('.date-now').exists()).toBe(false)
    })
  })

  describe('locked fields', () => {
    it('a read-only field shows its value, says it is locked and cannot be cleared', async () => {
      picker('datetime', { when: LOCAL }, { readonly: true })
      await flushPromises()
      expect(wrapper.classes()).toContain('is-readonly')
      expect(wrapper.find('.cms-field-readonly').exists()).toBe(true)
      expect(inner().props('readonly')).toBe(true)
      expect(inner().props('inputAttrs').clearable).toBe(false)
      expect(input().element.value).toBe('2026-10-01 14:30:15')
    })

    it('a disabled field is greyed out, with no icon', () => {
      picker('date', {}, { disabled: true })
      expect(wrapper.classes()).toContain('is-disabled')
      expect(inner().props('disabled')).toBe(true)
      expect(inner().props('inputAttrs').clearable).toBe(false)
      expect(wrapper.find('.cms-field-readonly').exists()).toBe(false)
    })

    it('a field disabled by its parent is disabled too', () => {
      picker('date', {}, {}, { disabled: true })
      expect(inner().props('disabled')).toBe(true)
    })
  })

  describe('marking tomorrow in the calendar', () => {
    it('marks tomorrow and nothing else', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 1, 10, 0, 0))
      picker('date')
      expect(wrapper.vm.getDayClass(new Date(2026, 9, 2, 3, 0, 0))).toBe('marked-cell')
      expect(wrapper.vm.getDayClass(new Date(2026, 9, 1))).toBe('')
      expect(wrapper.vm.getDayClass(new Date(2026, 9, 3))).toBe('')
      expect(Dayjs(new Date(2026, 9, 2)).isValid()).toBe(true)
    })
  })

  describe('a field the resource does not list', () => {
    it('takes its kind from the input the schema names (a field inside a block of a blocks field)', () => {
      picker('datetime', {}, { originalModel: 'inside_a_block', input: 'datetime', resource: { schema: [] } })
      expect(wrapper.vm.fieldType).toBe('datetime')
      expect(inner().props('timeConfig')).toMatchObject({ enableTimePicker: true, timePickerInline: true })
    })

    it('prefers the input the schema names to the lookup in the resource', () => {
      picker('date', {}, { input: 'time' })
      expect(wrapper.vm.fieldType).toBe('time')
    })

    it('shows a date, and says which field it could not find, when nothing names its kind', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      picker('date', {}, { originalModel: 'missing' })
      expect(wrapper.vm.fieldType).toBe('date')
      expect(inner().props('timeConfig').enableTimePicker).toBe(false)
      expect(error.mock.calls[0][0]).toContain('missing')
    })
  })
})
