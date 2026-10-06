import { describe, it, expect } from 'vitest'
import { choiceItems, choiceOptions, validateChoice } from '@u/choice'
import { TranslateService } from './helpers/mountField.js'

describe('choiceItems', () => {
  it('lists the values of the source, each labelled by itself', () => {
    expect(choiceItems({ source: ['draft', 'review'] })).toEqual([
      { value: 'draft', label: 'draft', description: undefined },
      { value: 'review', label: 'review', description: undefined }
    ])
  })

  it('keeps the numbers as numbers', () => {
    expect(choiceItems({ source: [1, 2.5, 0] }).map(item => item.value)).toEqual([1, 2.5, 0])
    expect(choiceItems({ source: [1, 2] })[0].label).toBe('1')
  })

  it('reads { value, text } as a choice with its text', () => {
    expect(choiceItems({ source: [{ value: 'a', text: 'Alpha' }, { value: 'b' }] }).map(item => item.label)).toEqual(['Alpha', 'b'])
  })

  it('labels a value from the labels of the field, a string or one per language', () => {
    const schema = { source: ['low', 'high'], options: { labels: { low: 'Low', high: { enUS: 'High', zhCN: '高' } } } }
    expect(choiceItems(schema).map(item => item.label)).toEqual(['Low', 'High'])
    expect(choiceItems({ ...schema, locale: 'zhCN' }).map(item => item.label)).toEqual(['Low', '高'])
  })

  it('falls back to the first language there is, and to the value', () => {
    expect(choiceItems({ source: ['a'], locale: 'fr', options: { labels: { a: { enUS: 'A', zhCN: '甲' } } } })[0].label).toBe('A')
    expect(choiceItems({ source: ['a'], options: { labels: { a: 42 } } })[0].label).toBe('a')
  })

  it('reads the labels beside the options as well', () => {
    expect(choiceItems({ source: ['a'], labels: { a: 'Alpha' } })[0].label).toBe('Alpha')
  })

  it('gives each value its description', () => {
    const items = choiceItems({ source: ['free', 'team'], options: { descriptions: { free: 'One person', team: { enUS: 'Ten people', zhCN: '十人' } } } })
    expect(items.map(item => item.description)).toEqual(['One person', 'Ten people'])
    expect(choiceItems({ source: ['team'], locale: 'zhCN', options: { descriptions: { team: { enUS: 'Ten people', zhCN: '十人' } } } })[0].description).toBe('十人')
  })

  it('lists a value once, and leaves out what is not a value', () => {
    expect(choiceItems({ source: ['a', 'b', 'a', '', null, undefined, {}, [], NaN, true, { value: 'c' }, { value: 'b' }] }).map(item => item.value)).toEqual(['a', 'b', 'c'])
  })

  it('reads the list the form gives a field, as values', () => {
    expect(choiceItems({ values: ['a', 'b'] }).map(item => item.value)).toEqual(['a', 'b'])
    expect(choiceItems({ source: 'reference_items', values: ['a'] }).map(item => item.value)).toEqual(['a'])
  })

  it('has no choices for a source that is not a list', () => {
    expect(choiceItems({})).toEqual([])
    expect(choiceItems({ source: 'reference_items' })).toEqual([])
  })
})

describe('choiceOptions', () => {
  it('can be emptied and is a column, by default', () => {
    expect(choiceOptions({ source: ['a'] })).toMatchObject({ clearable: true, inline: false })
  })

  it('cannot be emptied when it is required, whatever the options say', () => {
    expect(choiceOptions({ source: ['a'], required: true }).clearable).toBe(false)
    expect(choiceOptions({ source: ['a'], required: true, options: { clearable: true } }).clearable).toBe(false)
  })

  it('cannot be emptied when the options say so', () => {
    expect(choiceOptions({ source: ['a'], options: { clearable: false } }).clearable).toBe(false)
  })

  it('stands in a row when it says inline', () => {
    expect(choiceOptions({ source: ['a'], options: { inline: true } }).inline).toBe(true)
    expect(choiceOptions({ source: ['a'], options: { inline: 'yes' } }).inline).toBe(false)
  })
})

describe('validateChoice', () => {
  const schema = { source: ['a', 'b', 1] }
  const t = (key, params) => TranslateService.get(key, params)

  it('is fine with nothing, unless required', () => {
    expect(validateChoice(schema, undefined)).toBeNull()
    expect(validateChoice(schema, '')).toBeNull()
    expect(validateChoice({ ...schema, required: true }, undefined)).toBe(t('TL_FIELD_IS_REQUIRED'))
    expect(validateChoice({ ...schema, required: true }, null)).toBe(t('TL_FIELD_IS_REQUIRED'))
  })

  it('is fine with one of the choices', () => {
    expect(validateChoice(schema, 'a')).toBeNull()
    expect(validateChoice(schema, 1)).toBeNull()
  })

  it('refuses a value that is not one of the choices, and says which', () => {
    expect(validateChoice(schema, 'z')).toBe(t('TL_CHOICE_UNKNOWN', { value: 'z' }))
    expect(validateChoice(schema, 'z')).toBe('"z" is not one of the choices')
    expect(validateChoice(schema, '1')).toBe(t('TL_CHOICE_UNKNOWN', { value: '1' }))
    expect(validateChoice({ source: [] }, 'a')).toContain('"a"')
  })
})
