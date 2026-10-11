import _ from 'lodash'

/**
 * The value of a `token` field, made in the browser: the same options and the same shape as the tokens the server makes
 * (lib/util/token.js), so a token reads alike wherever it was made.
 */

const MIN_BYTES = 8
const MAX_BYTES = 128
const DEFAULT_BYTES = 32
const MAX_PREFIX = 32

/**
 * @param {object} schema the field: its `options` hold `length` (random bytes), `prefix` and `format`
 * @returns {{length: number, prefix: string, format: 'base64url'|'hex', autoGenerate: boolean}} the options made safe
 */
export function tokenOptions (schema) {
  const options = _.get(schema, 'options', {}) || {}
  const length = Number.isInteger(options.length) ? _.clamp(options.length, MIN_BYTES, MAX_BYTES) : DEFAULT_BYTES
  const prefix = _.isString(options.prefix) ? options.prefix.slice(0, MAX_PREFIX) : ''
  const format = options.format === 'hex' ? 'hex' : 'base64url'
  // true: a new record gets a token by itself; otherwise the field waits for one typed, pasted or made with its button
  const autoGenerate = options.autoGenerate === true
  return { length, prefix, format, autoGenerate }
}

/**
 * @param {Uint8Array} bytes
 * @param {'base64url'|'hex'} format
 * @returns {string}
 */
export function encodeBytes (bytes, format) {
  if (format === 'hex') {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * @param {object} schema the field
 * @param {function(Uint8Array): Uint8Array} [fill] fills the bytes with random values; the browser's crypto, unless a test gives its own
 * @returns {string} a new token: the prefix, then the random bytes in the format of the field
 */
export function generateToken (schema, fill = (bytes) => crypto.getRandomValues(bytes)) {
  const { length, prefix, format } = tokenOptions(schema)
  return prefix + encodeBytes(fill(new Uint8Array(length)), format)
}
