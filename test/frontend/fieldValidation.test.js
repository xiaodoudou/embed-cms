import { describe, it, expect } from 'vitest'
import { validateFieldValue, toStoredNumber, toRegExp, regexRule } from '../../src/utils/fieldValidation.js'

const field = (input, extra = {}) => ({ input, model: 'f', ...extra })

describe('validateFieldValue: required and empty values', () => {
  it('flags an empty required field, passes an empty optional one', () => {
    expect(validateFieldValue(field('string', { required: true }), '')).toBeTruthy()
    expect(validateFieldValue(field('string', { required: true }), undefined)).toBeTruthy()
    expect(validateFieldValue(field('string'), '')).toBeNull()
    expect(validateFieldValue(field('url'), '')).toBeNull()
    expect(validateFieldValue(field('email'), undefined)).toBeNull()
    expect(validateFieldValue(field('integer'), null)).toBeNull()
  })

  it('treats 0 and false-like numbers as real answers', () => {
    expect(validateFieldValue(field('number', { required: true }), 0)).toBeNull()
  })
})

describe('validateFieldValue: text', () => {
  it('enforces min and max length', () => {
    const rule = field('string', { min: 3, max: 5 })
    expect(validateFieldValue(rule, 'ab')).toBeTruthy()
    expect(validateFieldValue(rule, 'abc')).toBeNull()
    expect(validateFieldValue(rule, 'abcde')).toBeNull()
    expect(validateFieldValue(rule, 'abcdef')).toBeTruthy()
  })

  it('enforces a regex written as /pattern/', () => {
    const rule = field('string', { regex: { value: '/^[A-Z]{3}\\d{3}$/', description: 'Format: AAA123' } })
    expect(validateFieldValue(rule, 'ABC123')).toBeNull()
    expect(validateFieldValue(rule, 'abc123')).toContain('Format: AAA123')
  })

  it('picks the regex of the locale of a localised field', () => {
    const regex = { enUS: { value: '/^[a-z ]+$/', description: 'lowercase' }, zhCN: { value: '/^[0-9]+$/', description: 'digits' } }
    expect(validateFieldValue(field('string', { localised: true, model: 'name.enUS', regex }), 'abc')).toBeNull()
    expect(validateFieldValue(field('string', { localised: true, model: 'name.enUS', regex }), '123')).toContain('lowercase')
    expect(validateFieldValue(field('string', { localised: true, model: 'name.zhCN', regex }), '123')).toBeNull()
    expect(validateFieldValue(field('string', { localised: true, model: 'name.zhCN', regex }), 'abc')).toContain('digits')
  })

  it('ignores a regex that does not compile instead of throwing', () => {
    expect(toRegExp('/(/')).toBeNull()
    expect(validateFieldValue(field('string', { regex: { value: '/(/' } }), 'x')).toBeNull()
  })

  it('checks the email and url formats', () => {
    expect(validateFieldValue(field('email'), 'a@b.co')).toBeNull()
    expect(validateFieldValue(field('email'), 'not an email')).toBeTruthy()
    expect(validateFieldValue(field('url'), 'https://example.com/a')).toBeNull()
    expect(validateFieldValue(field('url'), 'example')).toBeTruthy()
  })

  it('reads the regex rule from the field or from the locale', () => {
    expect(regexRule(field('string'))).toBeNull()
    expect(regexRule(field('string', { regex: { value: '/a/' } }))).toEqual({ value: '/a/' })
  })
})

describe('validateFieldValue: numbers', () => {
  it('enforces min and max', () => {
    const rule = field('integer', { min: 0, max: 100 })
    expect(validateFieldValue(rule, 50)).toBeNull()
    expect(validateFieldValue(rule, '50')).toBeNull()
    expect(validateFieldValue(rule, 150)).toBeTruthy()
    expect(validateFieldValue(rule, -1)).toBeTruthy()
  })

  it('rejects decimals for an integer and text for any number', () => {
    expect(validateFieldValue(field('integer'), 1.5)).toBeTruthy()
    expect(validateFieldValue(field('double'), 1.5)).toBeNull()
    expect(validateFieldValue(field('number'), 'abc')).toBeTruthy()
  })
})

describe('toStoredNumber', () => {
  it('stores numbers as numbers, nothing when empty, and keeps text that is not a number', () => {
    expect(toStoredNumber('12.5')).toBe(12.5)
    expect(toStoredNumber('0')).toBe(0)
    expect(toStoredNumber('')).toBeUndefined()
    expect(toStoredNumber('abc')).toBe('abc')
  })
})
