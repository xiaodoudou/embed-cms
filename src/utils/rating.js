import _ from 'lodash'

// The rating field: a number of icons, filled up to the value. These are the choices of the field and the arithmetic of the widget, kept
// apart from it so that they are tested without a component.

// the icons a rating can be made of: the glyph that is filled and the one that is empty (the same glyph when it has no outline), and the
// token of the colour it is filled with
export const ICONS = {
  star: { full: '$star', empty: '$starOutline', color: 'warning' },
  heart: { full: '$heart', empty: '$heartOutline', color: 'error' },
  thumb: { full: '$thumbUp', empty: '$thumbUpOutline', color: 'primary' },
  flame: { full: '$fire', empty: '$fire', color: 'warning' },
  bolt: { full: '$flash', empty: '$flashOutline', color: 'primary' },
  circle: { full: '$circle', empty: '$circleOutline', color: 'primary' }
}
export const COLORS = ['primary', 'info', 'success', 'warning', 'error']
export const DEFAULT_MAX = 5
export const MAX_LIMIT = 10

/**
 * @param {Object} schema the field
 * @returns {{max: number, half: boolean, icon: string, color: string, clearable: boolean}} what the field says, in range and with the defaults
 */
export function ratingOptions (schema) {
  const options = _.get(schema, 'options', {})
  const read = key => _.get(schema, key, options[key])
  const max = Math.round(Number(read('max')))
  const icon = _.has(ICONS, read('icon')) ? read('icon') : 'star'
  return {
    max: Number.isFinite(max) && max >= 1 ? Math.min(max, MAX_LIMIT) : DEFAULT_MAX,
    half: read('half') === true,
    icon,
    color: _.includes(COLORS, read('color')) ? read('color') : ICONS[icon].color,
    clearable: read('clearable') !== false
  }
}

/**
 * @param {number} max how many icons
 * @param {boolean} half whether a half counts
 * @returns {Array<number>} the values a person can choose, in order (1, 2, 3 or 0.5, 1, 1.5 ...)
 */
export function stepsOf (max, half) {
  return _.times(half ? max * 2 : max, i => half ? (i + 1) / 2 : i + 1)
}

/**
 * @param {*} value what the record holds
 * @param {number} max
 * @param {boolean} half
 * @returns {number|undefined} the value as a rating: a number from 0.5 or 1 to max, rounded to the step; nothing for what is not one (0 is no rating)
 */
export function normaliseRating (value, max, half) {
  const number = _.isString(value) ? Number(value.trim()) : value
  if (!_.isFinite(number) || number <= 0) {
    return undefined
  }
  const step = half ? 0.5 : 1
  return _.clamp(Math.round(number / step) * step, step, max)
}

/**
 * @param {number} index of the icon, from 0
 * @param {number} value the rating that is shown
 * @returns {number} how much of that icon is filled: 0, 0.5 or 1
 */
export function fillOf (index, value) {
  return _.clamp(value - index, 0, 1) >= 1 ? 1 : value - index >= 0.5 ? 0.5 : 0
}

/**
 * @param {number|undefined} value
 * @param {number} max
 * @returns {string} "3.5 / 5", empty without a rating
 */
export function ratingText (value, max) {
  return _.isFinite(value) && value > 0 ? `${_.round(value, 1)} / ${max}` : ''
}
