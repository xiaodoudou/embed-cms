import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import PhoneField from '@c/fields/PhoneField.vue'
import { mountField, TranslateService } from './helpers/mountField.js'

// The phone field: a country and the national number, kept in the international form.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(PhoneField, { model, schema: { model: 'phone', label: 'Phone', ...schema }, attachTo: document.body })
  return wrapper
}
const box = () => wrapper.get('input[id$="-number"]')
const list = () => wrapper.findComponent({ name: 'VAutocomplete' })
const type = async (text) => {
  box().element.value = text
  await box().trigger('input')
  await flushPromises()
}
const leave = async () => {
  await box().trigger('blur')
  await flushPromises()
}
const choose = async (iso) => {
  list().vm.$emit('update:modelValue', iso)
  await flushPromises()
}

afterEach(() => wrapper?.unmount())

describe('PhoneField', () => {
  describe('what it shows', () => {
    it('has a list of countries and a box for the number, with the label and the hint', () => {
      mount({ options: { hint: 'How to call' } })
      expect(wrapper.text()).toContain('Phone')
      expect(list().exists()).toBe(true)
      expect(list().props('modelValue')).toBe('US')
      expect(box().attributes('type')).toBe('tel')
      expect(wrapper.get('.help-block').text()).toBe('How to call')
    })

    it('offers the countries with their names and calling codes, by name', () => {
      mount()
      const items = list().props('items')
      expect(items.length).toBeGreaterThan(230)
      expect(items.find(item => item.value === 'FR')).toMatchObject({ name: 'France', code: '+33', title: 'France +33' })
      const names = items.map(item => item.name)
      expect(names.indexOf('Albania')).toBeLessThan(names.indexOf('Zimbabwe'))
    })

    it('offers the countries of the field in the order it lists them, and starts with the first', () => {
      mount({ options: { countries: ['FR', 'DE', 'BE'] } })
      expect(list().props('items').map(item => item.value)).toEqual(['FR', 'DE', 'BE'])
      expect(list().props('modelValue')).toBe('FR')
    })

    it('does not offer a choice when the field takes one country', () => {
      mount({ options: { countries: ['FR'] } })
      expect(list().props('readonly')).toBe(true)
    })

    it('shows a value as the country and the national number in groups', () => {
      mount({}, { phone: '+442071838750' })
      expect(list().props('modelValue')).toBe('GB')
      expect(box().element.value).toBe('207 183 8750')
    })

    it('shows nothing for no value', () => {
      mount({}, {})
      expect(box().element.value).toBe('')
    })

    it('has real labels: the number is the one of the field, the list has its own', () => {
      mount({})
      const number = box().attributes('id')
      expect(wrapper.get(`label[for="${number}"]`).text()).toContain('Phone')
      expect(wrapper.get(`label[for="${list().props('id')}"]`).text()).toBe('Country')
    })

    it('marks a required field with a star', () => {
      mount({ required: true })
      expect(wrapper.find('.required-mark').exists()).toBe(true)
    })

    it('shows a value of another record when the record changes', async () => {
      mount({}, { phone: '+442071838750' })
      await wrapper.setProps({ model: { phone: '+33142685300' } })
      expect(list().props('modelValue')).toBe('FR')
      expect(box().element.value).toBe('142 685 300')
    })
  })

  describe('typing', () => {
    it('writes the international number of what is typed, and tells the form', async () => {
      const model = {}
      mount({}, model)
      await choose('GB')
      await type('020 7183 8750')
      expect(model.phone).toBe('+442071838750')
      expect(wrapper.emitted('input').at(-1)).toEqual(['+442071838750', 'phone'])
    })

    it('takes the country from a number typed with its code', async () => {
      const model = {}
      mount({}, model)
      await type('+33 1 42 68 53 00')
      expect(model.phone).toBe('+33142685300')
      expect(list().props('modelValue')).toBe('FR')
      await type('0044 20 7183 8750')
      expect(model.phone).toBe('+442071838750')
      expect(list().props('modelValue')).toBe('GB')
    })

    it('does not change the country for a code the field does not take', async () => {
      const model = {}
      mount({ options: { countries: ['FR', 'DE'] } }, model)
      await type('+44 20 7183 8750')
      expect(list().props('modelValue')).toBe('FR')
    })

    it('holds nothing when the box is empty, and for the 0 alone', async () => {
      const model = { phone: '+442071838750' }
      mount({}, model)
      await type('')
      expect(model.phone).toBeUndefined()
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'phone'])
      await type('0')
      expect(model.phone).toBeUndefined()
    })

    it('leaves what is typed alone while it is typed', async () => {
      const model = {}
      mount({}, model)
      await choose('GB')
      await type('0207 183')
      expect(box().element.value).toBe('0207 183')
      expect(model.phone).toBe('+44207183')
    })

    it('writes the number in groups, with its country, when the box is left', async () => {
      const model = {}
      mount({}, model)
      await type('+44 (0)20 7183-8750')
      await leave()
      expect(box().element.value).toBe('207 183 8750')
      expect(model.phone).toBe('+442071838750')
    })

    it('holds nothing for what is not a number, and says so', async () => {
      const model = { phone: '+442071838750' }
      mount({}, model)
      await type('call me')
      expect(model.phone).toBeUndefined()
      await leave()
      expect(wrapper.get('.phone-error').text()).toBe(TranslateService.get('TL_INVALID_PHONE'))
      expect(wrapper.get('.phone-error').attributes('role')).toBe('alert')
      expect(box().element.value).toBe('call me')
      await type('020 7183 8750')
      expect(model.phone).toBe('+442071838750')
      expect(wrapper.find('.phone-error').exists()).toBe(false)
    })

    it('does not write when it is read-only or disabled', async () => {
      const model = { phone: '+442071838750' }
      mount({ readonly: true }, model)
      await type('0')
      expect(model.phone).toBe('+442071838750')
      wrapper.unmount()
      mount({ disabled: true }, model)
      expect(box().attributes('disabled')).toBeDefined()
    })

    it('writes at the path of a locale', async () => {
      const model = { phone: { enUS: '+442071838750' } }
      mount({ model: 'phone.enUS' }, model)
      expect(box().element.value).toBe('207 183 8750')
      await type('+33 1 42 68 53 00')
      expect(model.phone.enUS).toBe('+33142685300')
    })
  })

  describe('the country', () => {
    it('changes the country of the number as typed', async () => {
      const model = {}
      mount({}, model)
      await choose('GB')
      await type('2071838750')
      expect(model.phone).toBe('+442071838750')
      await choose('FR')
      expect(model.phone).toBe('+332071838750')
    })

    it('keeps a country chosen while there is no number, and holds no value', async () => {
      const model = {}
      mount({}, model)
      await choose('JP')
      expect(model.phone).toBeUndefined()
      expect(list().props('modelValue')).toBe('JP')
      await type('90 1234 5678')
      expect(model.phone).toBe('+819012345678')
    })

    it('finds a country by its name, its code or its calling code', () => {
      mount()
      const item = list().props('items').find(entry => entry.value === 'FR')
      const matches = (query) => wrapper.vm.matches('', query, { raw: item })
      expect(matches('fran')).toBe(true)
      expect(matches('FR')).toBe(true)
      expect(matches('+33')).toBe(true)
      expect(matches('germany')).toBe(false)
    })
  })

  describe('the rules', () => {
    it('says what the number must be when the box is left: a country the field takes, a number', async () => {
      mount({ options: { countries: ['FR', 'DE'] } }, {})
      await type('+44 20 7183 8750')
      await leave()
      expect(wrapper.get('.phone-error').text()).toBe(TranslateService.get('TL_PHONE_COUNTRY'))
      await type('+33 1 42 68 53 00')
      await leave()
      expect(wrapper.find('.phone-error').exists()).toBe(false)
      await type('12')
      await leave()
      expect(wrapper.get('.phone-error').text()).toBe(TranslateService.get('TL_INVALID_PHONE'))
    })

    it('refuses a required number that is missing when the form asks, without painting the field red before anyone has touched it (the editor marks it after a failed save)', async () => {
      mount({ required: true, options: { hint: 'Needed' } }, {})
      await flushPromises()
      expect(wrapper.find('.phone-error').exists()).toBe(false)
      expect(wrapper.find('.v-input--error').exists()).toBe(false)
      expect(wrapper.get('.help-block').text()).toBe('Needed')
      expect(wrapper.vm.rule()).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
      await flushPromises()
      expect(wrapper.find('.phone-error').exists()).toBe(false)
      await type('020 7183 8750')
      expect(wrapper.vm.rule()).toBe(true)
    })

    it('says at once that a number a record holds is not one the field takes', async () => {
      mount({ options: { countries: ['FR'] } }, { phone: '+442071838750' })
      await flushPromises()
      expect(wrapper.get('.phone-error').text()).toBe(TranslateService.get('TL_PHONE_COUNTRY'))
    })

    it('has nothing to say about an empty box that is not required', () => {
      mount({}, {})
      expect(wrapper.vm.rule()).toBe(true)
    })
  })
})
