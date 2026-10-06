import { describe, it, expect } from 'vitest'
import { dialCodes, countryOfDigits } from '@u/dialCodes'
import { countryOf, phoneOptions, flagOf, countryName, readPhone, toE164, splitE164, groupDigits, formatPhone, validatePhone, validatePhoneText } from '@u/phone'
import { TranslateService } from './helpers/mountField.js'

// The countries, the reading of what is typed and the words of the phone field.

const message = (key, params) => TranslateService.get(key, params)

describe('the table of calling codes', () => {
  it('has each country once, with a code of digits', () => {
    const codes = dialCodes()
    expect(new Set(codes.map(c => c.iso)).size).toBe(codes.length)
    expect(codes.length).toBeGreaterThan(230)
    for (const country of codes) {
      expect(country.iso, country.iso).toMatch(/^[A-Z]{2}$/)
      expect(country.dial, country.iso).toMatch(/^[1-9]\d{0,3}$/)
    }
  })

  it('has names for every country in the browser', () => {
    for (const { iso } of dialCodes()) {
      expect(countryName(iso, 'en-US'), iso).not.toBe(iso)
    }
  })

  it('is prefix free apart from the North American plan', () => {
    for (const a of dialCodes()) {
      for (const b of dialCodes()) {
        if (a.dial !== b.dial && b.dial.startsWith(a.dial)) {
          expect(a.dial, `${a.iso} ${b.iso}`).toBe('1')
        }
      }
    }
  })
})

describe('countryOfDigits', () => {
  it.each([
    ['442071838750', 'GB', '44'], ['33142685300', 'FR', '33'], ['8613812345678', 'CN', '86'], ['4915112345678', 'DE', '49'], ['61412345678', 'AU', '61'],
    ['12125551234', 'US', '1'], ['14165550100', 'CA', '1'], ['12425551234', 'BS', '1242'], ['18095551234', 'DO', '1809'], ['17875551234', 'PR', '1787'],
    ['79161234567', 'RU', '7'], ['390612345678', 'IT', '39'], ['358401234567', 'FI', '358'], ['97150123456', 'AE', '971'], ['886912345678', 'TW', '886']
  ])('takes %s for %s', (digits, iso, dial) => {
    expect(countryOfDigits(digits)).toEqual({ iso, dial })
  })

  it('says nothing for what starts with no calling code', () => {
    expect(countryOfDigits('0123456789')).toBeUndefined()
    expect(countryOfDigits('')).toBeUndefined()
    expect(countryOfDigits('999123456')).toBeUndefined()
  })
})

describe('phoneOptions', () => {
  it('takes every country by default, and starts with the one of the language of the admin', () => {
    const { countries, country, listed } = phoneOptions({})
    expect(countries.length).toBe(dialCodes().length)
    expect(listed).toBe(false)
    expect(country).toBe('US')
  })

  it('takes the countries the field lists, upper cased and without the ones it does not know, in the order listed', () => {
    const options = phoneOptions({ options: { countries: ['fr', 'DE', 'XX', 'fr', 'GB'] } })
    expect(options.countries).toEqual(['FR', 'DE', 'GB'])
    expect(options.listed).toBe(true)
    expect(options.country).toBe('FR')
  })

  it('starts with the country the field names when it takes it, the first one otherwise', () => {
    expect(phoneOptions({ options: { countries: ['FR', 'DE'], country: 'de' } }).country).toBe('DE')
    expect(phoneOptions({ options: { countries: ['FR', 'DE'], country: 'JP' } }).country).toBe('FR')
  })

  it('keeps every country for a list with none it knows', () => {
    expect(phoneOptions({ options: { countries: ['XX'] } }).listed).toBe(false)
  })
})

describe('flagOf and countryName', () => {
  it('writes the flag as two regional indicator letters', () => {
    expect(flagOf('FR')).toBe('\u{1F1EB}\u{1F1F7}')
    expect(flagOf('US')).toBe('\u{1F1FA}\u{1F1F8}')
  })

  it('names the country in the language, the code when it cannot', () => {
    expect(countryName('FR', 'en-US')).toBe('France')
    expect(countryName('DE', 'zh-CN')).toBe('德国')
    expect(countryName('FR', 'not a tag!')).toBe('FR')
  })
})

describe('readPhone', () => {
  it('reads a national number as written, whatever separates the digits', () => {
    expect(readPhone('020 7183 8750', 'GB')).toEqual({ iso: 'GB', national: '2071838750' })
    expect(readPhone('(212) 555-0123', 'US')).toEqual({ iso: 'US', national: '2125550123' })
    expect(readPhone('06.12.34.56.78', 'FR')).toEqual({ iso: 'FR', national: '612345678' })
    expect(readPhone('2071838750', 'GB')).toEqual({ iso: 'GB', national: '2071838750' })
  })

  it('leaves out the 0 a national number starts with, except where it belongs to the number', () => {
    expect(readPhone('0612345678', 'FR').national).toBe('612345678')
    expect(readPhone('06 1234 5678', 'IT').national).toBe('0612345678')
    expect(readPhone('0612345678', 'SM').national).toBe('0612345678')
  })

  it('takes the country from a number written with its code', () => {
    expect(readPhone('+44 20 7183 8750', 'US')).toEqual({ iso: 'GB', national: '2071838750' })
    expect(readPhone('0044 20 7183 8750', 'US')).toEqual({ iso: 'GB', national: '2071838750' })
    expect(readPhone('+1 416 555 0100', 'US')).toEqual({ iso: 'CA', national: '4165550100' })
    expect(readPhone('+1 242 555 1234', 'US')).toEqual({ iso: 'BS', national: '5551234' })
    expect(readPhone('+33 (0)1 42 68 53 00', 'US')).toEqual({ iso: 'FR', national: '142685300' })
    expect(readPhone('+39 06 1234 5678', 'US')).toEqual({ iso: 'IT', national: '0612345678' })
  })

  it('has no number yet for a sign alone, and nothing for an empty box', () => {
    expect(readPhone('+', 'US')).toEqual({ iso: 'US', national: '' })
    expect(readPhone('', 'US')).toBeUndefined()
    expect(readPhone('   ', 'US')).toBeUndefined()
    expect(readPhone(null, 'US')).toBeUndefined()
  })

  it.each(['abc', '12ab34', '1-800-FLOWERS', '+999 12345', '+4+4', '12#34', '5 5 5 *'])('refuses %s', (text) => {
    expect(readPhone(text, 'US')).toBeNull()
  })
})

describe('toE164 and splitE164', () => {
  it('writes the international form of a country and a national number', () => {
    expect(toE164('GB', '2071838750')).toBe('+442071838750')
    expect(toE164('BS', '5551234')).toBe('+12425551234')
    expect(toE164('GB', '')).toBeUndefined()
    expect(toE164('XX', '123')).toBeUndefined()
  })

  it('splits an international number into its country and national number', () => {
    expect(splitE164('+442071838750')).toEqual({ iso: 'GB', dial: '44', national: '2071838750' })
    expect(splitE164('+12425551234')).toEqual({ iso: 'BS', dial: '1242', national: '5551234' })
    expect(splitE164('+14165550100')).toEqual({ iso: 'CA', dial: '1', national: '4165550100' })
  })

  it.each([undefined, null, '', 12, '442071838750', '+0442071838750', '+44207', '+4420718387501234', '+44 2071838750', '+4420718387a0', '+999123456789'])('does not split %s', (value) => {
    expect(splitE164(value)).toBeUndefined()
  })
})

describe('groupDigits and formatPhone', () => {
  it('groups the digits to be read', () => {
    expect(groupDigits('2071838750')).toBe('207 183 8750')
    expect(groupDigits('612345678')).toBe('612 345 678')
    expect(groupDigits('12345678')).toBe('1234 5678')
    expect(groupDigits('1234567')).toBe('123 4567')
    expect(groupDigits('123')).toBe('123')
    expect(groupDigits('1234567890123')).toBe('1234 5678 9012 3')
  })

  it('writes an international number with its code and the digits in groups', () => {
    expect(formatPhone('+442071838750')).toBe('+44 207 183 8750')
    expect(formatPhone('+12125550123')).toBe('+1 212 555 0123')
  })

  it('writes what is not an international number as it is, and nothing for nothing', () => {
    expect(formatPhone('0207 183')).toBe('0207 183')
    expect(formatPhone(undefined)).toBe('')
    expect(formatPhone('')).toBe('')
  })
})

describe('validatePhone', () => {
  it('says when a required number is missing', () => {
    expect(validatePhone({ required: true }, undefined)).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validatePhone({ required: true }, '')).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validatePhone({}, undefined)).toBeNull()
  })

  it('refuses what is not an international number', () => {
    for (const bad of ['12345', '+0123456789', 12, '+44 2071838750', '+44207']) {
      expect(validatePhone({}, bad), String(bad)).toBe(message('TL_INVALID_PHONE'))
    }
    expect(validatePhone({}, '+442071838750')).toBeNull()
  })

  it('refuses a country the field does not take', () => {
    const schema = { options: { countries: ['FR', 'DE'] } }
    expect(validatePhone(schema, '+33142685300')).toBeNull()
    expect(validatePhone(schema, '+442071838750')).toBe(message('TL_PHONE_COUNTRY'))
  })
})

describe('validatePhoneText', () => {
  it('reads the box in the country that is chosen and checks it', () => {
    expect(validatePhoneText({}, '020 7183 8750', 'GB')).toBeNull()
    expect(validatePhoneText({ options: { countries: ['FR'] } }, '+44 20 7183 8750', 'FR')).toBe(message('TL_PHONE_COUNTRY'))
  })

  it('refuses text that is not a number, a number too short, and an empty box when required', () => {
    expect(validatePhoneText({}, 'abc', 'GB')).toBe(message('TL_INVALID_PHONE'))
    expect(validatePhoneText({}, '12', 'GB')).toBe(message('TL_INVALID_PHONE'))
    expect(validatePhoneText({ required: true }, '', 'GB')).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validatePhoneText({}, '', 'GB')).toBeNull()
  })
})

describe('countryOf', () => {
  it('finds a country of the table', () => {
    expect(countryOf('FR')).toMatchObject({ iso: 'FR', dial: '33' })
    expect(countryOf('XX')).toBeUndefined()
  })
})
