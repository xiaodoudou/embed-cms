import _ from 'lodash'
import TranslateService from '@s/TranslateService'

/**
 * One place for the rules of the single-value inputs (text, email, url, number...). Pure apart from the message
 * lookup, so it is tested without a component. Returns null when the value is fine, otherwise the message to show.
 *
 * Rules come from the schema the component receives: `required`, `min` / `max` (length for text, value for numbers),
 * `regex` ({ value, description } or one of those per locale) and the input type.
 */

export const TEXT_INPUTS = ['string', 'text', 'markdown', 'password', 'transliterate', 'email', 'url']
export const NUMBER_INPUTS = ['number', 'integer', 'double']

const EMAIL = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

/**
 * @param {string} key
 * @param {Object} [params]
 * @returns {string}
 */
const t = (key, params) => TranslateService.get(key, params)

/**
 * @param {*} value
 * @returns {boolean} nil or an empty string
 */
export function isEmptyValue (value) {
  return _.isNil(value) || value === ''
}

/** A regex written as `/pattern/flags` or as a bare pattern; null when it does not compile */
export function toRegExp (text) {
  if (!_.isString(text) || text === '') {
    return null
  }
  const fragments = text.match(/^\/(.*)\/([gimsuy]*)$/s)
  try {
    return fragments ? new RegExp(fragments[1], fragments[2].replace('g', '')) : new RegExp(text)
  } catch {
    return null
  }
}

/** The locale a localised field's value belongs to (`title.enUS` -> enUS) */
export function localeOf (schema) {
  return schema.localised ? _.last(String(schema.model || '').split('.')) : undefined
}

/** The regex rule for this field and locale: { value, description } or null */
export function regexRule (schema) {
  const locale = localeOf(schema)
  const rule = (locale && _.get(schema, ['regex', locale, 'value'])) ? _.get(schema, ['regex', locale]) : _.get(schema, 'regex')
  return _.isString(_.get(rule, 'value')) ? rule : null
}

/**
 * @param {Object} schema
 * @param {string} input
 * @param {*} value
 * @returns {true|string}
 */
function checkText (schema, input, value) {
  if (!_.isString(value)) {
    return t('TL_THIS_NOT_TEXT')
  }
  if (!_.isNil(schema.min) && value.length < schema.min) {
    return t('TL_TEXT_TOO_SMALL', { current: value.length, min: schema.min })
  }
  if (!_.isNil(schema.max) && value.length > schema.max) {
    return t('TL_TEXT_TOO_BIG', { current: value.length, max: schema.max })
  }
  if (input === 'email' && !EMAIL.test(value)) {
    return t('TL_INVALID_EMAIL')
  }
  if (input === 'url') {
    try {
      new URL(value)
    } catch {
      return t('TL_INVALID_URL')
    }
  }
  const rule = regexRule(schema)
  const regex = rule && toRegExp(rule.value)
  if (regex && !regex.test(value)) {
    return `${t('TL_INVALID_FORMAT')} (${t(rule.description || rule.value)})`
  }
  return null
}

/**
 * @param {Object} schema
 * @param {string} input
 * @param {*} value a string is parsed
 * @returns {true|string}
 */
function checkNumber (schema, input, value) {
  const number = _.isString(value) ? Number(value.trim()) : value
  if (!_.isNumber(number) || !_.isFinite(number)) {
    return t('TL_INVALID_NUMBER')
  }
  if (input === 'integer' && !_.isInteger(number)) {
    return t('TL_INVALID_INTEGER')
  }
  if (!_.isNil(schema.min) && number < schema.min) {
    return t('TL_NUMBER_TOO_SMALL', { min: schema.min })
  }
  if (!_.isNil(schema.max) && number > schema.max) {
    return t('TL_NUMBER_TOO_BIG', { max: schema.max })
  }
  return null
}

/** A pillbox holds between `min` and `max` tags (an empty optional one is fine; `required` is checked before) */
function checkTags (schema, value) {
  const count = _.isArray(value) ? value.length : 0
  if (!_.isNil(schema.min) && count < schema.min) {
    return t('TL_TAGS_TOO_FEW', { min: schema.min })
  }
  if (!_.isNil(schema.max) && count > schema.max) {
    return t('TL_TAGS_TOO_MANY', { max: schema.max })
  }
  return null
}

/**
 * @param {object} schema the field schema (needs `input`, and `required`, `min`, `max`, `regex` when used)
 * @param {*} value the value being validated
 * @returns {string|null} error message, or null when valid
 */
export function validateFieldValue (schema, value) {
  const input = _.get(schema, 'input')
  if (isEmptyValue(value) || (input === 'pillbox' && _.isEmpty(value))) {
    return schema.required ? t('TL_FIELD_IS_REQUIRED') : null
  }
  if (input === 'pillbox') {
    return checkTags(schema, value)
  }
  if (_.includes(TEXT_INPUTS, input)) {
    return checkText(schema, input, value)
  }
  if (_.includes(NUMBER_INPUTS, input)) {
    return checkNumber(schema, input, value)
  }
  return null
}

/** What a number input stores: a number when the text is one, nothing when empty, the raw text otherwise (so it can be flagged) */
export function toStoredNumber (raw) {
  if (isEmptyValue(raw)) {
    return undefined
  }
  const number = _.isString(raw) ? Number(raw.trim()) : raw
  return _.isFinite(number) ? number : raw
}
