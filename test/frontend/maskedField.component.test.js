import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import MaskedField from '@c/fields/MaskedField.vue'
import { mountField, TranslateService } from './helpers/mountField.js'

// A string with a template (options.mask): typed in a box that keeps it.

let wrapper
const mount = (mask = '(___) ___-____', schema = {}, model = {}) => {
  wrapper = mountField(MaskedField, { model, schema: { model: 'phone', label: 'Phone', density: 'compact', options: { mask }, ...schema }, attachTo: document.body })
  return wrapper
}
const box = () => wrapper.get('input')
const value = () => box().element.value
const edit = async (inputType, data) => {
  const event = new InputEvent('beforeinput', { inputType, data, cancelable: true, bubbles: true })
  box().element.dispatchEvent(event)
  await flushPromises()
  return event
}
const type = async (text) => {
  for (const key of text) {
    await edit('insertText', key)
  }
}
const backspace = () => edit('deleteContentBackward')
const paste = (text) => edit('insertFromPaste', text)
const leave = async () => {
  await box().trigger('focus')
  await box().trigger('blur')
  await flushPromises()
}
const messages = () => wrapper.findAll('.v-messages__message').map(message => message.text())

afterEach(() => wrapper?.unmount())

describe('MaskedField', () => {
  describe('what it shows', () => {
    it('shows the template while it is empty, with the label and the hint', () => {
      mount('(___) ___-____', { options: { mask: '(___) ___-____', hint: 'A phone number' } })
      expect(value()).toBe('(___) ___-____')
      expect(wrapper.text()).toContain('Phone')
      expect(wrapper.get('.help-block').text()).toBe('A phone number')
    })

    it('shows a value in the template, whether it was written with it or not', () => {
      mount('(___) ___-____', {}, { phone: '(555) 123-4567' })
      expect(value()).toBe('(555) 123-4567')
      wrapper.unmount()
      mount('(___) ___-____', {}, { phone: '5551234567' })
      expect(value()).toBe('(555) 123-4567')
    })

    it('shows a value that is not complete as far as it goes', () => {
      mount('__/__/____', {}, { phone: '12/3' })
      expect(value()).toBe('12/3_/____')
    })

    it('has a real label that is for the box', () => {
      mount()
      const id = box().attributes('id')
      expect(box().attributes('name')).toBe('phone')
      expect(wrapper.get(`label[for="${id}"]`).text()).toContain('Phone')
    })

    it('shows another value when the record changes', async () => {
      mount('__:__', {}, { phone: '01:00' })
      await wrapper.setProps({ model: { phone: '02:15' } })
      expect(value()).toBe('02:15')
    })
  })

  describe('typing', () => {
    it('fills the slots from the left, writes the text with the template as it goes, and tells the form', async () => {
      const model = {}
      mount('(___) ___-____', {}, model)
      await type('555')
      expect(value()).toBe('(555) ___-____')
      expect(model.phone).toBe('(555')
      await type('1234567')
      expect(value()).toBe('(555) 123-4567')
      expect(model.phone).toBe('(555) 123-4567')
      expect(wrapper.emitted('input').at(-1)).toEqual(['(555) 123-4567', 'phone'])
    })

    it('leaves out what does not fit the slot, and what the template writes itself', async () => {
      const model = {}
      mount('AA-___-AA', {}, model)
      await type('1a-b2')
      expect(value()).toBe('ab-2__-__')
      expect(model.phone).toBe('ab-2')
    })

    it('takes a letter of any language for a letter slot', async () => {
      const model = {}
      mount('AAA', {}, model)
      await type('é中z')
      expect(model.phone).toBe('é中z')
    })

    it('writes the letters in capitals or in small letters when the field says so, typed or pasted', async () => {
      const model = {}
      mount('AA-___-AA', { options: { mask: 'AA-___-AA', maskCase: 'upper' } }, model)
      await type('ad232da')
      expect(value()).toBe('AD-232-DA')
      expect(model.phone).toBe('AD-232-DA')
      await edit('deleteContentBackward')
      await paste('xy-999-zq')
      expect(model.phone).toBe('XY-999-ZQ')
      wrapper.unmount()
      const second = {}
      mount('****-****', { options: { mask: '****-****', maskCase: 'lower' } }, second)
      await type('AB12Cd')
      expect(second.phone).toBe('ab12-cd')
    })

    it('takes a letter or a digit for a * slot', async () => {
      const model = {}
      mount('*****-*****', {}, model)
      await type('a1-b2')
      expect(model.phone).toBe('a1b2')
      expect(value()).toBe('a1b2_-_____')
    })

    it('ignores what does not fit when every slot is full', async () => {
      const model = {}
      mount('__:__', {}, model)
      await type('123456')
      expect(value()).toBe('12:34')
    })

    it('stops the browser from changing the box itself', async () => {
      mount()
      expect((await edit('insertText', '1')).defaultPrevented).toBe(true)
      expect((await edit('deleteContentBackward')).defaultPrevented).toBe(true)
    })

    it('takes the last character away with Backspace, and holds nothing when none is left', async () => {
      const model = {}
      mount('(___) ___-____', {}, model)
      await type('5551')
      await backspace()
      expect(value()).toBe('(555) ___-____')
      expect(model.phone).toBe('(555')
      await backspace()
      await backspace()
      await backspace()
      expect(value()).toBe('(___) ___-____')
      expect(model.phone).toBeUndefined()
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'phone'])
    })

    it('replaces everything when everything is selected', async () => {
      const model = { phone: '(555) 123-4567' }
      mount('(___) ___-____', {}, model)
      box().element.setSelectionRange(0, value().length)
      await type('9')
      expect(value()).toBe('(9__) ___-____')
      expect(model.phone).toBe('(9')
    })

    it('takes a text pasted in any way of writing it', async () => {
      const model = {}
      mount('(___) ___-____', {}, model)
      await paste('555-123-4567')
      expect(value()).toBe('(555) 123-4567')
      expect(model.phone).toBe('(555) 123-4567')
      await paste('call me')
      expect(value()).toBe('(555) 123-4567')
    })

    it('does not write when it is read-only or disabled', async () => {
      const model = { phone: '(555) 123-4567' }
      mount('(___) ___-____', { readonly: true }, model)
      await type('9')
      await backspace()
      expect(model.phone).toBe('(555) 123-4567')
      wrapper.unmount()
      mount('(___) ___-____', { disabled: true }, model)
      expect(box().attributes('disabled')).toBeDefined()
    })

    it('writes at the path of a locale', async () => {
      const model = { phone: { enUS: '01:00' } }
      mount('__:__', { model: 'phone.enUS' }, model)
      expect(value()).toBe('01:00')
      await backspaces(2)
      await type('15')
      expect(model.phone.enUS).toBe('01:15')
    })
  })

  describe('the rules', () => {
    it('refuses a text that is not complete when the box is left, and says what it must look like', async () => {
      mount('(___) ___-____')
      await type('5551')
      await leave()
      expect(messages()).toEqual([TranslateService.get('TL_MASK_INCOMPLETE', { template: '(___) ___-____' })])
      // (entering the box selected everything: what comes replaces it)
      await paste('5551234567')
      await leave()
      expect(messages()).toEqual([])
    })

    it('has nothing to say about a box that is empty and not required', () => {
      mount()
      expect(wrapper.vm.rule()).toBe(true)
    })

    it('refuses an empty box when required, without painting the field red before anyone has touched it', async () => {
      mount('(___) ___-____', { required: true })
      await flushPromises()
      expect(wrapper.find('.v-input--error').exists()).toBe(false)
      expect(wrapper.vm.rule()).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
      await type('5551234567')
      expect(wrapper.vm.rule()).toBe(true)
    })

    it('is a box like any other for a field with no template', async () => {
      const model = {}
      mount(undefined, { options: {} }, model)
      expect(wrapper.vm.rule()).toBe(true)
      expect(value()).toBe('')
      await type('a')
      expect(model.phone).toBeUndefined()
    })
  })
})

async function backspaces (count) {
  for (let i = 0; i < count; i++) {
    await backspace()
  }
}
