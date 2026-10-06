import _ from 'lodash'
import TranslateService from '@s/TranslateService'
import { localeTag } from '@u/locale'

// The money field: an amount in a currency, kept as `{ amount, currency }`. The amount is in the major unit of the currency (19.99 for
// USD, 1999 for JPY) and has the decimals the currency has. The arithmetic, the reading of what is typed and the words are here, apart
// from the widget, so that they are tested without a component.

// what the select offers when the field names no currency
export const DEFAULT_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'HKD', 'SGD', 'INR', 'KRW']
// the largest amount that is kept exactly
const LIMIT = 1e15
// an integer written with groups of three digits, and an integer that is plain or grouped, by the character of the grouping
const GROUPED = { '.': /^\d{1,3}(\.\d{3})+$/, ',': /^\d{1,3}(,\d{3})+$/ }
const WHOLE = { '.': /^(\d*|\d{1,3}(\.\d{3})+)$/, ',': /^(\d*|\d{1,3}(,\d{3})+)$/ }

/**
 * @param {*} code
 * @returns {boolean} an ISO 4217 code the browser knows (three letters, upper case)
 */
export function isCurrency (code) {
  if (!_.isString(code) || !/^[A-Z]{3}$/.test(code)) {
    return false
  }
  try {
    return _.isString(new Intl.NumberFormat('en', { style: 'currency', currency: code }).format(0))
  } catch {
    return false
  }
}

/**
 * @param {Object} schema the field
 * @returns {{currencies: string[], fixed: boolean, min: number|undefined, max: number|undefined}} the currencies the field takes (the one
 *   in `currency`, else the ones in `currencies`, else the common ones), and the least and the most it takes, in the major unit
 */
export function moneyOptions (schema) {
  const read = key => _.get(schema, key, _.get(schema, `options.${key}`))
  const upper = code => _.toUpper(_.trim(code))
  const bound = value => (_.isFinite(value) ? value : undefined)
  const one = upper(read('currency'))
  const listed = _.filter(_.uniq(_.map(_.castArray(read('currencies') || []), upper)), isCurrency)
  const currencies = isCurrency(one) ? [one] : listed.length ? listed : DEFAULT_CURRENCIES
  return { currencies, fixed: currencies.length === 1, min: bound(read('min')), max: bound(read('max')) }
}

/**
 * @param {string} currency
 * @returns {number} how many decimals the currency has (2 for USD, 0 for JPY, 3 for KWD)
 */
export function currencyDigits (currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
  } catch {
    return 2
  }
}

/**
 * @param {number} amount
 * @param {string} currency
 * @returns {number} the amount rounded to the decimals of the currency, the way a person counts (1.005 is 1.01)
 */
export function roundAmount (amount, currency) {
  const digits = currencyDigits(currency)
  // (a number written with an exponent, 1e-7, cannot take the exponent of the decimals)
  return /e/i.test(String(amount)) ? Number(amount.toFixed(digits)) : Number(`${Math.round(Number(`${amount}e${digits}`))}e-${digits}`)
}

/**
 * Reads an amount as a person writes it: 19.99, 19,99, 1,234.56, 1.234,56, 1 234,56, -5. A separator that comes last and is not
 * followed by three digits is the decimal point; with both kinds the last one is the decimal point; a single one followed by three
 * digits is a grouping when it is the one the language groups with, a decimal point otherwise.
 * @param {string|number} text
 * @param {string} [locale] the language of the person
 * @returns {number|undefined} the number; nothing when the text is empty; NaN when it is not an amount
 */
export function parseAmount (text, locale = 'en') {
  if (_.isNumber(text)) {
    return _.isFinite(text) ? text : NaN
  }
  // (the spaces, the no-break ones the languages group with too, and the apostrophe the Swiss group with)
  const raw = _.toString(text).replace(/[\s']/g, '')
  if (raw === '') {
    return undefined
  }
  if (!/^[-+]?[\d.,]*\d[\d.,]*$/.test(raw)) {
    return NaN
  }
  const sign = raw.startsWith('-') ? -1 : 1
  const body = raw.replace(/^[-+]/, '')
  const last = Math.max(body.lastIndexOf('.'), body.lastIndexOf(','))
  let integer = body
  let decimals = ''
  if (last !== -1) {
    const mark = body[last]
    const other = mark === '.' ? ',' : '.'
    const others = body.slice(0, last)
    if (GROUPED[mark].test(body) && (body.split(mark).length > 2 || mark === groupSeparator(locale))) {
      // thousands: groups of three digits, all written with the same character
      integer = body.replaceAll(mark, '')
    } else if (WHOLE[other].test(others) && /^\d*$/.test(body.slice(last + 1))) {
      // what comes before the decimal mark is digits, or digits grouped with the other character
      integer = others.replaceAll(other, '')
      decimals = body.slice(last + 1)
    } else {
      return NaN
    }
  }
  const number = Number(`${integer || '0'}${decimals ? `.${decimals}` : ''}`)
  return _.isFinite(number) ? sign * number : NaN
}

/**
 * @param {string} locale
 * @returns {string} the character the language groups thousands with
 */
function groupSeparator (locale) {
  try {
    return _.get(_.find(new Intl.NumberFormat(locale).formatToParts(1000000), { type: 'group' }), 'value', ',')
  } catch {
    return ','
  }
}

/**
 * @param {number} amount
 * @param {string} currency
 * @param {string} [locale]
 * @returns {string} the amount as it is typed in the box: the decimals of the currency, no grouping, the decimal mark of the language
 */
export function formatAmountInput (amount, currency, locale = 'en') {
  const digits = currencyDigits(currency)
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(amount)
  } catch {
    return String(amount)
  }
}

/**
 * @param {*} value what the record holds
 * @returns {{amount: number, currency: string}|undefined} the value when it is an amount in a currency, nothing otherwise
 */
export function normaliseMoney (value) {
  if (_.isPlainObject(value) && _.isFinite(value.amount) && isCurrency(value.currency)) {
    return { amount: value.amount, currency: value.currency }
  }
  return undefined
}

/**
 * @param {{amount: number, currency: string}} value
 * @param {string} [locale] the tag of the language ('en-US')
 * @returns {string} "$19.99", "19,99 €", "¥1,999" in the language; empty when there is no amount
 */
export function formatMoney (value, locale = 'en-US') {
  const money = normaliseMoney(value)
  if (!money) {
    return ''
  }
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(money.amount)
  } catch {
    return `${money.amount} ${money.currency}`
  }
}

/**
 * @param {Object} schema the field
 * @param {*} value what the record holds
 * @returns {string|null} what is wrong with it: not an amount in a currency, a currency the field does not take, less than the field
 *   takes, more than it takes, missing when required; null when it is fine
 */
export function validateMoney (schema, value) {
  const t = (key, params) => TranslateService.get(key, params)
  if (_.isNil(value) || value === '') {
    return _.get(schema, 'required', false) ? t('TL_FIELD_IS_REQUIRED') : null
  }
  const money = normaliseMoney(value)
  if (!money || Math.abs(money.amount) >= LIMIT) {
    return t('TL_INVALID_MONEY')
  }
  const { currencies, min, max } = moneyOptions(schema)
  if (!_.includes(currencies, money.currency)) {
    return t('TL_INVALID_CURRENCY', { currency: _.join(currencies, ', ') })
  }
  const tag = localeTag(TranslateService.locale)
  if (!_.isUndefined(min) && money.amount < min) {
    return t('TL_MONEY_TOO_LOW', { min: formatMoney({ amount: min, currency: money.currency }, tag) })
  }
  if (!_.isUndefined(max) && money.amount > max) {
    return t('TL_MONEY_TOO_HIGH', { max: formatMoney({ amount: max, currency: money.currency }, tag) })
  }
  return null
}

/**
 * @param {Object} schema the field
 * @param {string} text what is typed in the amount box
 * @param {string} currency
 * @returns {string|null} what is wrong with the box (not an amount, outside the limits); null when it is fine
 */
export function validateAmountText (schema, text, currency) {
  const amount = parseAmount(text, localeTag(TranslateService.locale))
  if (_.isNaN(amount)) {
    return TranslateService.get('TL_INVALID_MONEY')
  }
  return validateMoney(schema, _.isUndefined(amount) ? undefined : { amount: roundAmount(amount, currency), currency })
}

/**
 * @param {string} currency
 * @param {string} [locale] the tag of the language
 * @returns {string} the name of the currency in the language ("US Dollar"), its code when the browser has none
 */
export function currencyName (currency, locale = 'en-US') {
  try {
    return new Intl.DisplayNames(locale, { type: 'currency' }).of(currency) || currency
  } catch {
    return currency
  }
}
