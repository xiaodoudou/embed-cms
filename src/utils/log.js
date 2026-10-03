/**
 * The admin logs like a product, not like a debugging session: the browser console shows warnings and errors only.
 * The step-by-step messages ("will check data", "adding plugin"...) go through log.debug(), which stays silent unless
 * debugging is switched on:
 *   - in the console:  localStorage.setItem('embed-cms.debug', '1')   (and reload; remove the key to switch it off)
 *   - or for one visit: add ?debug to the address
 */
const KEY = 'embed-cms.debug'

/** @returns {Storage|null} */
function defaultStorage () {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** @returns {string} the query and the hash of the page */
function defaultSearch () {
  try {
    return typeof window !== 'undefined' ? `${window.location.search}${window.location.hash}` : ''
  } catch {
    return ''
  }
}

/**
 * @param {Storage|null} storage
 * @param {string} search
 * @returns {boolean} the key in storage, or ?debug in the url
 */
export function debugEnabled (storage = defaultStorage(), search = defaultSearch()) {
  try {
    return (storage && storage.getItem(KEY) === '1') || /[?&]debug(=1|=true|&|$)/.test(search)
  } catch {
    return false
  }
}

export const log = {
  /** @param {...*} args logged only when debug is on */
  debug (...args) {
    if (debugEnabled()) {
      console.debug('[embed-cms]', ...args)
    }
  }
}

