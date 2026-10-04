import { describe, it, expect } from 'vitest'
import Dayjs from 'dayjs'
import { dateRangeOptions, normaliseRange, rangeDays, validateDateRange, formatDateRange } from '@u/dateRange'
import { TranslateService } from './helpers/mountField.js'

// The rules and the words of the daterange field.

const day = (text) => Dayjs(text).startOf('day').valueOf()
const range = (start, end) => ({ start: day(start), end: day(end) })
const message = (key, params) => TranslateService.get(key, params)

describe('dateRangeOptions', () => {
  it('has days and the usual format by default', () => {
    expect(dateRangeOptions({})).toEqual({ time: false, format: 'YYYY/MM/DD', minDate: undefined, maxDate: undefined, minDays: undefined, maxDays: undefined })
  })

  it('has a time, and the format that writes it, when the field says so', () => {
    expect(dateRangeOptions({ options: { time: true } })).toMatchObject({ time: true, format: 'YYYY/MM/DD HH:mm' })
    expect(dateRangeOptions({ time: true, format: 'DD.MM.YYYY HH:mm' }).format).toBe('DD.MM.YYYY HH:mm')
  })

  it('takes the first and the last day as a date, a number or today, at the start of the day', () => {
    expect(dateRangeOptions({ options: { minDate: '2026-10-05', maxDate: '2026-12-31' } })).toMatchObject({ minDate: day('2026-10-05'), maxDate: day('2026-12-31') })
    expect(dateRangeOptions({ minDate: Dayjs('2026-10-05 15:30').valueOf() }).minDate).toBe(day('2026-10-05'))
    expect(dateRangeOptions({ minDate: 'today' }).minDate).toBe(Dayjs().startOf('day').valueOf())
  })

  it('leaves out a day that is not one', () => {
    expect(dateRangeOptions({ minDate: 'someday', maxDate: {} })).toMatchObject({ minDate: undefined, maxDate: undefined })
  })

  it('takes the fewest and the most days as whole numbers from one', () => {
    expect(dateRangeOptions({ options: { minDays: 2, maxDays: 14.9 } })).toMatchObject({ minDays: 2, maxDays: 14 })
    expect(dateRangeOptions({ minDays: 0, maxDays: -3 })).toMatchObject({ minDays: undefined, maxDays: undefined })
    expect(dateRangeOptions({ minDays: 'few' }).minDays).toBeUndefined()
  })
})

describe('normaliseRange', () => {
  it('keeps a start and an end that are moments, and drops the rest', () => {
    expect(normaliseRange({ start: 1, end: 2, extra: 3 })).toEqual({ start: 1, end: 2 })
    for (const bad of [undefined, null, '', 5, [], {}, { start: 1 }, { end: 2 }, { start: '1', end: 2 }, { start: NaN, end: 2 }, { start: 1, end: Infinity }]) {
      expect(normaliseRange(bad), JSON.stringify(bad)).toBeUndefined()
    }
  })
})

describe('rangeDays', () => {
  it('counts the first and the last day', () => {
    expect(rangeDays(range('2026-10-01', '2026-10-01'))).toBe(1)
    expect(rangeDays(range('2026-10-01', '2026-10-03'))).toBe(3)
    expect(rangeDays(range('2026-02-27', '2026-03-02'))).toBe(4)
  })

  it('counts days, not hours, for a range with a time, and through a change of the clock', () => {
    expect(rangeDays({ start: Dayjs('2026-10-01 23:00').valueOf(), end: Dayjs('2026-10-02 01:00').valueOf() })).toBe(2)
    expect(rangeDays(range('2026-03-28', '2026-03-30'))).toBe(3)
    expect(rangeDays(range('2026-10-24', '2026-10-26'))).toBe(3)
  })
})

describe('validateDateRange', () => {
  it('says when a required range is missing, and lets an optional one be empty', () => {
    expect(validateDateRange({ required: true }, undefined)).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validateDateRange({ required: true }, '')).toBe(message('TL_FIELD_IS_REQUIRED'))
    expect(validateDateRange({}, undefined)).toBeNull()
    expect(validateDateRange({}, null)).toBeNull()
  })

  it('accepts a range, and a range of one day', () => {
    expect(validateDateRange({}, range('2026-10-01', '2026-10-05'))).toBeNull()
    expect(validateDateRange({}, range('2026-10-01', '2026-10-01'))).toBeNull()
  })

  it('refuses what is not a start and an end', () => {
    for (const bad of [{ start: day('2026-10-01') }, 'tomorrow', 5, [], { start: 'a', end: 'b' }]) {
      expect(validateDateRange({}, bad), JSON.stringify(bad)).toBe(message('TL_INVALID_DATE_RANGE'))
    }
  })

  it('refuses an end before the start', () => {
    expect(validateDateRange({}, range('2026-10-05', '2026-10-01'))).toBe(message('TL_DATE_RANGE_ORDER'))
  })

  it('refuses a range that starts before the first day of the field or ends after the last', () => {
    const schema = { options: { minDate: '2026-10-05', maxDate: '2026-10-20' } }
    expect(validateDateRange(schema, range('2026-10-05', '2026-10-20'))).toBeNull()
    expect(validateDateRange(schema, range('2026-10-04', '2026-10-10'))).toBe(message('TL_DATE_RANGE_FROM', { date: '2026-10-05' }))
    expect(validateDateRange(schema, range('2026-10-10', '2026-10-21'))).toBe(message('TL_DATE_RANGE_UNTIL', { date: '2026-10-20' }))
  })

  it('takes the last day of a range with a time as the day it falls on', () => {
    const schema = { options: { time: true, maxDate: '2026-10-20' } }
    expect(validateDateRange(schema, { start: Dayjs('2026-10-19 09:00').valueOf(), end: Dayjs('2026-10-20 23:59').valueOf() })).toBeNull()
    expect(validateDateRange(schema, { start: Dayjs('2026-10-19 09:00').valueOf(), end: Dayjs('2026-10-21 00:01').valueOf() })).toBe(message('TL_DATE_RANGE_UNTIL', { date: '2026-10-20' }))
  })

  it('keeps the number of days within the fewest and the most the field says', () => {
    const schema = { options: { minDays: 2, maxDays: 4 } }
    expect(validateDateRange(schema, range('2026-10-01', '2026-10-01'))).toBe(message('TL_DATE_RANGE_TOO_SHORT', { min: 2 }))
    expect(validateDateRange(schema, range('2026-10-01', '2026-10-02'))).toBeNull()
    expect(validateDateRange(schema, range('2026-10-01', '2026-10-04'))).toBeNull()
    expect(validateDateRange(schema, range('2026-10-01', '2026-10-05'))).toBe(message('TL_DATE_RANGE_TOO_LONG', { max: 4 }))
  })
})

describe('formatDateRange', () => {
  it('writes the two days with an arrow, and the time when there is one', () => {
    expect(formatDateRange(range('2026-10-01', '2026-10-05'))).toBe('2026-10-01 → 2026-10-05')
    expect(formatDateRange({ start: Dayjs('2026-10-01 09:30').valueOf(), end: Dayjs('2026-10-01 17:00').valueOf() }, true)).toBe('2026-10-01 09:30 → 2026-10-01 17:00')
  })

  it('is empty for what is not a range', () => {
    expect(formatDateRange(undefined)).toBe('')
    expect(formatDateRange({ start: 1 })).toBe('')
    expect(formatDateRange('2026-10-01')).toBe('')
  })
})
