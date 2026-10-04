import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import MoneyField from '@c/fields/MoneyField.vue'
import { mountField, TranslateService } from './helpers/mountField.js'

// The money field: an amount box and a currency, kept as { amount, currency }.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(MoneyField, { model, schema: { model: 'price', label: 'Price', ...schema }, attachTo: document.body })
  return wrapper
}
const box = () => wrapper.get('input[id$="-amount"]')
const select = () => wrapper.findComponent({ name: 'VSelect' })
const type = async (text) => {
  box().element.value = text
  await box().trigger('input')
  await flushPromises()
}
const leave = async () => {
  await box().trigger('blur')
  await flushPromises()
}
const choose = async (code) => {
  select().vm.$emit('update:modelValue', code)
  await flushPromises()
}

afterEach(() => wrapper?.unmount())

describe('MoneyField', () => {
  describe('what it shows', () => {
    it('has the amount box and a list of currencies, with the label and the hint', () => {
      mount({ options: { hint: 'What it costs' } })
      expect(wrapper.text()).toContain('Price')
      expect(select().exists()).toBe(true)
      expect(select().props('modelValue')).toBe('USD')
      expect(wrapper.get('.help-block').text()).toBe('What it costs')
    })

    it('offers the currencies of the field, with their names', () => {
      mount({ options: { currencies: ['EUR', 'GBP'] } })
      expect(select().props('items')).toEqual([
        { value: 'EUR', title: 'EUR', props: { subtitle: 'Euro' } },
        { value: 'GBP', title: 'GBP', props: { subtitle: 'British Pound' } }
      ])
      expect(select().props('modelValue')).toBe('EUR')
    })

    it('writes the code beside the amount when the currency is fixed', () => {
      mount({ options: { currency: 'EUR' } })
      expect(select().exists()).toBe(false)
      expect(wrapper.get('.money-fixed').text()).toBe('EUR')
      expect(wrapper.get('.money-fixed').attributes('title')).toBe('Euro')
    })

    it('shows a value with the decimals of its currency', () => {
      mount({}, { price: { amount: 19.5, currency: 'EUR' } })
      expect(box().element.value).toBe('19.50')
      expect(select().props('modelValue')).toBe('EUR')
      wrapper.unmount()
      mount({}, { price: { amount: 1999, currency: 'JPY' } })
      expect(box().element.value).toBe('1999')
    })

    it('keeps a currency a record holds that the field does not offer, so that it is shown as it is', () => {
      mount({ options: { currencies: ['EUR', 'GBP'] } }, { price: { amount: 5, currency: 'CHF' } })
      expect(select().props('modelValue')).toBe('CHF')
      expect(select().props('items').map(item => item.value)).toEqual(['EUR', 'GBP', 'CHF'])
    })

    it('shows nothing for no value, and 0.00 for an amount of zero', () => {
      mount({}, {})
      expect(box().element.value).toBe('')
      wrapper.unmount()
      mount({}, { price: { amount: 0, currency: 'USD' } })
      expect(box().element.value).toBe('0.00')
    })

    it('has real labels: the amount is the one of the field, the list has its own', () => {
      mount({})
      const amount = box().attributes('id')
      expect(wrapper.get(`label[for="${amount}"]`).text()).toContain('Price')
      const list = select().props('id')
      expect(wrapper.get(`label[for="${list}"]`).text()).toBe('Currency')
    })

    it('marks a required field with a star', () => {
      mount({ required: true })
      expect(wrapper.find('.required-mark').exists()).toBe(true)
    })

    it('shows a value of another record when the record changes', async () => {
      mount({}, { price: { amount: 1, currency: 'USD' } })
      expect(box().element.value).toBe('1.00')
      await wrapper.setProps({ model: { price: { amount: 2.5, currency: 'EUR' } } })
      expect(box().element.value).toBe('2.50')
      expect(select().props('modelValue')).toBe('EUR')
    })
  })

  describe('typing', () => {
    it('writes the amount with its currency, and tells the form', async () => {
      const model = {}
      mount({}, model)
      await type('19.99')
      expect(model.price).toEqual({ amount: 19.99, currency: 'USD' })
      expect(wrapper.emitted('input').at(-1)).toEqual([{ amount: 19.99, currency: 'USD' }, 'price'])
    })

    it('reads the amount the way it is written, with a comma or grouped', async () => {
      const model = {}
      mount({}, model)
      await type('19,99')
      expect(model.price.amount).toBe(19.99)
      await type('1.234,56')
      expect(model.price.amount).toBe(1234.56)
      await type('1,234.56')
      expect(model.price.amount).toBe(1234.56)
    })

    it('rounds to the decimals of the currency', async () => {
      const model = {}
      mount({ options: { currencies: ['USD', 'JPY'] } }, model)
      await type('1.005')
      expect(model.price.amount).toBe(1.01)
      await choose('JPY')
      expect(model.price).toEqual({ amount: 1, currency: 'JPY' })
    })

    it('holds nothing when the box is empty, and an amount of zero when zero is typed', async () => {
      const model = { price: { amount: 5, currency: 'USD' } }
      mount({}, model)
      await type('')
      expect(model.price).toBeUndefined()
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'price'])
      await type('0')
      expect(model.price).toEqual({ amount: 0, currency: 'USD' })
    })

    it('leaves what is typed alone while it is typed', async () => {
      const model = {}
      mount({}, model)
      await type('19.5')
      expect(box().element.value).toBe('19.5')
    })

    it('writes the decimals of the currency when the box is left', async () => {
      const model = {}
      mount({}, model)
      await type('19.5')
      await leave()
      expect(box().element.value).toBe('19.50')
      expect(model.price.amount).toBe(19.5)
    })

    it('holds nothing for what is not an amount, and says so', async () => {
      const model = { price: { amount: 5, currency: 'USD' } }
      mount({}, model)
      await type('abc')
      expect(model.price).toBeUndefined()
      await leave()
      expect(wrapper.get('.money-error').text()).toBe(TranslateService.get('TL_INVALID_MONEY'))
      expect(wrapper.get('.money-error').attributes('role')).toBe('alert')
      expect(box().element.value).toBe('abc')
      await type('12')
      expect(model.price.amount).toBe(12)
      expect(wrapper.find('.money-error').exists()).toBe(false)
    })

    it('does not write when it is read-only or disabled', async () => {
      const model = { price: { amount: 5, currency: 'USD' } }
      mount({ readonly: true }, model)
      await type('45')
      expect(model.price.amount).toBe(5)
      wrapper.unmount()
      mount({ disabled: true }, model)
      expect(box().attributes('disabled')).toBeDefined()
    })

    it('writes at the path of a locale', async () => {
      const model = { price: { enUS: { amount: 5, currency: 'USD' } } }
      mount({ model: 'price.enUS', options: { currency: 'USD' } }, model)
      expect(box().element.value).toBe('5.00')
      await type('7.25')
      expect(model.price.enUS).toEqual({ amount: 7.25, currency: 'USD' })
    })
  })

  describe('the currency', () => {
    it('changes the currency of the amount, which takes the decimals of the new one', async () => {
      const model = { price: { amount: 1999.5, currency: 'USD' } }
      mount({ options: { currencies: ['USD', 'JPY', 'KWD'] } }, model)
      await choose('JPY')
      expect(model.price).toEqual({ amount: 2000, currency: 'JPY' })
      expect(box().element.value).toBe('2000')
      await choose('KWD')
      expect(model.price).toEqual({ amount: 2000, currency: 'KWD' })
      expect(box().element.value).toBe('2000.000')
    })

    it('keeps a currency chosen while there is no amount, and holds no value', async () => {
      const model = {}
      mount({ options: { currencies: ['USD', 'EUR'] } }, model)
      await choose('EUR')
      expect(model.price).toBeUndefined()
      expect(select().props('modelValue')).toBe('EUR')
      await type('3')
      expect(model.price).toEqual({ amount: 3, currency: 'EUR' })
    })
  })

  describe('entering the box', () => {
    it('selects its number, so that typing replaces it', async () => {
      mount({}, { price: { amount: 5, currency: 'USD' } })
      box().element.select = vi.fn()
      await box().trigger('focus')
      expect(box().element.select).toHaveBeenCalledTimes(1)
    })
  })

  describe('the rules', () => {
    it('says what the amount must be when the box is left: the least and the most', async () => {
      const model = {}
      mount({ min: 5, max: 500, options: { currency: 'USD' } }, model)
      await type('4')
      await leave()
      expect(wrapper.get('.money-error').text()).toBe(TranslateService.get('TL_MONEY_TOO_LOW', { min: '$5.00' }))
      await type('600')
      await leave()
      expect(wrapper.get('.money-error').text()).toBe(TranslateService.get('TL_MONEY_TOO_HIGH', { max: '$500.00' }))
      await type('50')
      expect(wrapper.find('.money-error').exists()).toBe(false)
    })

    it('refuses a required amount that is missing when the form asks, without painting the field red before anyone has touched it (the editor marks it after a failed save)', async () => {
      mount({ required: true, options: { hint: 'Needed' } }, {})
      await flushPromises()
      expect(wrapper.find('.money-error').exists()).toBe(false)
      expect(wrapper.find('.v-input--error').exists()).toBe(false)
      expect(wrapper.get('.help-block').text()).toBe('Needed')
      expect(wrapper.vm.rule()).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
      await flushPromises()
      expect(wrapper.find('.money-error').exists()).toBe(false)
      await type('1')
      expect(wrapper.vm.rule()).toBe(true)
    })

    it('says at once that an amount a record holds is not one the field takes', async () => {
      mount({ max: 10, options: { currency: 'USD' } }, { price: { amount: 50, currency: 'USD' } })
      await flushPromises()
      expect(wrapper.get('.money-error').text()).toBe(TranslateService.get('TL_MONEY_TOO_HIGH', { max: '$10.00' }))
    })

    it('has nothing to say about an empty box that is not required', () => {
      mount({}, {})
      expect(wrapper.vm.rule()).toBe(true)
    })
  })
})
