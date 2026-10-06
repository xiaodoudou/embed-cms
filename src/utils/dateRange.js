import _ from 'lodash'
import Dayjs from 'dayjs'
import TranslateService from '@s/TranslateService'

// The daterange field: a start and an end, kept as `{ start, end }` in milliseconds, the way the date fields keep a moment. A range of days has both at the start of their
// day (the end day is in the range); with a time, each is the moment picked. The rules and the words are here, apart from the widget, so that they are tested without a component.

const DAY = 24 * 60 * 60 * 1000
const FORMAT = 'YYYY/MM/DD'
const FORMAT_WITH_TIME = 'YYYY/MM/DD HH:mm'

/**
 * @param {*} value a moment written in the options of a field: a number of milliseconds, a date (`2026-10-01`), or `today`
 * @returns {number|undefined} the moment, at the start of its day; nothing for what is not one
 */
function momentOf (value) {
  if (value === 'today') {
    return Dayjs().startOf('day').valueOf()
  }
  if (_.isFinite(value)) {
    return Dayjs(value).startOf('day').valueOf()
  }
  const parsed = _.isString(value) ? Dayjs(value) : null
  return parsed && parsed.isValid() ? parsed.startOf('day').valueOf() : undefined
}

/**
 * @param {Object} schema the field
 * @returns {{time: boolean, format: string, minDate: number|undefined, maxDate: number|undefined, minDays: number|undefined, maxDays: number|undefined}} what the field says: whether
 *   it has a time, how it writes a moment, the first and the last day it takes, and the fewest and the most days a range has
 */
export function dateRangeOptions (schema) {
  const read = key => _.get(schema, key, _.get(schema, `options.${key}`))
  const time = read('time') === true
  const days = value => _.isFinite(value) && value >= 1 ? Math.floor(value) : undefined
  return {
    time,
    format: _.isString(read('format')) && read('format') ? read('format') : time ? FORMAT_WITH_TIME : FORMAT,
    minDate: momentOf(read('minDate')),
    maxDate: momentOf(read('maxDate')),
    minDays: days(read('minDays')),
    maxDays: days(read('maxDays'))
  }
}

/**
 * @param {*} value what the record holds
 * @returns {{start: number, end: number}|undefined} the range when it has a start and an end that are moments; nothing otherwise
 */
export function normaliseRange (value) {
  return _.isPlainObject(value) && _.isFinite(value.start) && _.isFinite(value.end) ? { start: value.start, end: value.end } : undefined
}

/**
 * @param {{start: number, end: number}} range
 * @returns {number} how many days it covers, the first and the last included (a range from the 1st to the 3rd is 3 days)
 */
export function rangeDays (range) {
  return Math.round((Dayjs(range.end).startOf('day').valueOf() - Dayjs(range.start).startOf('day').valueOf()) / DAY) + 1
}

/**
 * @param {Object} schema the field
 * @param {*} value what the record holds
 * @returns {string|null} what is wrong with it: missing when required, not a start and an end, an end before the start, a day the field does not take, too few days or too many;
 *   null when it is fine
 */
export function validateDateRange (schema, value) {
  const t = (key, params) => TranslateService.get(key, params)
  if (_.isNil(value) || value === '') {
    return _.get(schema, 'required', false) ? t('TL_FIELD_IS_REQUIRED') : null
  }
  const range = normaliseRange(value)
  if (!range) {
    return t('TL_INVALID_DATE_RANGE')
  }
  if (range.end < range.start) {
    return t('TL_DATE_RANGE_ORDER')
  }
  const { minDate, maxDate, minDays, maxDays } = dateRangeOptions(schema)
  const day = moment => Dayjs(moment).format('YYYY-MM-DD')
  if (!_.isUndefined(minDate) && Dayjs(range.start).startOf('day').valueOf() < minDate) {
    return t('TL_DATE_RANGE_FROM', { date: day(minDate) })
  }
  if (!_.isUndefined(maxDate) && Dayjs(range.end).startOf('day').valueOf() > maxDate) {
    return t('TL_DATE_RANGE_UNTIL', { date: day(maxDate) })
  }
  const days = rangeDays(range)
  if (!_.isUndefined(minDays) && days < minDays) {
    return t('TL_DATE_RANGE_TOO_SHORT', { min: minDays })
  }
  if (!_.isUndefined(maxDays) && days > maxDays) {
    return t('TL_DATE_RANGE_TOO_LONG', { max: maxDays })
  }
  return null
}

/**
 * @param {*} value what the record holds
 * @param {boolean} [time] whether the moments have a time
 * @returns {string} "2026-10-01 → 2026-10-05" (with the time when there is one); empty when it is not a range
 */
export function formatDateRange (value, time = false) {
  const range = normaliseRange(value)
  if (!range) {
    return ''
  }
  const format = time ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'
  return `${Dayjs(range.start).format(format)} → ${Dayjs(range.end).format(format)}`
}
