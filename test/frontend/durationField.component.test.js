import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import DurationField from '@c/fields/DurationField.vue'
import { mountField, TranslateService } from './helpers/mountField.js'

// The duration field: one box that keeps its template (__:__), kept as a number of seconds.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(DurationField, { model, schema: { model: 'length', label: 'Length', ...schema }, attachTo: document.body })
  return wrapper
}
const box = () => wrapper.get('input')
const value = () => box().element.value
// what a keyboard, a paste or a cut does to the box: the browser asks before it changes it, and the field answers for it
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
const backspaces = async (count) => {
  for (let i = 0; i < count; i++) {
    await backspace()
  }
}
const paste = (text) => edit('insertFromPaste', text)
const leave = async () => {
  await box().trigger('focus')
  await box().trigger('blur')
  await flushPromises()
}
const messages = () => wrapper.findAll('.v-messages__message').map(message => message.text())

afterEach(() => wrapper?.unmount())

describe('DurationField', () => {
  describe('what it shows', () => {
    it('has one box with the label and the hint, showing its template while it is empty', () => {
      mount({ options: { hint: 'How long it takes' } })
      expect(wrapper.findAll('input')).toHaveLength(1)
      expect(wrapper.text()).toContain('Length')
      expect(wrapper.get('.help-block').text()).toBe('How long it takes')
      expect(value()).toBe('__:__')
    })

    it('has a template for the units of the field', () => {
      mount({ options: { units: ['hours', 'minutes', 'seconds'] } })
      expect(value()).toBe('__:__:__')
      wrapper.unmount()
      mount({ options: { units: ['days', 'hours'] } })
      expect(value()).toBe('___d __h')
      wrapper.unmount()
      mount({ options: { units: ['minutes'] } })
      expect(value()).toBe('___m')
    })

    it('shows a value in the slots, the carried up form of the length', () => {
      mount({}, { length: 5400 })
      expect(value()).toBe('01:30')
      wrapper.unmount()
      mount({ options: { units: ['days', 'hours', 'minutes', 'seconds'] } }, { length: 90061 })
      expect(value()).toBe('001d 01h 01m 01s')
      wrapper.unmount()
      mount({ options: { units: ['minutes'] } }, { length: 5400 })
      expect(value()).toBe('090m')
    })

    it('shows a length of zero as 00:00, and the template for no value', () => {
      mount({}, { length: 0 })
      expect(value()).toBe('00:00')
      wrapper.unmount()
      mount({}, {})
      expect(value()).toBe('__:__')
    })

    it('makes room for a length that has more hours than two digits hold', () => {
      mount({}, { length: 100 * 3600 })
      expect(value()).toBe('100:00')
      wrapper.unmount()
      mount({ max: 200 * 3600 }, {})
      expect(value()).toBe('___:__')
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
      expect(value()).toBe('01:00')
      await wrapper.setProps({ model: { length: 7260 } })
      expect(value()).toBe('02:01')
    })
  })

  describe('typing', () => {
    it('fills the slots from the left and writes the seconds as it goes, and tells the form', async () => {
      const model = {}
      mount({}, model)
      await type('1')
      expect(value()).toBe('1_:__')
      expect(model.length).toBe(3600)
      await type('3')
      expect(value()).toBe('13:__')
      await type('45')
      expect(value()).toBe('13:45')
      expect(model.length).toBe(13 * 3600 + 45 * 60)
      expect(wrapper.emitted('input').at(-1)).toEqual([13 * 3600 + 45 * 60, 'length'])
    })

    it('stops the browser from changing the box itself', async () => {
      mount({}, {})
      const event = await edit('insertText', '1')
      expect(event.defaultPrevented).toBe(true)
      expect((await edit('deleteContentBackward')).defaultPrevented).toBe(true)
    })

    it('takes a colon, a space or a letter as the end of a part, which is filled from the left with zeros', async () => {
      const model = {}
      mount({}, model)
      await type('1:')
      expect(value()).toBe('01:__')
      await type('30')
      expect(value()).toBe('01:30')
      expect(model.length).toBe(5400)
      wrapper.unmount()
      mount({}, model)
      await backspaces(4)
      await type('2h')
      expect(value()).toBe('02:__')
    })

    it('ignores what does not fit when every slot is full', async () => {
      const model = {}
      mount({}, model)
      await type('012345')
      expect(value()).toBe('01:23')
      expect(model.length).toBe(1 * 3600 + 23 * 60)
    })

    it('takes the last digit away with Backspace, and the length with it', async () => {
      const model = {}
      mount({}, model)
      await type('130')
      expect(value()).toBe('13:0_')
      await backspace()
      expect(value()).toBe('13:__')
      expect(model.length).toBe(13 * 3600)
      await backspaces(2)
      expect(value()).toBe('__:__')
      expect(model.length).toBeUndefined()
      expect(wrapper.emitted('input').at(-1)).toEqual([undefined, 'length'])
      await backspace()
      expect(value()).toBe('__:__')
    })

    it('replaces everything when everything is selected, as when the box is entered', async () => {
      const model = { length: 5400 }
      mount({}, model)
      box().element.setSelectionRange(0, value().length)
      await type('2')
      expect(value()).toBe('2_:__')
      expect(model.length).toBe(7200)
      box().element.setSelectionRange(0, value().length)
      await backspace()
      expect(value()).toBe('__:__')
      expect(model.length).toBeUndefined()
    })

    it('holds a length of zero when zeros are typed', async () => {
      const model = {}
      mount({}, model)
      await type('0000')
      expect(value()).toBe('00:00')
      expect(model.length).toBe(0)
    })

    it('takes a length pasted in any of the ways to write it', async () => {
      const model = {}
      mount({}, model)
      await paste('1h 30m')
      expect(value()).toBe('01:30')
      expect(model.length).toBe(5400)
      await paste('90')
      expect(value()).toBe('01:30')
      await paste('2:15')
      expect(value()).toBe('02:15')
      expect(model.length).toBe(8100)
      await paste('soon')
      expect(value()).toBe('02:15')
      expect(model.length).toBe(8100)
    })

    it('makes room for a pasted length that has more hours than two digits hold', async () => {
      const model = {}
      mount({}, model)
      await paste('120h')
      expect(value()).toBe('120:00')
      expect(model.length).toBe(120 * 3600)
    })

    it('carries the lengths up when the box is left: 00:90 are 01:30', async () => {
      const model = {}
      mount({}, model)
      await type('0090')
      expect(value()).toBe('00:90')
      expect(model.length).toBe(5400)
      await leave()
      expect(value()).toBe('01:30')
      expect(model.length).toBe(5400)
    })

    it('counts a part that is not finished as typed when the box is left', async () => {
      const model = {}
      mount({}, model)
      await type('1')
      await leave()
      expect(value()).toBe('01:00')
      expect(model.length).toBe(3600)
    })

    it('leaves the box as it is when nothing is typed', async () => {
      const model = {}
      mount({}, model)
      await leave()
      expect(value()).toBe('__:__')
      expect(model.length).toBeUndefined()
    })

    it('does not write when it is read-only or disabled', async () => {
      const model = { length: 600 }
      mount({ readonly: true }, model)
      await type('4')
      expect(model.length).toBe(600)
      expect(value()).toBe('00:10')
      wrapper.unmount()
      mount({ disabled: true }, model)
      expect(box().attributes('disabled')).toBeDefined()
    })

    it('writes at the path of a locale', async () => {
      const model = { length: { enUS: 3600 } }
      mount({ model: 'length.enUS' }, model)
      expect(value()).toBe('01:00')
      await backspaces(2)
      await type('15')
      expect(value()).toBe('01:15')
      expect(model.length.enUS).toBe(4500)
    })

    it('works with days, with a unit alone, and with seconds', async () => {
      const model = {}
      mount({ options: { units: ['days', 'hours'] } }, model)
      await type('2:3')
      expect(value()).toBe('002d 3_h')
      expect(model.length).toBe(2 * 86400 + 3 * 3600)
      wrapper.unmount()
      const other = {}
      mount({ options: { units: ['minutes'] } }, other)
      await type('90')
      expect(value()).toBe('90_m')
      expect(other.length).toBe(5400)
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
      await type('0005')
      await leave()
      expect(messages()).toEqual([TranslateService.get('TL_DURATION_TOO_SHORT', { min: '15m' })])
      await backspaces(4)
      await type('0300')
      await leave()
      expect(messages()).toEqual([TranslateService.get('TL_DURATION_TOO_LONG', { max: '2h' })])
      await backspaces(4)
      await type('0100')
      await leave()
      expect(messages()).toEqual([])
    })

    it('refuses a required length that is missing when the form asks, and is not red before anyone has touched it', async () => {
      mount({ required: true, options: { hint: 'Needed' } }, {})
      await flushPromises()
      expect(wrapper.find('.v-input--error').exists()).toBe(false)
      expect(wrapper.get('.help-block').text()).toBe('Needed')
      expect(wrapper.vm.rule()).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
      await type('0100')
      expect(wrapper.vm.rule()).toBe(true)
      await backspaces(4)
      await type('0000')
      expect(wrapper.vm.rule()).toBe(true)
    })

    it('is valid with no length when it is not required', () => {
      mount({}, {})
      expect(wrapper.vm.rule()).toBe(true)
    })
  })
})
