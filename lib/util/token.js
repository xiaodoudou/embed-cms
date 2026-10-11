const crypto = require('crypto')
const _ = require('lodash')

// The random value of a `token` field: what the server writes when a record is created without one. The admin makes
// the same tokens in src/utils/token.js, so a token reads alike wherever it was made.

const MIN_BYTES = 8
const MAX_BYTES = 128
const DEFAULT_BYTES = 32
const MAX_PREFIX = 32

/**
 * The options of a token field, made safe: a length between 8 and 128 random bytes (32 by default), a prefix of at
 * most 32 characters, `base64url` (the default) or `hex`, and whether a new record gets a token by itself (`autoGenerate`, off by default).
 * @param {object} field a field of the schema, with its `options`
 * @returns {{length: number, prefix: string, format: 'base64url'|'hex', autoGenerate: boolean}}
 */
function tokenOptions (field) {
  const options = _.get(field, 'options', {}) || {}
  const length = Number.isInteger(options.length) ? _.clamp(options.length, MIN_BYTES, MAX_BYTES) : DEFAULT_BYTES
  const prefix = _.isString(options.prefix) ? options.prefix.slice(0, MAX_PREFIX) : ''
  const format = options.format === 'hex' ? 'hex' : 'base64url'
  // true: a new record gets a token by itself; otherwise the field waits for one typed, pasted or made with its button
  const autoGenerate = options.autoGenerate === true
  return { length, prefix, format, autoGenerate }
}

/**
 * @param {object} field a field of the schema
 * @returns {string} a new token: the prefix, then the random bytes in the format of the field
 */
function generateToken (field) {
  const { length, prefix, format } = tokenOptions(field)
  return prefix + crypto.randomBytes(length).toString(format)
}

/**
 * Gives a token to every token field with `autoGenerate` that a record leaves empty, before the record is created. A
 * value that is there is kept, so a token can be set on purpose, and a localised value (an object per locale) is left alone.
 * @param {Array<object>} schema the fields of the resource
 * @param {object} record the record about to be created
 * @returns {object} the record
 */
function fillTokens (schema, record) {
  _.each(schema, (field) => {
    if (_.get(field, 'input') !== 'token' || !_.isString(field.field) || !tokenOptions(field).autoGenerate) {
      return
    }
    const value = _.get(record, field.field)
    if (_.isNil(value) || value === '') {
      _.set(record, field.field, generateToken(field))
    }
  })
  return record
}

module.exports = { tokenOptions, generateToken, fillTokens }
