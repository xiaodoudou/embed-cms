/**
 * Small persisted UI preferences (row density, sidebar rail, sidebar width). Values are kept in localStorage under
 * `embed-cms.ui.<name>`; a missing, broken or unavailable storage (private mode) simply falls back to the default.
 * The storage is injectable so the logic can be tested without a browser.
 */

const PREFIX = 'embed-cms.ui.'

/** @returns {Storage|null} */
function defaultStorage () {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/**
 * @param {string} name
 * @param {*} fallback
 * @param {Storage|null} storage
 * @returns {*} parsed from JSON; the fallback when absent or unreadable
 */
export function readPreference (name, fallback, storage = defaultStorage()) {
  try {
    const raw = storage ? storage.getItem(PREFIX + name) : null
    return raw === null || raw === undefined ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/**
 * @param {string} name
 * @param {*} value
 * @param {Storage|null} storage
 * @returns {boolean} false when the storage refuses
 */
export function writePreference (name, value, storage = defaultStorage()) {
  try {
    storage.setItem(PREFIX + name, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Reads a preference restricted to a list of allowed values */
export function readChoice (name, allowed, fallback, storage) {
  const value = readPreference(name, fallback, storage)
  return allowed.includes(value) ? value : fallback
}

/** Reads a number preference clamped to [min, max] */
export function readNumber (name, min, max, fallback, storage) {
  const value = Number(readPreference(name, fallback, storage))
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

