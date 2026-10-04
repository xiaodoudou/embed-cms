import { describe, it, expect } from 'vitest'
import { UNITS, DEFAULT_UNITS, durationOptions, splitDuration, parseDuration, formatDurationInput, durationTemplate, formatDuration, validateDuration, validateDurationText } from '@u/duration'
import { TranslateService } from './helpers/mountField.js'

// The arithmetic and the words of the duration field.

const units = (...names) => UNITS.filter(unit => names.includes(unit.name))
const HM = units('hours', 'minutes')
const DHMS = units('days', 'hours', 'minutes', 'seconds')
const MS = units('minutes', 'seconds')
const HMS = units('hours', 'minutes', 'seconds')

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

describe('parseDuration', () => {
  it.each([
    ['1:30', HM, 5400], ['0:45', HM, 2700], ['10:00', HM, 36000], ['1:90', HM, 9000], ['1:30', MS, 90], ['1:30:05', HMS, 5405], ['1:30', HMS, 90],
    ['1h 30m', HM, 5400], ['1h30m', HM, 5400], ['1 hour 30 minutes', HM, 5400], ['1 hr, 30 min', HM, 5400], ['1.5h', HM, 5400], ['1,5h', HM, 5400], ['90m', HM, 5400],
    ['2d 3h', DHMS, 183600], ['1d 1h 1m 1s', DHMS, 90061], ['45s', MS, 45], ['1小时30分', HM, 5400], ['2天', DHMS, 172800], ['1H 30M', HM, 5400], ['3h 3h', HM, 21600]
  ])('reads %s in %j as %s', (text, which, seconds) => {
    expect(parseDuration(text, which)).toBe(seconds)
  })

  it('takes a number alone in the smallest unit of the field', () => {
    expect(parseDuration('90', HM)).toBe(5400)
    expect(parseDuration('90', units('minutes'))).toBe(5400)
    expect(parseDuration('2', units('days', 'hours'))).toBe(7200)
    expect(parseDuration('45', MS)).toBe(45)
    expect(parseDuration('0', HM)).toBe(0)
    expect(parseDuration('1.5', HM)).toBe(120)
  })

  it('rounds to the smallest unit of the field', () => {
    expect(parseDuration('1h 30s', HM)).toBe(3660)
    expect(parseDuration('29s', HM)).toBe(0)
    expect(parseDuration('30s', HM)).toBe(60)
    expect(parseDuration('1m 20s', units('minutes'))).toBe(60)
  })

  it('has nothing for an empty box', () => {
    for (const text of ['', '   ', null, undefined]) {
      expect(parseDuration(text, HM)).toBeUndefined()
    }
  })

  it.each(['abc', '-5', '1h -5m', '1:2:3:4', '1:', ':30', '1 fortnight', '1h x', 'h', '1..5', '1:30:00'])('refuses %s', (text) => {
    expect(parseDuration(text, HM)).toBeNaN()
  })
})

describe('formatDurationInput and durationTemplate', () => {
  it('writes hours and minutes as a clock, the first part as it is and the others in two digits', () => {
    expect(formatDurationInput(5400, HM)).toBe('1:30')
    expect(formatDurationInput(3600, HM)).toBe('1:00')
    expect(formatDurationInput(300, HM)).toBe('0:05')
    expect(formatDurationInput(100 * 3600, HM)).toBe('100:00')
    expect(formatDurationInput(0, HM)).toBe('0:00')
    expect(formatDurationInput(5405, HMS)).toBe('1:30:05')
    expect(formatDurationInput(90, MS)).toBe('1:30')
  })

  it('writes days, or one unit, with letters, leaving out what is zero', () => {
    expect(formatDurationInput(183600, DHMS)).toBe('2d 3h')
    expect(formatDurationInput(90061, DHMS)).toBe('1d 1h 1m 1s')
    expect(formatDurationInput(5400, units('minutes'))).toBe('90m')
    expect(formatDurationInput(7200, units('days', 'hours'))).toBe('2h')
    expect(formatDurationInput(0, units('days', 'hours'))).toBe('0h')
    expect(formatDurationInput(5400, units('hours', 'seconds'))).toBe('1h 1800s')
  })

  it('writes what it reads back to the same length', () => {
    for (const [seconds, which] of [[5400, HM], [5405, HMS], [90, MS], [183600, DHMS], [5400, units('minutes')], [7200, units('days', 'hours')], [0, HM], [0, DHMS]]) {
      expect(parseDuration(formatDurationInput(seconds, which), which), `${seconds} ${which.map(u => u.name)}`).toBe(seconds)
    }
  })

  it('shows how to write a length, as a clock or with letters', () => {
    expect(durationTemplate(HM)).toBe('h:mm')
    expect(durationTemplate(HMS)).toBe('h:mm:ss')
    expect(durationTemplate(MS)).toBe('m:ss')
    expect(durationTemplate(DHMS)).toBe('0d 0h 0m 0s')
    expect(durationTemplate(units('minutes'))).toBe('0m')
    expect(durationTemplate(units('days', 'hours'))).toBe('0d 0h')
  })
})

describe('validateDurationText', () => {
  const message = (key, params) => TranslateService.get(key, params)

  it('reads the box and checks the length', () => {
    expect(validateDurationText({ min: 900, max: 7200 }, '1:30')).toBe(null)
    expect(validateDurationText({ min: 900, max: 7200 }, '10m')).toBe(message('TL_DURATION_TOO_SHORT', { min: '15m' }))
    expect(validateDurationText({ min: 900, max: 7200 }, '3h')).toBe(message('TL_DURATION_TOO_LONG', { max: '2h' }))
  })

  it('refuses what is not a length, and an empty box when required', () => {
    expect(validateDurationText({}, 'soon')).toBe(message('TL_INVALID_DURATION'))
    expect(validateDurationText({ required: true }, '')).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validateDurationText({}, '')).toBe(null)
    expect(validateDurationText({ required: true }, '0:00')).toBe(null)
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
