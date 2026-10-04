import _ from 'lodash'
import TranslateService from '@s/TranslateService'
import { countryOfDigits, dialCodes } from '@u/dialCodes'
import { localeTag } from '@u/locale'

// The phone field: a telephone number kept in the international form (E.164: `+442071838750`), typed as a country and the national number.
// The reading of what is typed, the countries and the words are here, apart from the widget, so that they are tested without a component.

// where the national number starts with a 0 that belongs to it (the Italian numbers); everywhere else a leading 0 is the trunk prefix, which is left out
const KEEP_ZERO = ['39', '378', '379']
// an international number: a sign, then at least seven and at most fifteen digits, the first not a zero
const E164 = /^\+[1-9]\d{6,14}$/

/**
 * @param {string} iso a country, 'FR'
 * @returns {{iso: string, dial: string}|undefined} the country in the table of calling codes
 */
export function countryOf (iso) {
  return _.find(dialCodes(), { iso })
}

/**
 * @param {Object} schema the field
 * @returns {{countries: string[], country: string, listed: boolean}} the countries the field takes (the ones in `countries`, else every one; `listed` when the
 *   field names them), and the one it starts with (`country`, else the one of the language of the admin when it takes it, else the first)
 */
export function phoneOptions (schema) {
  const read = key => _.get(schema, key, _.get(schema, `options.${key}`))
  const known = iso => !!countryOf(iso)
  const asked = _.filter(_.uniq(_.map(_.castArray(read('countries') || []), code => _.toUpper(_.trim(code)))), known)
  const countries = asked.length ? asked : _.map(dialCodes(), 'iso')
  const region = _.last(localeTag(TranslateService.locale).split('-'))
  const wanted = _.find([_.toUpper(_.trim(read('country'))), region, 'US'], iso => _.includes(countries, iso))
  return { countries, country: wanted || countries[0], listed: asked.length > 0 }
}

/**
 * @param {string} iso
 * @returns {string} the flag of the country, two regional indicator letters (a system without flags shows the letters of the country)
 */
export function flagOf (iso) {
  return _.map(iso, letter => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join('')
}

/**
 * @param {string} iso
 * @param {string} [locale] the tag of the language
 * @returns {string} the name of the country in the language, its code when the browser has none
 */
export function countryName (iso, locale = 'en-US') {
  try {
    return new Intl.DisplayNames(locale, { type: 'region' }).of(iso) || iso
  } catch {
    return iso
  }
}

/**
 * Reads what is typed in the box of the national number. A number written with its country (`+44 20 7183 8750`, `0044 20 7183 8750`) says which country it is; one written
 * without is of the country that is chosen, and the 0 that starts a national number (020 7183 8750) is left out.
 * @param {string} text
 * @param {string} iso the country that is chosen
 * @returns {{iso: string, national: string}|null|undefined} the country and the digits of the number; nothing for an empty box; null for what is not a number
 *   (letters, a country code that no country has)
 */
export function readPhone (text, iso) {
  const raw = _.trim(_.toString(text))
  if (raw === '') {
    return undefined
  }
  // spaces, dots, dashes and brackets are how people write a number; anything else is not one
  const body = raw.replace(/[\s.\-()]/g, '')
  const international = /^\+/.test(body) || /^00/.test(body)
  if (!/^\+?\d*$/.test(body)) {
    return null
  }
  const digits = body.replace(/^\+|^00/, '')
  if (international) {
    if (digits === '') {
      return { iso, national: '' }
    }
    const country = countryOfDigits(digits)
    // (a 0 written after the code, +33 (0)1 42 68 53 00, is the trunk prefix too)
    return country ? { iso: country.iso, national: withoutTrunk(country.dial, digits.slice(country.dial.length)) } : null
  }
  return { iso, national: withoutTrunk(_.get(countryOf(iso), 'dial', ''), digits) }
}

/**
 * @param {string} dial the calling code
 * @param {string} national
 * @returns {string} the number without the 0 that is dialled inside the country only, which is not a part of the number (but is, in Italy)
 */
function withoutTrunk (dial, national) {
  return _.includes(KEEP_ZERO, dial) ? national : national.replace(/^0/, '')
}

/**
 * @param {string} iso
 * @param {string} national the digits of the number in the country
 * @returns {string|undefined} the number in the international form; nothing without digits
 */
export function toE164 (iso, national) {
  const country = countryOf(iso)
  return country && national ? `+${country.dial}${national}` : undefined
}

/**
 * @param {*} value what the record holds
 * @returns {{iso: string, national: string, dial: string}|undefined} the country and the national number of an international number; nothing when it is not one
 */
export function splitE164 (value) {
  if (!_.isString(value) || !E164.test(value)) {
    return undefined
  }
  const country = countryOfDigits(value.slice(1))
  return country && { iso: country.iso, dial: country.dial, national: value.slice(1 + country.dial.length) }
}

// how the digits of a national number are grouped to be read, by how many there are
const GROUPS = { 5: [2, 3], 6: [3, 3], 7: [3, 4], 8: [4, 4], 9: [3, 3, 3], 10: [3, 3, 4], 11: [3, 4, 4], 12: [4, 4, 4] }

/**
 * @param {string} national the digits
 * @returns {string} the digits in groups, to be read ("2071 838 750" is not what a country writes, but is easier to read than ten digits); the number is the same
 */
export function groupDigits (national) {
  const sizes = GROUPS[national.length] || (national.length > 12 ? _.times(Math.ceil(national.length / 4), () => 4) : [national.length])
  let at = 0
  return _.map(sizes, (size) => { const part = national.slice(at, at + size); at += size; return part }).filter(Boolean).join(' ')
}

/**
 * @param {*} value what the record holds
 * @returns {string} "+44 207 183 8750"; the value as it is when it is not an international number; empty without one
 */
export function formatPhone (value) {
  if (_.isNil(value) || value === '') {
    return ''
  }
  const parts = splitE164(value)
  return parts ? `+${parts.dial} ${groupDigits(parts.national)}` : _.toString(value)
}

/**
 * @param {Object} schema the field
 * @param {*} value what the record holds
 * @returns {string|null} what is wrong with it: not an international number, a country the field does not take, missing when required; null when it is fine
 */
export function validatePhone (schema, value) {
  const t = (key, params) => TranslateService.get(key, params)
  if (_.isNil(value) || value === '') {
    return _.get(schema, 'required', false) ? t('TL_FIELD_IS_REQUIRED') : null
  }
  const parts = splitE164(value)
  if (!parts) {
    return t('TL_INVALID_PHONE')
  }
  if (!_.includes(phoneOptions(schema).countries, parts.iso)) {
    return t('TL_PHONE_COUNTRY')
  }
  return null
}

/**
 * @param {Object} schema the field
 * @param {string} text what is typed in the box of the number
 * @param {string} iso the country that is chosen
 * @returns {string|null} what is wrong with the box; null when it is fine
 */
export function validatePhoneText (schema, text, iso) {
  const read = readPhone(text, iso)
  if (read === null) {
    return TranslateService.get('TL_INVALID_PHONE')
  }
  return validatePhone(schema, read && toE164(read.iso, read.national))
}
