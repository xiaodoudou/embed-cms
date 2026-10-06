const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const logger = require('../logger')

// The words of the admin: one dictionary per language, a flat object of `TL_KEY: "text"`. The ones that come with the CMS are in its `i18n` folder (English and Chinese). A project adds
// its own in a folder of its own (`./i18n` by default, or the `i18n` option): a file named after the language (`frFR.json`) with the keys it adds or changes. What the admin is given is the
// two put together, so a project says only what is its own, and a language the CMS does not have (`jaJP`) is English for what the project has not translated.

// a language is named like enUS, zhCN, frFR: two or three lower case letters and two capitals
const LOCALE = /^[a-z]{2,3}[A-Z]{2}$/
const BASE = 'enUS'

/**
 * @param {string} file
 * @returns {Object|null} the dictionary in the file; nothing when there is no file, and nothing (the log says why) when it is not a flat object of texts
 */
function readDictionary (file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(text)
    if (!_.isPlainObject(parsed)) {
      throw new Error('it is not an object')
    }
    const texts = _.pickBy(parsed, _.isString)
    if (_.size(texts) !== _.size(parsed)) {
      logger.warn(`${file}: ${_.difference(_.keys(parsed), _.keys(texts)).join(', ')} are not texts and are left out`)
    }
    return texts
  } catch (error) {
    logger.warn(`${file} is not a dictionary of the admin (${error.message}): it is not used`)
    return null
  }
}

/**
 * @param {{builtIn: string, project?: string}} folders the folder of the CMS and, if there is one, the folder of the project
 * @returns {{get: function(string): Object|null}} the dictionaries: `get('frFR')` is English, with what the CMS has in French over it, with what the project has in French over that; nothing for a
 *   name that is not a language, or a language that neither has
 */
function createDictionaries ({ builtIn, project }) {
  const own = project && path.resolve(project) !== path.resolve(builtIn) ? project : null
  const cache = new Map()
  const stamp = (file) => {
    try {
      const stat = fs.statSync(file)
      return `${stat.mtimeMs}:${stat.size}`
    } catch {
      return ''
    }
  }
  return {
    get (locale) {
      if (!LOCALE.test(locale)) {
        return null
      }
      const files = [path.join(builtIn, `${BASE}.json`), path.join(builtIn, `${locale}.json`), own && path.join(own, `${locale}.json`)].filter(Boolean)
      const key = files.map(stamp).join('|')
      const cached = cache.get(locale)
      if (cached && cached.key === key) {
        return cached.dictionary
      }
      const [base, mine, theirs] = files.map(readDictionary)
      const dictionary = mine || theirs ? { ...base, ...mine, ...theirs } : null
      cache.set(locale, { key, dictionary })
      return dictionary
    }
  }
}

module.exports = { createDictionaries, readDictionary, LOCALE }
