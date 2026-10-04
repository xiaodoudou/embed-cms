import { describe, it, expect } from 'vitest'
import { UNITS, DEFAULT_UNITS, durationOptions, splitDuration, joinDuration, formatDuration, validateDuration } from '@u/duration'
import { TranslateService } from './helpers/mountField.js'

// The arithmetic and the words of the duration field.

const units = (...names) => UNITS.filter(unit => names.includes(unit.name))
const HM = units('hours', 'minutes')
const DHMS = units('days', 'hours', 'minutes', 'seconds')

describe('durationOptions', () => {
  it('has hours and minutes by default, largest first', () => {
    expect(durationOptions({}).units.map(unit => unit.name)).toEqual(['hours', 'minutes'])
    expect(DEFAULT_UNITS).toEqual(['hours', 'minutes'])
  })

  it('takes the units the field lists, in order of size whatever the order it lists them in', () => {
    expect(durationOptions({ units: ['seconds', 'days'] }).units.map(unit => unit.name)).toEqual(['days', 'seconds'])
    expect(durationOptions({ options: { units: ['minutes'] } }).units.map(unit => unit.name)).toEqual(['minutes'])
  })

  it('keeps the default for a list that has no unit it knows, or is not a list', () => {
    expect(durationOptions({ units: ['fortnights'] }).units.map(unit => unit.name)).toEqual(['hours', 'minutes'])
    expect(durationOptions({ units: [] }).units.map(unit => unit.name)).toEqual(['hours', 'minutes'])
    expect(durationOptions({ units: 'hours' }).units.map(unit => unit.name)).toEqual(['hours', 'minutes'])
  })

  it('reads the least and the most, in seconds, and ignores what is not a length', () => {
    expect(durationOptions({ min: 60, max: 3600 })).toMatchObject({ min: 60, max: 3600 })
    expect(durationOptions({ options: { max: 90 } }).max).toBe(90)
    expect(durationOptions({ min: -5, max: 'long' })).toMatchObject({ min: undefined, max: undefined })
    expect(durationOptions({ min: 0 }).min).toBe(0)
  })
})

describe('splitDuration', () => {
  it('gives the largest unit all it can hold, and the rest to the next', () => {
    expect(splitDuration(5400, HM)).toEqual({ hours: 1, minutes: 30 })
    expect(splitDuration(90061, DHMS)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 })
    expect(splitDuration(0, HM)).toEqual({ hours: 0, minutes: 0 })
  })

  it('lets the largest unit grow past what the next one up would hold', () => {
    expect(splitDuration(100 * 3600, HM)).toEqual({ hours: 100, minutes: 0 })
    expect(splitDuration(90 * 60, units('minutes'))).toEqual({ minutes: 90 })
    expect(splitDuration(2 * 86400 + 3600, units('hours'))).toEqual({ hours: 49 })
  })

  it('rounds what is smaller than the smallest unit into it', () => {
    expect(splitDuration(5430, HM)).toEqual({ hours: 1, minutes: 31 })
    expect(splitDuration(5429, HM)).toEqual({ hours: 1, minutes: 30 })
    expect(splitDuration(59, HM)).toEqual({ hours: 0, minutes: 1 })
  })
})

describe('joinDuration', () => {
  it('adds the units up', () => {
    expect(joinDuration({ hours: '1', minutes: '30' }, HM)).toBe(5400)
    expect(joinDuration({ days: 1, hours: 0, minutes: 0, seconds: 5 }, DHMS)).toBe(86405)
    expect(joinDuration({ hours: '0', minutes: '0' }, HM)).toBe(0)
  })

  it('counts a box that is empty as nothing, and has no duration when all are empty', () => {
    expect(joinDuration({ hours: '2', minutes: '' }, HM)).toBe(7200)
    expect(joinDuration({ hours: '', minutes: '45' }, HM)).toBe(2700)
    expect(joinDuration({ hours: '', minutes: '' }, HM)).toBe(undefined)
    expect(joinDuration({}, HM)).toBe(undefined)
    expect(joinDuration({ hours: null, minutes: '  ' }, HM)).toBe(undefined)
  })

  it('takes more than a unit holds, which the next unit up takes over when the box is left', () => {
    expect(joinDuration({ hours: '0', minutes: '90' }, HM)).toBe(5400)
    expect(splitDuration(joinDuration({ hours: '0', minutes: '90' }, HM), HM)).toEqual({ hours: 1, minutes: 30 })
  })

  it('is not a number for what is not one, or is negative', () => {
    expect(joinDuration({ hours: 'x', minutes: '0' }, HM)).toBeNaN()
    expect(joinDuration({ hours: '-1', minutes: '0' }, HM)).toBeNaN()
  })

  it('keeps whole seconds', () => {
    expect(joinDuration({ hours: '0', minutes: '1.5' }, HM)).toBe(90)
    expect(joinDuration({ hours: '0', minutes: '0.01' }, HM)).toBe(1)
  })
})

describe('formatDuration', () => {
  it('writes the units that are not zero, with their short names', () => {
    expect(formatDuration(5400, HM)).toBe('1h 30m')
    expect(formatDuration(3600, HM)).toBe('1h')
    expect(formatDuration(1800, HM)).toBe('30m')
    expect(formatDuration(90061, DHMS)).toBe('1d 1h 1m 1s')
  })

  it('writes the smallest unit when the length is zero, so that it is not blank', () => {
    expect(formatDuration(0, HM)).toBe('0m')
    expect(formatDuration(0, units('hours'))).toBe('0h')
  })

  it('speaks the language', () => {
    expect(formatDuration(5400, HM, 'zh-CN')).toMatch(/1.*小时.*30.*分/)
  })

  it('has nothing to write for what is not a length', () => {
    for (const value of [undefined, null, 'x', NaN, -5]) {
      expect(formatDuration(value, HM), String(value)).toBe('')
    }
  })
})

describe('validateDuration', () => {
  const message = (key, params) => TranslateService.get(key, params)

  it('says when a required length is missing, and lets an optional one be empty', () => {
    expect(validateDuration({ required: true }, undefined)).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validateDuration({ required: true }, '')).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validateDuration({}, undefined)).toBe(null)
    expect(validateDuration({ required: true }, 0)).toBe(null)
  })

  it('takes a whole number of seconds, from zero', () => {
    expect(validateDuration({}, 5400)).toBe(null)
    for (const value of [-1, 1.5, 'long', NaN, Infinity]) {
      expect(validateDuration({}, value), String(value)).toBe(message('TL_INVALID_DURATION'))
    }
  })

  it('refuses a length under the least and over the most, in the words of the units', () => {
    const schema = { min: 900, max: 7200 }
    expect(validateDuration(schema, 900)).toBe(null)
    expect(validateDuration(schema, 7200)).toBe(null)
    expect(validateDuration(schema, 600)).toBe(message('TL_DURATION_TOO_SHORT', { min: '15m' }))
    expect(validateDuration(schema, 7201)).toBe(message('TL_DURATION_TOO_LONG', { max: '2h' }))
  })
})
