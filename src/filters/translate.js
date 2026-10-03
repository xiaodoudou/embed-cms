import TranslateService from '@s/TranslateService'

/**
 * @param {string} value a translation key
 * @param {string} [locale]
 * @param {Object} [params]
 * @returns {string}
 */
export default function TranslateFilter (value, locale, params) {
  return TranslateService.get(value, locale, params)
}
