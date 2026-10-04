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

// the names a length can be typed with, by what they are worth in seconds
const WORDS = [
  [86400, /^(d|day|days|天)$/],
  [3600, /^(h|hr|hrs|hour|hours|时|小时|小時)$/],
  [60, /^(m|min|mins|minute|minutes|分|分钟|分鐘)$/],
  [1, /^(s|sec|secs|second|seconds|秒)$/]
]

/**
 * What a length typed in the box is worth, in seconds. The box takes what people write: `1:30` (the colon form, filling the units of the field from the
 * smallest up: `1:30` is 1 h 30 in hours and minutes, 1 min 30 s in minutes and seconds), `1h 30m`, `1 hour 30 minutes`, `1.5h`, `2d 3h`, `1小时30分`, and a
 * number alone (`90`) is in the smallest unit of the field. It is rounded to that unit.
 * @param {string} text
 * @param {Array<{name: string, seconds: number}>} units the units of the field, largest first
 * @returns {number|undefined} the seconds; nothing for an empty box; NaN for what is not a length (a minus sign, a word it does not know, more parts than the field has units)
 */
export function parseDuration (text, units) {
  const raw = _.toLower(_.trim(_.toString(text)))
  if (raw === '') {
    return undefined
  }
  const smallest = _.last(units).seconds
  let total
  if (/^\d+(:\d+)+$/.test(raw)) {
    const parts = raw.split(':')
    if (parts.length > units.length) {
      return NaN
    }
    const first = units.length - parts.length
    total = _.sum(_.map(parts, (part, index) => Number(part) * units[first + index].seconds))
  } else if (/^\d+([.,]\d+)?$/.test(raw)) {
    total = Number(raw.replace(',', '.')) * smallest
  } else if (/^(\s*\d+([.,]\d+)?\s*[^\d\s.,:]+\s*,?)+$/.test(raw)) {
    total = 0
    for (const [, amount, word] of raw.matchAll(/(\d+(?:[.,]\d+)?)\s*([^\d\s.,:]+)/g)) {
      const known = _.find(WORDS, ([, pattern]) => pattern.test(word))
      if (!known) {
        return NaN
      }
      total += Number(amount.replace(',', '.')) * known[0]
    }
  } else {
    return NaN
  }
  return _.isFinite(total) ? Math.round(total / smallest) * smallest : NaN
}

// the letters of the units, for a length written with letters
const LETTERS = { days: 'd', hours: 'h', minutes: 'm', seconds: 's' }

/**
 * @param {Array<{name: string}>} units
 * @returns {boolean} the units follow each other (hours, minutes; minutes, seconds; hours, minutes, seconds) and have no days: they are written as a clock, 01:30
 */
function isClock (units) {
  const names = _.map(units, 'name')
  return units.length >= 2 && !_.includes(names, 'days') && _.every(names, (name, index) => index === 0 || UNITS[_.findIndex(UNITS, { name }) - 1].name === names[index - 1])
}

// how many digits the first part has when nothing says more: a clock has two (__:__), a unit alone or days a few more (___m, ___d __h)
const FIRST_WIDTH = { days: 3, hours: 3, minutes: 3, seconds: 4 }
const MAX_WIDTH = 6

/**
 * The mask of the box, `__:__`: a slot for each digit of each unit. The units after the first have the digits their size needs (two for minutes
 * after hours, four for seconds after hours); the first has as many as the field's most, or the length shown, needs, and at least what is usual.
 * @param {Array<{name: string, seconds: number}>} units
 * @param {number} [max] the most the field takes, in seconds
 * @param {number} [shown] the length shown, in seconds, which the first part must be wide enough for
 * @returns {{units: Array<Object>, clock: boolean, widths: number[], letters: string[], size: number}} the units, how they are written, the digits of each and of all
 */
export function durationMask (units, max = 0, shown = 0) {
  const clock = isClock(units)
  const first = units[0]
  const wanted = String(Math.floor(Math.max(max || 0, shown || 0) / first.seconds)).length
  const usual = clock || (units.length > 1 && first.name !== 'days') ? 2 : FIRST_WIDTH[first.name]
  const widths = _.map(units, (unit, index) => index === 0 ? Math.min(MAX_WIDTH, Math.max(usual, wanted)) : String(Math.floor(units[index - 1].seconds / unit.seconds) - 1).length)
  return { units, clock, widths, letters: _.map(units, unit => LETTERS[unit.name]), size: _.sum(widths) }
}

/**
 * @param {string} digits the digits typed, in the order of the slots
 * @param {Object} mask
 * @returns {string} the mask filled as far as the digits go: `13:__`, `__d __h`
 */
export function maskText (digits, mask) {
  let at = 0
  const parts = _.map(mask.widths, (width) => {
    const part = _.padEnd(digits.slice(at, at + width), width, '_')
    at += width
    return part
  })
  return mask.clock ? parts.join(':') : _.map(parts, (part, index) => part + mask.letters[index]).join(' ')
}

/**
 * @param {string} digits
 * @param {Object} mask
 * @returns {number} where the next digit goes in the text of the mask: the first empty slot, or the end
 */
export function maskCaret (digits, mask) {
  const index = maskText(digits, mask).indexOf('_')
  return index === -1 ? maskText(digits, mask).length : index
}

/**
 * @param {string} digits
 * @param {Object} mask
 * @returns {number|undefined} what the digits are worth in seconds, a part with no digit yet counting as zero; nothing for no digit
 */
export function maskSeconds (digits, mask) {
  if (digits === '') {
    return undefined
  }
  let at = 0
  return _.sum(_.map(mask.units, (unit, index) => {
    const part = digits.slice(at, at + mask.widths[index])
    at += mask.widths[index]
    return part === '' ? 0 : Number(part) * unit.seconds
  }))
}

/**
 * @param {number} seconds
 * @param {Object} mask made for this length
 * @returns {string} the digits of the length, every slot filled (5400 is `0130`), carried up: 99 minutes are `0139`
 */
export function maskDigits (seconds, mask) {
  const parts = splitDuration(seconds, mask.units)
  return _.map(mask.units, (unit, index) => _.padStart(String(parts[unit.name]), mask.widths[index], '0')).join('')
}

/**
 * @param {string} digits
 * @param {Object} mask
 * @param {string} key what was typed: a digit goes into the next slot (when there is one), anything else (`:`, a space, a letter) ends the part that is being typed, which is
 *   filled from the left with zeros (`1` and `:` make `01`)
 * @returns {string} the digits after it
 */
export function maskType (digits, mask, key) {
  if (/^\d$/.test(key)) {
    return digits.length < mask.size ? digits + key : digits
  }
  let at = 0
  for (const width of mask.widths) {
    if (digits.length < at + width) {
      const typed = digits.length - at
      return typed > 0 ? digits.slice(0, at) + _.repeat('0', width - typed) + digits.slice(at) : digits
    }
    at += width
  }
  return digits
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
