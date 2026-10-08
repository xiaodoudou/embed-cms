import { describe, it, expect } from 'vitest'
import { parseMask, fitsSlot, maskText, maskCaret, maskType, maskValue, maskFromText, maskComplete, widenGroup } from '@u/mask'

// The templates of the admin: __:__, (___) ___-____, AA-___-AA.

const mask = (pattern) => parseMask(pattern)

describe('parseMask', () => {
  it('reads a slot for a digit (_ or #), a letter (A) and a letter or a digit (*), and writes the rest as it is', () => {
    expect(mask('_#A*-').tokens).toEqual([{ slot: 'digit' }, { slot: 'digit' }, { slot: 'letter' }, { slot: 'alnum' }, { literal: '-' }])
  })

  it('counts the slots and the runs of them between the characters of the template', () => {
    const found = mask('(___) ___-____')
    expect(found.size).toBe(10)
    expect(found.groups).toEqual([{ start: 0, size: 3 }, { start: 3, size: 3 }, { start: 6, size: 4 }])
    expect(mask('__:__:__').groups).toHaveLength(3)
  })

  it('takes the character after a backslash for itself, a slot included', () => {
    const found = mask('\\A-__\\_')
    expect(found.tokens).toEqual([{ literal: 'A' }, { literal: '-' }, { slot: 'digit' }, { slot: 'digit' }, { literal: '_' }])
    expect(found.size).toBe(2)
  })

  it('keeps a backslash that ends the template as it is', () => {
    expect(mask('__\\').tokens.at(-1)).toEqual({ literal: '\\' })
  })

  it('is no mask without a slot, nor for what is not a text', () => {
    for (const bad of ['', 'abc', '---', '\\_\\A', undefined, null, 5, {}]) {
      expect(mask(bad), String(bad)).toBeNull()
    }
  })
})

describe('characters of the template that look like text', () => {
  const flight = mask('F__-AAAA')

  it('writes the letters and the signs that are not places (F, -) for you, and takes digits and letters in the places', () => {
    expect(flight.size).toBe(6)
    expect(maskText('', flight)).toBe('F__-____')
    expect(maskText('12abcd', flight)).toBe('F12-abcd')
    expect(maskValue('12abcd', flight)).toBe('F12-abcd')
    expect(maskValue('1', flight)).toBe('F1')
  })

  it('enforces what each place takes: a letter where a digit goes, or a digit where a letter goes, is not taken', () => {
    expect(maskType('', flight, 'a')).toBe('')
    expect(maskType('', flight, 'F')).toBe('')
    expect(maskType('12', flight, '3')).toBe('12')
    expect(maskType('12', flight, 'a')).toBe('12a')
    expect(maskType('12', flight, '-')).toBe('12')
  })

  it('reads a value or a paste written with the template or not', () => {
    expect(maskFromText('F12-abcd', flight)).toBe('12abcd')
    expect(maskFromText('12abcd', flight)).toBe('12abcd')
    expect(maskFromText('F1-2ab-cd', flight)).toBe('12abcd')
  })

  it('takes a letter that is a place when it is written with a backslash', () => {
    const escaped = mask('\\A__-AAAA')
    expect(maskText('12abcd', escaped)).toBe('A12-abcd')
  })
})

describe('fitsSlot', () => {
  it('takes a digit, a letter of any language, or both', () => {
    expect(['5', 'a', 'é', '中', '-', ' '].map(char => fitsSlot('digit', char))).toEqual([true, false, false, false, false, false])
    expect(['5', 'a', 'é', '中', '-', ' '].map(char => fitsSlot('letter', char))).toEqual([false, true, true, true, false, false])
    expect(['5', 'a', 'é', '中', '-', ' '].map(char => fitsSlot('alnum', char))).toEqual([true, true, true, true, false, false])
  })
})

describe('maskText and maskCaret', () => {
  const phone = mask('(___) ___-____')

  it('shows the template with an underscore for each slot left', () => {
    expect(maskText('', phone)).toBe('(___) ___-____')
    expect(maskText('55', phone)).toBe('(55_) ___-____')
    expect(maskText('5551234567', phone)).toBe('(555) 123-4567')
  })

  it('puts the caret where the next character goes, past the characters of the template', () => {
    expect(maskCaret('', phone)).toBe(1)
    expect(maskCaret('55', phone)).toBe(3)
    expect(maskCaret('555', phone)).toBe(6)
    expect(maskCaret('5551234567', phone)).toBe(14)
  })
})

describe('maskType', () => {
  const plate = mask('AA-___-AA')

  it('puts a character that fits into the next slot', () => {
    expect(maskType('', plate, 'a')).toBe('a')
    expect(maskType('ab', plate, '1')).toBe('ab1')
  })

  it('leaves what does not fit, and the characters of the template itself, alone', () => {
    expect(maskType('', plate, '1')).toBe('')
    expect(maskType('ab', plate, 'x')).toBe('ab')
    expect(maskType('ab', plate, '-')).toBe('ab')
    expect(maskType('ab123cd', plate, 'e')).toBe('ab123cd')
  })

  it('pads the group of digits being typed with zeros when asked to, for what does not fit', () => {
    const clock = mask('__:__')
    expect(maskType('1', clock, ':', { pad: true })).toBe('01')
    expect(maskType('1', clock, ':')).toBe('1')
    expect(maskType('', clock, ':', { pad: true })).toBe('')
    expect(maskType('01', clock, ':', { pad: true })).toBe('01')
    expect(maskType('013', clock, ' ', { pad: true })).toBe('0103')
    expect(maskType('ab1', plate, '-', { pad: true })).toBe('ab001')
    // (a group of letters is not filled with zeros)
    expect(maskType('a', plate, '-', { pad: true })).toBe('a')
  })
})

describe('maskValue', () => {
  const phone = mask('(___) ___-____')

  it('writes what is typed with the characters of the template between, as far as it goes', () => {
    expect(maskValue('', phone)).toBe('')
    expect(maskValue('5', phone)).toBe('(5')
    expect(maskValue('555', phone)).toBe('(555')
    expect(maskValue('5551', phone)).toBe('(555) 1')
    expect(maskValue('5551234567', phone)).toBe('(555) 123-4567')
  })

  it('writes no character of the template after the last one typed', () => {
    expect(maskValue('12', mask('__:__'))).toBe('12')
    expect(maskValue('123', mask('__:__'))).toBe('12:3')
  })
})

describe('maskFromText', () => {
  const phone = mask('(___) ___-____')

  it('takes the characters of a value written with the template, or of a text pasted', () => {
    expect(maskFromText('(555) 123-4567', phone)).toBe('5551234567')
    expect(maskFromText('555-123-4567', phone)).toBe('5551234567')
    expect(maskFromText('5551234567', phone)).toBe('5551234567')
    expect(maskFromText('(555) 12', phone)).toBe('55512')
  })

  it('leaves out what does not fit, and what is too long', () => {
    expect(maskFromText('call 555 now', phone)).toBe('555')
    expect(maskFromText('55512345678901', phone)).toBe('5551234567')
    expect(maskFromText('', phone)).toBe('')
    expect(maskFromText(undefined, phone)).toBe('')
  })

  it('does not take for a typed character one that is a character of the template', () => {
    const country = mask('+1 ___')
    expect(maskFromText('+1 555', country)).toBe('555')
    expect(maskFromText('555', country)).toBe('555')
  })

  it('goes slot by slot, a letter slot taking only letters', () => {
    expect(maskFromText('ab-123-cd', mask('AA-___-AA'))).toBe('ab123cd')
    expect(maskFromText('12ab', mask('AA-__'))).toBe('ab')
  })
})

describe('maskComplete', () => {
  it('is every slot filled', () => {
    expect(maskComplete('1234', mask('__:__'))).toBe(true)
    expect(maskComplete('123', mask('__:__'))).toBe(false)
    expect(maskComplete('', mask('__:__'))).toBe(false)
  })
})

describe('widenGroup', () => {
  it('adds slots to a group, of its type', () => {
    const wider = widenGroup(mask('__:__'), 0, 1)
    expect(maskText('', wider)).toBe('___:__')
    expect(wider.groups).toEqual([{ start: 0, size: 3 }, { start: 3, size: 2 }])
    expect(maskText('', widenGroup(mask('AA-__'), 0, 2))).toBe('____-__')
  })

  it('leaves the mask it was given as it was', () => {
    const original = mask('__:__')
    widenGroup(original, 0, 2)
    expect(maskText('', original)).toBe('__:__')
  })
})

describe('the case of the letters', () => {
  const upper = parseMask('AA-___-AA', 'upper')
  const lower = parseMask('****-****', 'lower')

  it('writes the letters that are typed in capitals or in small letters, and leaves digits and the template alone', () => {
    expect(['a', 'd', '-', '2', '3', '2', 'd', 'a'].reduce((chars, key) => maskType(chars, upper, key), '')).toBe('AD232DA')
    expect(maskValue('AD232DA', upper)).toBe('AD-232-DA')
    expect(maskType('', lower, 'Q')).toBe('q')
    expect(maskType('q', lower, '7')).toBe('q7')
  })

  it('writes the letters of a pasted or stored text in that case too, the template written or not', () => {
    expect(maskFromText('ad-232-Da', upper)).toBe('AD232DA')
    expect(maskFromText('AB12-cdEF', lower)).toBe('ab12cdef')
  })

  it('keeps the letters as they are without a case, or with one that is not upper or lower', () => {
    expect(maskFromText('Ad-232-dA', parseMask('AA-___-AA'))).toBe('Ad232dA')
    expect(maskFromText('Ad-232-dA', parseMask('AA-___-AA', 'title'))).toBe('Ad232dA')
    expect(parseMask('AA-___-AA', 'title').letterCase).toBeUndefined()
  })

  it('keeps a letter that has more characters in the other case, because it fills one place', () => {
    expect(maskType('', upper, 'ß')).toBe('ß')
    expect(maskType('', upper, 'é')).toBe('É')
  })

  it('keeps the case when a group is widened', () => {
    expect(widenGroup(upper, 0, 1).letterCase).toBe('upper')
  })
})
