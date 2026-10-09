import _ from 'lodash'
import { enUS } from 'date-fns/locale/en-US'
import { zhCN } from 'date-fns/locale/zh-CN'

/**
 * The language tag the browser and the date pickers understand, from the name of a locale of the CMS: 'zhCN' is 'zh-CN'.
 * @param {string} locale
 * @returns {string}
 */
export function localeTag (locale) {
  const found = /^([a-z]{2,3})([A-Z]{2})$/.exec(locale || '')
  return found ? `${found[1]}-${found[2]}` : 'en-US'
}

// the calendars the admin can speak: one per language it is translated into
const DATE_LOCALES = { 'en-US': enUS, 'zh-CN': zhCN }

/**
 * The date-fns locale the date pickers need for a locale of the CMS ('zhCN'), English when there is none for it.
 * @param {string} locale
 * @returns {object}
 */
export function datePickerLocale (locale) {
  const tag = localeTag(locale)
  return DATE_LOCALES[tag] || _.find(DATE_LOCALES, (value, key) => key.split('-')[0] === tag.split('-')[0]) || enUS
}

/**
 * The language to show right after a user record is saved: the one just saved, when it is the record of the person who is logged
 * in, is one of the languages of the admin, and differs from the one shown. Anything else is null.
 * @param {string} resource - name of the resource the record belongs to
 * @param {object} record - the saved record
 * @param {object} user - the logged in user (username)
 * @param {string[]} locales - the languages of the admin
 * @param {string} current - the language shown now
 * @returns {string|null}
 */
export function savedUserLanguage (resource, record, user, locales, current) {
  if (resource !== '_users' || !record || !user || !user.username || record.username !== user.username) {
    return null
  }
  return _.includes(locales, record.language) && record.language !== current ? record.language : null
}

