import { describe, it, expect } from 'vitest'
import { DEFAULT_CURRENCIES, isCurrency, moneyOptions, currencyDigits, roundAmount, parseAmount, formatAmountInput, normaliseMoney, formatMoney, currencyName, validateMoney, validateAmountText } from '@u/money'
import { TranslateService } from './helpers/mountField.js'

// The arithmetic and the words of the money field.

const message = (key, params) => TranslateService.get(key, params)

describe('isCurrency', () => {
  it('takes a code of three upper case letters that the browser knows', () => {
    expect(isCurrency('EUR')).toBe(true)
    expect(isCurrency('JPY')).toBe(true)
    expect(isCurrency('eur')).toBe(false)
    expect(isCurrency('EURO')).toBe(false)
    expect(isCurrency('AB')).toBe(false)
    expect(isCurrency(undefined)).toBe(false)
    expect(isCurrency(12)).toBe(false)
  })
})

describe('moneyOptions', () => {
  it('offers the common currencies by default, the first being the start', () => {
    const { currencies, fixed } = moneyOptions({})
    expect(currencies).toEqual(DEFAULT_CURRENCIES)
    expect(currencies[0]).toBe('USD')
    expect(fixed).toBe(false)
  })

  it('fixes the currency when there is one, whatever the list says', () => {
    expect(moneyOptions({ options: { currency: 'eur', currencies: ['USD', 'GBP'] } })).toMatchObject({ currencies: ['EUR'], fixed: true })
    expect(moneyOptions({ currency: 'JPY' })).toMatchObject({ currencies: ['JPY'], fixed: true })
  })

  it('takes the list of the field, upper cased and without the codes it does not know or the doubles', () => {
    expect(moneyOptions({ options: { currencies: ['gbp', 'EUR', 'EUR', 'XYZZY', 'nope'] } }).currencies).toEqual(['GBP', 'EUR'])
  })

  it('has one currency fixed also when the list holds one', () => {
    expect(moneyOptions({ options: { currencies: ['CHF'] } })).toMatchObject({ currencies: ['CHF'], fixed: true })
  })

  it('keeps the common currencies for a list with no currency it knows', () => {
    expect(moneyOptions({ options: { currencies: ['nope'] } }).currencies).toEqual(DEFAULT_CURRENCIES)
    expect(moneyOptions({ options: { currency: 'nope' } }).currencies).toEqual(DEFAULT_CURRENCIES)
  })

  it('reads the least and the most, and ignores what is not a number', () => {
    expect(moneyOptions({ min: 5, max: 500 })).toMatchObject({ min: 5, max: 500 })
    expect(moneyOptions({ options: { min: -10 } }).min).toBe(-10)
    expect(moneyOptions({ min: 'low', max: null })).toMatchObject({ min: undefined, max: undefined })
  })
})

describe('currencyDigits and roundAmount', () => {
  it('knows the decimals of a currency', () => {
    expect(currencyDigits('USD')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('KWD')).toBe(3)
  })

  it('rounds the way a person counts', () => {
    expect(roundAmount(1.005, 'USD')).toBe(1.01)
    expect(roundAmount(19.994, 'USD')).toBe(19.99)
    expect(roundAmount(1999.5, 'JPY')).toBe(2000)
    expect(roundAmount(1.2345, 'KWD')).toBe(1.235)
  })

  it('rounds a number written with an exponent', () => {
    expect(roundAmount(1e-7, 'USD')).toBe(0)
  })
})

describe('parseAmount', () => {
  it.each([
    ['19.99', 19.99], ['19,99', 19.99], ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['1 234,56', 1234.56], ['1 234,56', 1234.56],
    ['1,234,567', 1234567], ['1.234.567,89', 1234567.89], ['1,234,567.89', 1234567.89], ['-5', -5], ['-5,5', -5.5], ['+7', 7], ['.5', 0.5], ['5.', 5], ['0', 0], ['12', 12], [' 42 ', 42]
  ])('reads %s as %s', (text, expected) => {
    expect(parseAmount(text, 'en-US')).toBe(expected)
  })

  it('reads one separator with three digits after it as a grouping in the language that groups with it, as a decimal point in another', () => {
    expect(parseAmount('1,234', 'en-US')).toBe(1234)
    expect(parseAmount('1,234', 'de-DE')).toBe(1.234)
    expect(parseAmount('1.234', 'de-DE')).toBe(1234)
    expect(parseAmount('1.234', 'en-US')).toBe(1.234)
  })

  it('reads a separator with other than three digits after it as a decimal point', () => {
    expect(parseAmount('12,5', 'en-US')).toBe(12.5)
    expect(parseAmount('12,50', 'en-US')).toBe(12.5)
    expect(parseAmount('1234,5678', 'en-US')).toBe(1234.5678)
  })

  it('says nothing for an empty box, and a number is what it is', () => {
    expect(parseAmount('', 'en-US')).toBeUndefined()
    expect(parseAmount('   ', 'en-US')).toBeUndefined()
    expect(parseAmount(null, 'en-US')).toBeUndefined()
    expect(parseAmount(12.5)).toBe(12.5)
    expect(parseAmount(NaN)).toBeNaN()
  })

  it.each(['abc', '12abc', '$12', '1,2.3,4', '--5', '5-', '.', ',', '1e5', '1..2'])('refuses %s', (text) => {
    expect(parseAmount(text, 'en-US')).toBeNaN()
  })
})

describe('formatAmountInput', () => {
  it('writes the decimals of the currency, with no grouping', () => {
    expect(formatAmountInput(19.5, 'USD')).toBe('19.50')
    expect(formatAmountInput(1234567.891, 'USD')).toBe('1234567.89')
    expect(formatAmountInput(1999, 'JPY')).toBe('1999')
    expect(formatAmountInput(2, 'KWD')).toBe('2.000')
  })

  it('writes the decimal mark of the language', () => {
    expect(formatAmountInput(19.5, 'EUR', 'de-DE')).toBe('19,50')
  })
})

describe('normaliseMoney', () => {
  it('keeps an amount in a currency and drops the rest', () => {
    expect(normaliseMoney({ amount: 5, currency: 'EUR', extra: 1 })).toEqual({ amount: 5, currency: 'EUR' })
    expect(normaliseMoney({ amount: 0, currency: 'EUR' })).toEqual({ amount: 0, currency: 'EUR' })
    for (const bad of [undefined, null, '', 5, '5', [], {}, { amount: '5', currency: 'EUR' }, { amount: 5 }, { amount: 5, currency: 'eur' }, { amount: NaN, currency: 'EUR' }, { amount: Infinity, currency: 'EUR' }]) {
      expect(normaliseMoney(bad), JSON.stringify(bad)).toBeUndefined()
    }
  })
})

describe('formatMoney', () => {
  it('writes the amount with its currency in the language', () => {
    expect(formatMoney({ amount: 19.99, currency: 'USD' }, 'en-US')).toBe('$19.99')
    expect(formatMoney({ amount: 1999, currency: 'JPY' }, 'en-US')).toBe('¥1,999')
    expect(formatMoney({ amount: 19.99, currency: 'EUR' }, 'de-DE')).toBe('19,99 €')
    expect(formatMoney({ amount: 0, currency: 'USD' })).toBe('$0.00')
  })

  it('is empty without an amount in a currency', () => {
    expect(formatMoney(undefined)).toBe('')
    expect(formatMoney({ amount: 5 })).toBe('')
    expect(formatMoney('5 EUR')).toBe('')
  })
})

describe('currencyName', () => {
  it('names the currency in the language, and gives the code when it cannot', () => {
    expect(currencyName('EUR', 'en-US')).toBe('Euro')
    expect(currencyName('EUR', 'zh-CN')).toBe('欧元')
    expect(currencyName('EUR', 'not a tag!')).toBe('EUR')
  })
})

describe('validateMoney', () => {
  const money = (amount, currency = 'USD') => ({ amount, currency })

  it('says when a required amount is missing, and takes zero as an amount', () => {
    expect(validateMoney({ required: true }, undefined)).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validateMoney({ required: true }, '')).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validateMoney({ required: true }, money(0))).toBeNull()
    expect(validateMoney({}, undefined)).toBeNull()
  })

  it('refuses what is not an amount in a currency', () => {
    for (const bad of ['5', 5, [], {}, { amount: '5', currency: 'USD' }, { amount: 5 }, money(Infinity), money(1e15), money(-1e15)]) {
      expect(validateMoney({}, bad), JSON.stringify(bad)).toBe(message('TL_INVALID_MONEY'))
    }
  })

  it('refuses a currency that the field does not take', () => {
    expect(validateMoney({ options: { currency: 'EUR' } }, money(5, 'USD'))).toBe(message('TL_INVALID_CURRENCY', { currency: 'EUR' }))
    expect(validateMoney({ options: { currencies: ['EUR', 'GBP'] } }, money(5, 'GBP'))).toBeNull()
    expect(validateMoney({}, money(5, 'CHF'))).toBeNull()
  })

  it('takes a negative amount unless the least says otherwise', () => {
    expect(validateMoney({}, money(-5))).toBeNull()
    expect(validateMoney({ min: 0 }, money(-5))).toBe(message('TL_MONEY_TOO_LOW', { min: '$0.00' }))
  })

  it('keeps the amount within the least and the most, written in the currency of the amount', () => {
    const schema = { options: { currencies: ['USD', 'JPY'], min: 5, max: 500 } }
    expect(validateMoney(schema, money(5))).toBeNull()
    expect(validateMoney(schema, money(500))).toBeNull()
    expect(validateMoney(schema, money(4.99))).toBe(message('TL_MONEY_TOO_LOW', { min: '$5.00' }))
    expect(validateMoney(schema, money(500.01))).toBe(message('TL_MONEY_TOO_HIGH', { max: '$500.00' }))
    expect(validateMoney(schema, money(1, 'JPY'))).toBe(message('TL_MONEY_TOO_LOW', { min: '¥5' }))
  })
})

describe('validateAmountText', () => {
  it('reads the box, rounds it to the currency and checks it', () => {
    expect(validateAmountText({}, '19,99', 'USD')).toBeNull()
    expect(validateAmountText({ min: 5 }, '4.999', 'USD')).toBeNull()
    expect(validateAmountText({ min: 5 }, '4.994', 'USD')).toBe(message('TL_MONEY_TOO_LOW', { min: '$5.00' }))
  })

  it('refuses text that is not an amount, and an empty box when required', () => {
    expect(validateAmountText({}, 'abc', 'USD')).toBe(message('TL_INVALID_MONEY'))
    expect(validateAmountText({ required: true }, '', 'USD')).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validateAmountText({}, '', 'USD')).toBeNull()
  })
})
