import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { parseMask, maskText, maskCaret, maskType, maskValue, maskFromText } from '@u/mask'
import { readTemplate, durationMask, durationOptions } from '@u/duration'
import SchemaService from '@s/SchemaService'
import MaskedField from '@c/fields/MaskedField.vue'
import { mountField } from './helpers/mountField.js'

// A backslash makes the next character itself: the five characters a template gives a meaning to (_ # A * and the backslash) can be written for you as well.
// In these tests a template is written in JavaScript, so `\\A` is the two characters \A.

const mask = (pattern) => parseMask(pattern)

describe('escapes in a template', () => {
  describe('what is read', () => {
    it.each([['\\A', 'A'], ['\\_', '_'], ['\\#', '#'], ['\\*', '*'], ['\\\\', '\\'], ['\\-', '-'], ['\\F', 'F'], ['\\ ', ' ']])('reads %s as the character %s, written for you', (escape, char) => {
      const found = mask(`__${escape}__`)
      expect(found.tokens).toEqual([{ slot: 'digit' }, { slot: 'digit' }, { literal: char }, { slot: 'digit' }, { slot: 'digit' }])
      expect(found.size).toBe(4)
    })

    it('splits the runs of places where an escaped character stands, so that they are two groups', () => {
      expect(mask('__\\A__').groups).toEqual([{ start: 0, size: 2 }, { start: 2, size: 2 }])
      expect(mask('__\\_AA').groups).toEqual([{ start: 0, size: 2 }, { start: 2, size: 2 }])
    })

    it('is no mask when every character is escaped', () => {
      expect(mask('\\A\\_\\#\\*\\\\')).toBeNull()
    })

    it('keeps a backslash at the end of the template, and a doubled one, as the character', () => {
      expect(mask('_\\').tokens).toEqual([{ slot: 'digit' }, { literal: '\\' }])
      expect(mask('_\\\\_').tokens).toEqual([{ slot: 'digit' }, { literal: '\\' }, { slot: 'digit' }])
    })

    it('reads the escape before the character it escapes, once: \\\\A is a backslash and then a letter place', () => {
      expect(mask('\\\\A').tokens).toEqual([{ literal: '\\' }, { slot: 'letter' }])
    })
  })

  describe('the capital A written for you, then the letters: \\A__-AAAA', () => {
    const flight = mask('\\A__-AAAA')

    it('shows it in the box and counts only the places', () => {
      expect(maskText('', flight)).toBe('A__-____')
      expect(flight.size).toBe(6)
      expect(maskText('12abcd', flight)).toBe('A12-abcd')
    })

    it('puts the caret at the first place, after the letter that is written', () => {
      expect(maskCaret('', flight)).toBe(1)
      expect(maskCaret('12', flight)).toBe(4)
    })

    it('does not take a typed A, or any letter, where a digit goes', () => {
      expect(maskType('', flight, 'A')).toBe('')
      expect(maskType('', flight, 'a')).toBe('')
      expect(maskType('', flight, '1')).toBe('1')
    })

    it('takes a capital A, or any letter, where a letter goes', () => {
      expect(maskType('12', flight, 'A')).toBe('12A')
      expect(maskType('12', flight, 'z')).toBe('12z')
      expect(maskType('12', flight, '3')).toBe('12')
    })

    it('writes the A before the first character typed, and keeps it in the value', () => {
      expect(maskValue('', flight)).toBe('')
      expect(maskValue('1', flight)).toBe('A1')
      expect(maskValue('12abcd', flight)).toBe('A12-abcd')
    })

    it('reads a value or a paste that has the A, or not, and does not mistake the A for a typed letter', () => {
      expect(maskFromText('A12-abcd', flight)).toBe('12abcd')
      expect(maskFromText('12abcd', flight)).toBe('12abcd')
      expect(maskFromText('A12-ABCD', flight)).toBe('12ABCD')
      expect(maskFromText('a12-abcd', flight)).toBe('12abcd')
    })
  })

  describe('a letter place right after the written letter: \\AA', () => {
    const pair = mask('\\AA')

    it('takes the first letter typed for the place, not for the written one', () => {
      expect(maskText('', pair)).toBe('A_')
      expect(maskType('', pair, 'A')).toBe('A')
      expect(maskText('A', pair)).toBe('AA')
      expect(maskValue('B', pair)).toBe('AB')
    })

    it('reads AB as the place being B, whatever it is written with or without the written A', () => {
      expect(maskFromText('AB', pair)).toBe('B')
      expect(maskFromText('B', pair)).toBe('B')
    })
  })

  describe('the signs of a place written for you', () => {
    it('writes an underscore, a hash and a star for you, and takes digits, letters and both where the places are', () => {
      const found = mask('\\_#\\#A\\**')
      // an underscore (written), a digit place, a hash (written), a letter place, a star (written), a letter or digit place
      expect(maskText('', found)).toBe('__#_*_')
      expect(found.size).toBe(3)
    })

    it('shows them in the box, and keeps them in the value', () => {
      const found = mask('\\_#\\#A\\**')
      expect(maskText('1b2', found)).toBe('_1#b*2')
      expect(maskValue('1b2', found)).toBe('_1#b*2')
      expect(maskFromText('_1#b*2', found)).toBe('1b2')
    })

    it('does not take them as what is typed', () => {
      const found = mask('\\_#')
      expect(maskType('', found, '_')).toBe('')
      expect(maskType('', found, '5')).toBe('5')
    })

    it('writes a backslash for you', () => {
      const found = mask('__\\\\__')
      expect(maskText('1234', found)).toBe('12\\34')
      expect(maskValue('1234', found)).toBe('12\\34')
      expect(maskFromText('12\\34', found)).toBe('1234')
    })
  })

  describe('in the duration template', () => {
    it('writes the signs for you between the parts, and an escaped underscore is a sign, not a place', () => {
      const found = readTemplate('__\\_h __m')
      expect(found.mask.size).toBe(4)
      expect(found.units.map(unit => unit.name)).toEqual(['hours', 'minutes'])
      expect(maskText('0130', durationMask(found.units, 0, 0, '__\\_h __m'))).toBe('01_h 30m')
    })

    it('takes an escaped letter after the digits for a sign, not for the unit it looks like', () => {
      // \h is the character h as it is: the letter that follows the part still says hours
      expect(readTemplate('__\\h __\\m').units.map(unit => unit.name)).toEqual(['hours', 'minutes'])
    })

    it('is given by the options of the field', () => {
      expect(durationOptions({ options: { template: '__\\_h __m' } }).template).toBe('__\\_h __m')
    })
  })
})

describe('a text with an escaped template, in the field', () => {
  let wrapper
  const mount = (template, model = {}) => {
    wrapper = mountField(MaskedField, { model, schema: { model: 'code', label: 'Code', density: 'compact', options: { mask: template } }, attachTo: document.body })
    return wrapper
  }
  const box = () => wrapper.get('input')
  const edit = async (inputType, data) => {
    box().element.dispatchEvent(new InputEvent('beforeinput', { inputType, data, cancelable: true, bubbles: true }))
    await flushPromises()
  }
  const type = async (text) => {
    for (const key of text) {
      await edit('insertText', key)
    }
  }
  afterEach(() => wrapper?.unmount())

  it('shows the written letter, takes digits and then letters, and keeps the written letter in the value', async () => {
    const model = {}
    mount('\\A__-AAAA', model)
    expect(box().element.value).toBe('A__-____')
    await type('a1b2-cdEF')
    expect(box().element.value).toBe('A12-cdEF')
    expect(model.code).toBe('A12-cdEF')
  })

  it('shows a stored value and takes a paste, with the written letter in them or not', async () => {
    const model = { code: 'A12-abcd' }
    mount('\\A__-AAAA', model)
    expect(box().element.value).toBe('A12-abcd')
    await edit('insertFromPaste', '34-wxyz')
    expect(box().element.value).toBe('A34-wxyz')
    await edit('insertFromPaste', 'A56-ABCD')
    expect(box().element.value).toBe('A56-ABCD')
    expect(model.code).toBe('A56-ABCD')
  })

  it('refuses a text that is not complete, whatever is written for you', async () => {
    mount('\\A__-AAAA')
    await type('12ab')
    expect(wrapper.vm.rule()).toContain('A__-____')
    await type('cd')
    expect(wrapper.vm.rule()).toBe(true)
  })

  it('is the field of a template that has a place, and the usual box for one that has none', () => {
    const one = (template) => SchemaService.getSchemaFields([{ field: 'x', input: 'string', options: { mask: template } }], { name: 'r', title: 'r' }, 'enUS', 'enUS', false, undefined, false)[0]
    expect(one('\\A__').overrideType).toBe('MaskedField')
    expect(one('\\A\\_\\#').overrideType).toBe('CustomInput')
  })
})
