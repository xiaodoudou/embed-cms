import { describe, it, expect } from 'vitest'
import { UNITS, DEFAULT_UNITS, durationOptions, splitDuration, parseDuration, durationMask, maskText, maskCaret, maskSeconds, maskDigits, maskType, formatDuration, validateDuration } from '@u/duration'
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

describe('durationMask and maskText', () => {
  it('has a slot for each digit: two for each part of a clock', () => {
    expect(maskText('', durationMask(HM))).toBe('__:__')
    expect(maskText('', durationMask(HMS))).toBe('__:__:__')
    expect(maskText('', durationMask(MS))).toBe('__:__')
  })

  it('writes days and a single unit with their letters, with room for more digits', () => {
    expect(maskText('', durationMask(DHMS))).toBe('___d __h __m __s')
    expect(maskText('', durationMask(units('days', 'hours')))).toBe('___d __h')
    expect(maskText('', durationMask(units('minutes')))).toBe('___m')
    expect(maskText('', durationMask(units('seconds')))).toBe('____s')
    expect(maskText('', durationMask(units('hours', 'seconds')))).toBe('__h ____s')
  })

  it('fills the slots from the left as far as the digits go', () => {
    const mask = durationMask(HM)
    expect(maskText('1', mask)).toBe('1_:__')
    expect(maskText('13', mask)).toBe('13:__')
    expect(maskText('130', mask)).toBe('13:0_')
    expect(maskText('1345', mask)).toBe('13:45')
    expect(maskText('0130', durationMask(DHMS))).toBe('013d 0_h __m __s')
  })

  it('makes the first part as wide as the most of the field, or the length shown, needs', () => {
    expect(maskText('', durationMask(HM, 200 * 3600))).toBe('___:__')
    expect(maskText('', durationMask(HM, 0, 100 * 3600))).toBe('___:__')
    expect(maskText('', durationMask(HM, 8 * 3600))).toBe('__:__')
    expect(maskText('', durationMask(units('minutes'), 8 * 3600))).toBe('___m')
    expect(maskText('', durationMask(units('seconds'), 100000))).toBe('______s')
  })

  it('says where the next digit goes', () => {
    const mask = durationMask(HM)
    expect(maskCaret('', mask)).toBe(0)
    expect(maskCaret('1', mask)).toBe(1)
    expect(maskCaret('13', mask)).toBe(3)
    expect(maskCaret('1345', mask)).toBe(5)
  })
})

describe('maskSeconds and maskDigits', () => {
  it('reads the digits as a length, a part with no digit yet counting as zero', () => {
    const mask = durationMask(HM)
    expect(maskSeconds('0130', mask)).toBe(5400)
    expect(maskSeconds('13', mask)).toBe(13 * 3600)
    expect(maskSeconds('1', mask)).toBe(3600)
    expect(maskSeconds('0', mask)).toBe(0)
    expect(maskSeconds('0099', mask)).toBe(99 * 60)
    expect(maskSeconds('010530', durationMask(HMS))).toBe(3930)
    expect(maskSeconds('100', durationMask(DHMS))).toBe(100 * 86400)
  })

  it('has no length for no digit', () => {
    expect(maskSeconds('', durationMask(HM))).toBeUndefined()
  })

  it('writes a length as the digits of the slots, carried up', () => {
    const mask = durationMask(HM)
    expect(maskDigits(5400, mask)).toBe('0130')
    expect(maskDigits(0, mask)).toBe('0000')
    expect(maskDigits(99 * 60, mask)).toBe('0139')
    expect(maskDigits(100 * 3600, durationMask(HM, 0, 100 * 3600))).toBe('10000')
    expect(maskDigits(5430, durationMask(HMS))).toBe('013030')
    expect(maskDigits(5400, durationMask(units('minutes')))).toBe('090')
    expect(maskDigits(183600, durationMask(units('days', 'hours')))).toBe('00203')
  })

  it('writes what it reads back to the same length', () => {
    for (const [seconds, which] of [[5400, HM], [5430, HMS], [90, MS], [183600, DHMS], [5400, units('minutes')], [7200, units('days', 'hours')], [0, HM], [3700, units('hours', 'seconds')]]) {
      const mask = durationMask(which, 0, seconds)
      expect(maskSeconds(maskDigits(seconds, mask), mask), `${seconds} ${which.map(u => u.name)}`).toBe(seconds)
    }
  })
})

describe('maskType', () => {
  const mask = durationMask(HM)

  it('puts a digit in the next slot, and nothing when the mask is full', () => {
    expect(maskType('', mask, '1')).toBe('1')
    expect(maskType('13', mask, '4')).toBe('134')
    expect(maskType('1345', mask, '6')).toBe('1345')
  })

  it('ends the part being typed with anything that is not a digit, filling it from the left with zeros', () => {
    expect(maskType('1', mask, ':')).toBe('01')
    expect(maskType('1', mask, ' ')).toBe('01')
    expect(maskType('1', mask, 'h')).toBe('01')
    expect(maskType('013', mask, ':')).toBe('0103')
    expect(maskType('0130', mask, ':')).toBe('0130')
  })

  it('does nothing for a part that has no digit yet or is full', () => {
    expect(maskType('', mask, ':')).toBe('')
    expect(maskType('01', mask, ':')).toBe('01')
  })

  it('fills a part of three digits from the left too', () => {
    expect(maskType('1', durationMask(units('minutes')), 'm')).toBe('001')
    expect(maskType('12', durationMask(DHMS), ' ')).toBe('012')
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
