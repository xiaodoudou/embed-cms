import _ from 'lodash'
import TranslateService from '@s/TranslateService'
import { localeTag } from '@u/locale'
import { parseMask, widenGroup } from '@u/mask'

// The duration field: a length of time, kept as a number of seconds and typed in the units the field shows (days, hours, minutes,
// seconds). The arithmetic and the words are here, apart from the widget, so that they are tested without a component.

// the units, largest first, and how many seconds each is
export const UNITS = [{ name: 'days', seconds: 86400, intl: 'day' }, { name: 'hours', seconds: 3600, intl: 'hour' }, { name: 'minutes', seconds: 60, intl: 'minute' }, { name: 'seconds', seconds: 1, intl: 'second' }]
export const DEFAULT_UNITS = ['hours', 'minutes']

/**
 * @param {Object} schema the field
 * @returns {{units: Array<{name: string, seconds: number, intl: string}>, min: number|undefined, max: number|undefined, template: string|undefined}} the units the field shows,
 *   largest first (hours and minutes by default, one at least; the ones its template has parts for), the least and the most it takes, in seconds, and its template
 *   when it gives one that is a template for a length (see readTemplate)
 */
export function durationOptions (schema) {
  const read = key => _.get(schema, key, _.get(schema, `options.${key}`))
  const bound = value => _.isFinite(value) && value >= 0 ? value : undefined
  const given = readTemplate(read('template'), _.isArray(read('units')) ? read('units') : undefined)
  const asked = _.isArray(read('units')) ? read('units') : DEFAULT_UNITS
  const units = given ? given.units : _.filter(UNITS, unit => _.includes(asked, unit.name))
  return { units: units.length ? units : _.filter(UNITS, unit => _.includes(DEFAULT_UNITS, unit.name)), min: bound(read('min')), max: bound(read('max')), template: given ? read('template') : undefined }
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
// the units a template with that many parts is for, when it and the field say nothing else
const UNITS_BY_COUNT = { 1: ['minutes'], 2: ['hours', 'minutes'], 3: ['hours', 'minutes', 'seconds'], 4: ['days', 'hours', 'minutes', 'seconds'] }

/**
 * @param {string|undefined} template what the field says (`options.template`): `__:__`, `__h __m`, `___ min`; the characters are the ones of utils/mask.js, and every slot is a digit
 * @param {Array<string>} [asked] the units the field names, when it does
 * @returns {{mask: Object, units: Array<Object>}|null} the template read, and the unit of each of its parts; nothing when it is not a template for a length (no digit, a
 *   letter or a digit-or-letter slot, more than four parts, or the units the field names are not as many as the parts)
 */
export function readTemplate (template, asked) {
  const mask = parseMask(template)
  if (!mask || mask.groups.length > 4 || _.some(mask.tokens, token => token.slot && token.slot !== 'digit')) {
    return null
  }
  const count = mask.groups.length
  const named = _.filter(UNITS, unit => _.includes(asked, unit.name))
  // the letter that follows each part says its unit (__h __m): d, h, m or s, from the largest down
  const letters = _.map(mask.groups, ({ start, size }) => {
    let at = -1
    let seen = 0
    _.each(mask.tokens, (token, index) => {
      if (token.slot && ++seen === start + size) {
        at = index
      }
    })
    // (a space between the digits and the letter is not in the way: __ d)
    const next = _.find(mask.tokens.slice(at + 1), token => token.slot || token.literal !== ' ')
    return next && next.literal ? _.invert(LETTERS)[_.toLower(next.literal)] : undefined
  })
  const lettered = _.filter(UNITS, unit => _.includes(letters, unit.name))
  const wanted = named.length === count ? named : lettered.length === count && _.every(letters) ? _.map(letters, name => _.find(UNITS, { name })) : _.filter(UNITS, unit => _.includes(UNITS_BY_COUNT[count], unit.name))
  // the units go from the largest to the smallest, one for each part
  return wanted.length === count && _.isEqual(wanted, _.sortBy(wanted, unit => -unit.seconds)) ? { mask, units: wanted } : null
}

/**
 * The mask of the box, `__:__`: a slot for each digit of each unit. The units after the first have the digits their size needs (two for minutes
 * after hours, four for seconds after hours); the first has as many as the field's most, or the length shown, needs, and at least what is usual. A template
 * the field gives (see readTemplate) is the mask, its first part widened when the field's most or the length shown needs more digits.
 * @param {Array<{name: string, seconds: number}>} units
 * @param {number} [max] the most the field takes, in seconds
 * @param {number} [shown] the length shown, in seconds, which the first part must be wide enough for
 * @param {string} [template]
 * @returns {Object} the mask (see utils/mask.js) with the `units` and the digits of each (`widths`)
 */
export function durationMask (units, max = 0, shown = 0, template = undefined) {
  const first = units[0]
  const wanted = String(Math.floor(Math.max(max || 0, shown || 0) / first.seconds)).length
  const given = readTemplate(template, _.map(units, 'name'))
  if (given && given.units.length === units.length) {
    const widened = wanted > given.mask.groups[0].size ? widenGroup(given.mask, 0, Math.min(MAX_WIDTH, wanted) - given.mask.groups[0].size) : given.mask
    return { ...widened, units, widths: _.map(widened.groups, 'size') }
  }
  const clock = isClock(units)
  const usual = clock || (units.length > 1 && first.name !== 'days') ? 2 : FIRST_WIDTH[first.name]
  const widths = _.map(units, (unit, index) => index === 0 ? Math.min(MAX_WIDTH, Math.max(usual, wanted)) : String(Math.floor(units[index - 1].seconds / unit.seconds) - 1).length)
  const slots = _.map(widths, width => _.repeat('_', width))
  const pattern = clock ? slots.join(':') : _.map(slots, (part, index) => part + LETTERS[units[index].name]).join(' ')
  return { ...parseMask(pattern), units, widths }
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
