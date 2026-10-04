import _ from 'lodash'
import TranslateService from '@s/TranslateService'
import { localeTag } from '@u/locale'

// The duration field: a length of time, kept as a number of seconds and typed in the units the field shows (days, hours, minutes,
// seconds). The arithmetic and the words are here, apart from the widget, so that they are tested without a component.

// the units, largest first, and how many seconds each is
export const UNITS = [{ name: 'days', seconds: 86400, intl: 'day' }, { name: 'hours', seconds: 3600, intl: 'hour' }, { name: 'minutes', seconds: 60, intl: 'minute' }, { name: 'seconds', seconds: 1, intl: 'second' }]
export const DEFAULT_UNITS = ['hours', 'minutes']

/**
 * @param {Object} schema the field
 * @returns {{units: Array<{name: string, seconds: number, intl: string}>, min: number|undefined, max: number|undefined}} the units the field shows, largest first (hours and minutes by
 *   default, one at least), and the least and the most it takes, in seconds
 */
export function durationOptions (schema) {
  const read = key => _.get(schema, key, _.get(schema, `options.${key}`))
  const asked = _.isArray(read('units')) ? read('units') : DEFAULT_UNITS
  const units = _.filter(UNITS, unit => _.includes(asked, unit.name))
  const bound = value => _.isFinite(value) && value >= 0 ? value : undefined
  return { units: units.length ? units : _.filter(UNITS, unit => _.includes(DEFAULT_UNITS, unit.name)), min: bound(read('min')), max: bound(read('max')) }
}

/**
 * @param {number} seconds
 * @param {Array<{name: string, seconds: number}>} units what is shown, largest first
 * @returns {Object<string, number>} the number of each unit: the largest takes all it can hold, what is left goes to the next, and the part that
 *   is smaller than the smallest unit is rounded into it
 */
export function splitDuration (seconds, units) {
  const smallest = _.last(units).seconds
  let left = Math.round(seconds / smallest) * smallest
  const parts = {}
  _.each(units, (unit) => {
    parts[unit.name] = Math.floor(left / unit.seconds)
    left -= parts[unit.name] * unit.seconds
  })
  return parts
}

/**
 * @param {Object<string, string|number>} parts what was typed in each unit
 * @param {Array<{name: string, seconds: number}>} units
 * @returns {number|undefined} the seconds they make; nothing when every box is empty; a box that is not a number (or is negative) makes it NaN, so that it is refused
 */
export function joinDuration (parts, units) {
  const typed = _.filter(units, unit => !_.isNil(parts[unit.name]) && String(parts[unit.name]).trim() !== '')
  if (!typed.length) {
    return undefined
  }
  let total = 0
  for (const unit of typed) {
    const number = Number(String(parts[unit.name]).trim())
    if (!_.isFinite(number) || number < 0) {
      return NaN
    }
    total += number * unit.seconds
  }
  return Math.round(total)
}

/**
 * @param {number} seconds
 * @param {Array<{name: string, seconds: number, intl: string}>} units what is shown
 * @param {string} [locale]
 * @returns {string} "1h 30m": each unit that is not zero, with its short name in the language (the smallest unit is shown even when it is zero, so that 0 is not empty)
 */
export function formatDuration (seconds, units, locale = 'en') {
  if (!_.isFinite(seconds) || seconds < 0) {
    return ''
  }
  const parts = splitDuration(seconds, units)
  const shown = _.filter(units, (unit, index) => parts[unit.name] > 0 || (index === units.length - 1 && _.every(units, other => parts[other.name] === 0)))
  return _.map(shown, (unit) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'unit', unit: unit.intl, unitDisplay: 'narrow' }).format(parts[unit.name])
    } catch {
      return `${parts[unit.name]} ${unit.name}`
    }
  }).join(' ')
}

/**
 * @param {Object} schema the field
 * @param {*} value what the record holds
 * @returns {string|null} what is wrong with it: not a length of time, shorter than the field takes, longer than it takes, missing when required; null when it is fine
 */
export function validateDuration (schema, value) {
  const t = (key, params) => TranslateService.get(key, params)
  if (_.isNil(value) || value === '') {
    return _.get(schema, 'required', false) ? t('TL_FIELD_IS_REQUIRED') : null
  }
  if (!_.isFinite(value) || value < 0 || !_.isInteger(value)) {
    return t('TL_INVALID_DURATION')
  }
  const { units, min, max } = durationOptions(schema)
  if (!_.isUndefined(min) && value < min) {
    return t('TL_DURATION_TOO_SHORT', { min: formatDuration(min, units, localeTag(TranslateService.locale)) })
  }
  if (!_.isUndefined(max) && value > max) {
    return t('TL_DURATION_TOO_LONG', { max: formatDuration(max, units, localeTag(TranslateService.locale)) })
  }
  return null
}
