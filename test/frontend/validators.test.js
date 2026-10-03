import { describe, it, expect } from 'vitest'
import validators from '@u/validators'

const run = (name, value, field = {}) => validators[name](value, field, {})

describe('validators', () => {
  describe('required / empty handling', () => {
    it('required rejects null, undefined and empty string only when the field is required', () => {
      expect(run('required', '', { required: true })).toEqual([validators.resources.fieldIsRequired])
      expect(run('required', null, { required: true })).toEqual([validators.resources.fieldIsRequired])
      expect(run('required', undefined, { required: true })).toEqual([validators.resources.fieldIsRequired])
      expect(run('required', '', { required: false })).toEqual([])
      expect(run('required', 0, { required: true })).toBeNull()
      expect(run('required', false, { required: true })).toBeNull()
    })
    it.each(['number', 'integer', 'double', 'string', 'date', 'regexp', 'email', 'url', 'creditCard', 'alpha', 'alphaNumeric'])('%s treats an empty optional value as valid', (name) => {
      const result = run(name, '', {})
      expect(!result || result.length === 0).toBe(true)
    })
    it.each(['number', 'integer', 'double', 'string', 'date', 'regexp', 'email', 'url', 'creditCard', 'alpha', 'alphaNumeric'])('%s reports an empty required value', (name) => {
      expect(run(name, '', { required: true })).toEqual([validators.resources.fieldIsRequired])
    })
  })

  describe('number', () => {
    it('accepts numbers inside the bounds', () => {
      expect(run('number', 5, { min: 1, max: 10 })).toEqual([])
      expect(run('number', 1, { min: 1 })).toEqual([])
      expect(run('number', 0, { min: 0 })).toEqual([])
    })
    it('reports numbers outside the bounds with the limit in the message', () => {
      expect(run('number', 0, { min: 1 })).toEqual(['The number is too small! Minimum: 1'])
      expect(run('number', 11, { max: 10 })).toEqual(['The number is too big! Maximum: 10'])
    })
    it('rejects values that are not finite numbers', () => {
      expect(run('number', 'abc')).toEqual([validators.resources.invalidNumber])
      expect(run('number', NaN)).toEqual([validators.resources.invalidNumber])
      expect(run('number', Infinity)).toEqual([validators.resources.invalidNumber])
    })
  })

  describe('integer', () => {
    it('accepts integers and rejects fractions', () => {
      expect(run('integer', 4)).toEqual([])
      expect(run('integer', 4.5)).toContain(validators.resources.invalidInteger)
    })
    it('applies the number bounds too', () => {
      expect(run('integer', 20, { max: 10 })).toEqual(['The number is too big! Maximum: 10'])
    })
  })

  describe('double', () => {
    it('accepts numbers and rejects everything else', () => {
      expect(!run('double', 1.5) || run('double', 1.5).length === 0).toBe(true)
      expect(run('double', 'x')).toEqual([validators.resources.invalidNumber])
      expect(run('double', NaN)).toEqual([validators.resources.invalidNumber])
    })
  })

  describe('string', () => {
    it('checks the length bounds', () => {
      expect(run('string', 'abc', { min: 2, max: 5 })).toEqual([])
      expect(run('string', 'a', { min: 2 })).toEqual(['The length of text is too small! Current: 1, Minimum: 2'])
      expect(run('string', 'abcdef', { max: 5 })).toEqual(['The length of text is too big! Current: 6, Maximum: 5'])
    })
    it('rejects non strings', () => {
      expect(run('string', 42)).toEqual([validators.resources.thisNotText])
    })
  })

  describe('array', () => {
    it('requires an array with at least one item when required', () => {
      expect(run('array', 'x', { required: true })).toEqual([validators.resources.thisNotArray])
      expect(run('array', [], { required: true })).toEqual([validators.resources.fieldIsRequired])
      expect(run('array', ['a'], { required: true })).toBeUndefined()
    })
    it('checks the item count bounds', () => {
      expect(run('array', ['a'], { min: 2 })).toEqual(['Select minimum 2 items!'])
      expect(run('array', ['a', 'b', 'c'], { max: 2 })).toEqual(['Select maximum 2 items!'])
      expect(run('array', ['a', 'b'], { min: 1, max: 2 })).toBeUndefined()
    })
    it('accepts a missing value when not required', () => {
      expect(run('array', undefined, {})).toBeUndefined()
    })
  })

  describe('date', () => {
    it('accepts a valid date and rejects garbage', () => {
      expect(run('date', '2024-05-01')).toEqual([])
      expect(run('date', 'not a date')).toEqual([validators.resources.invalidDate])
    })
    it('reports a date before the minimum instead of throwing', () => {
      const result = run('date', '2020-01-01', { min: '2024-01-01' })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatch(/too early/)
    })
    it('reports a date after the maximum instead of throwing', () => {
      const result = run('date', '2030-01-01', { max: '2024-01-01' })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatch(/too late/)
    })
    it('accepts dates on the bounds', () => {
      expect(run('date', '2024-01-01', { min: '2024-01-01', max: '2024-01-01' })).toEqual([])
    })
  })

  describe('regexp', () => {
    it('matches the pattern', () => {
      expect(run('regexp', 'abc123', { pattern: '^[a-z]+\\d+$' })).toBeUndefined()
      expect(run('regexp', 'ABC', { pattern: '^[a-z]+$' })).toEqual([validators.resources.invalidFormat])
    })
    it('accepts anything without a pattern', () => {
      expect(run('regexp', 'whatever', {})).toBeUndefined()
    })
  })

  describe('email', () => {
    it.each(['a@b.co', 'first.last@example.com', 'x+tag@sub.example.org'])('accepts %s', (value) => {
      expect(run('email', value)).toBeUndefined()
    })
    it.each(['plain', 'a@', '@b.com', 'a@b', 'a b@c.com', 'a@b..com'])('rejects %s', (value) => {
      expect(run('email', value)).toEqual([validators.resources.invalidEmail])
    })
  })

  describe('url', () => {
    it.each(['http://example.com', 'https://www.example.org/path?q=1', 'https://sub.example.co.uk/a/b#c'])('accepts %s', (value) => {
      expect(run('url', value)).toBeUndefined()
    })
    it.each(['example.com', 'ftp://example.com', 'http://', 'javascript:alert(1)'])('rejects %s', (value) => {
      expect(run('url', value)).toEqual([validators.resources.invalidURL])
    })
    it('gives the same answer when called repeatedly (no stateful regex)', () => {
      for (let i = 0; i < 4; i++) {
        expect(run('url', 'https://example.com')).toBeUndefined()
      }
    })
  })

  describe('creditCard', () => {
    it('accepts valid card numbers, with separators', () => {
      expect(run('creditCard', '4111 1111 1111 1111')).toBeUndefined()
      expect(run('creditCard', '5555-5555-5555-4444')).toBeUndefined()
    })
    it('rejects a wrong format and a failing checksum', () => {
      expect(run('creditCard', '1234')).toEqual([validators.resources.invalidCard])
      expect(run('creditCard', '4111 1111 1111 1112')).toEqual([validators.resources.invalidCardNumber])
    })
  })

  describe('alpha / alphaNumeric', () => {
    it('alpha allows letters only', () => {
      expect(run('alpha', 'Hello')).toBeUndefined()
      expect(run('alpha', 'Hello1')).toEqual([validators.resources.invalidTextContainNumber])
    })
    it('alphaNumeric allows letters and digits only', () => {
      expect(run('alphaNumeric', 'Hello1')).toBeUndefined()
      expect(run('alphaNumeric', 'Hello 1')).toEqual([validators.resources.invalidTextContainSpec])
      expect(run('alphaNumeric', 'a-b')).toEqual([validators.resources.invalidTextContainSpec])
    })
  })

  describe('locale', () => {
    it('produces a validator with custom messages, falling back to the defaults', () => {
      const custom = validators.number.locale({ numberTooBig: 'Trop grand! Max: {0}' })
      expect(custom(11, { max: 10 }, {})).toEqual(['Trop grand! Max: 10'])
      expect(custom('x', {}, {})).toEqual([validators.resources.invalidNumber])
    })
  })
})
