/**
 * The admin logs like a product, not like a debugging session: the browser console shows warnings and errors only.
 * The step-by-step messages ("will check data", "adding plugin"...) go through log.debug(), which stays silent unless
 * debugging is switched on:
 *   - in the console:  localStorage.setItem('embed-cms.debug', '1')   (and reload; remove the key to switch it off)
 *   - or for one visit: add ?debug to the address
 */
const KEY = 'embed-cms.debug'

function defaultStorage () {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function defaultSearch () {
  try {
    return typeof window !== 'undefined' ? `${window.location.search}${window.location.hash}` : ''
  } catch {
    return ''
  }
}

export function debugEnabled (storage = defaultStorage(), search = defaultSearch()) {
  try {
    return (storage && storage.getItem(KEY) === '1') || /[?&]debug(=1|=true|&|$)/.test(search)
  } catch {
    return false
  }
}

export const log = {
  debug (...args) {
    if (debugEnabled()) {
      console.debug('[embed-cms]', ...args)
    }
  }
}

