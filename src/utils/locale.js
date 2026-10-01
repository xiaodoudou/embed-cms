import _ from 'lodash'

/**
 * The language tag the browser and the date pickers understand, from the name of a locale of the CMS: 'zhCN' is 'zh-CN'.
 * @param {string} locale
 * @returns {string}
 */
export function localeTag (locale) {
  const found = /^([a-z]{2,3})([A-Z]{2})$/.exec(locale || '')
  return found ? `${found[1]}-${found[2]}` : 'en-US'
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

export default { localeTag, savedUserLanguage }
