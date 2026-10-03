const _ = require('lodash')

const REDACTED = '********'
const SENSITIVE_KEY = /pass(word|wd)?|secret|token|api[-_]?key|private|credential|oauth|authorization|cookie|keyfile/i

/**
 * @param {string} value a URL
 * @returns {string} with the password of its credentials replaced by the placeholder
 */
const maskUrl = (value) => value.replace(/(\/\/[^/:@\s]+:)[^@\s]+@/, `$1${REDACTED}@`)

/**
 * Copy of a configuration with every secret replaced by a placeholder: values of keys that look like secrets, and
 * the password of a url written as user:password@host.
 * @param {*} value
 * @param {string} [key]
 * @returns {*}
 */
function redactSecrets (value, key = '') {
  if (_.isArray(value)) {
    return value.map(item => redactSecrets(item, key))
  }
  if (_.isPlainObject(value)) {
    return _.mapValues(value, (item, name) => redactSecrets(item, name))
  }
  if (_.isString(value)) {
    return SENSITIVE_KEY.test(key) && value ? REDACTED : maskUrl(value)
  }
  return value
}

/**
 * Puts back the real values where a client sent the placeholder, so saving what was read never overwrites a secret.
 * A placeholder without a stored value is removed.
 * @param {*} incoming - configuration sent by the client
 * @param {*} current - configuration on disk
 * @returns {*}
 */
function restoreSecrets (incoming, current) {
  if (_.isArray(incoming)) {
    return incoming.map((item, index) => restoreSecrets(item, _.get(current, [index])))
  }
  if (_.isPlainObject(incoming)) {
    return _.omitBy(_.mapValues(incoming, (item, name) => restoreSecrets(item, _.get(current, [name]))), value => value === undefined)
  }
  if (_.isString(incoming) && incoming.includes(REDACTED)) {
    if (incoming === REDACTED) {
      return current
    }
    // a masked url: the client sent the placeholder as its password, the rest of the url may have been edited
    const stored = _.isString(current) ? /\/\/[^/:@\s]+:([^@\s]+)@/.exec(current) : null
    return stored ? incoming.replace(REDACTED, stored[1]) : undefined
  }
  return incoming
}

/**
 * The part of the configuration the admin app may read without logging in. Plugin blocks that can hold credentials
 * (`import`, `importFromRemote`, `sync`, `syslog`) are reduced to what the interface needs.
 * @param {object} config - already picked configuration
 * @returns {object}
 */
function publicConfig (config) {
  const result = { ...config }
  ;['import', 'importFromRemote'].forEach(name => {
    if (name in result) {
      result[name] = !!result[name]
    }
  })
  if (_.isPlainObject(result.sync)) {
    result.sync = _.pick(result.sync, ['disablePlugin', 'resources'])
  }
  if (_.isPlainObject(result.syslog)) {
    result.syslog = _.pick(result.syslog, ['method'])
  }
  return redactSecrets(result)
}

module.exports = { redactSecrets, restoreSecrets, publicConfig, REDACTED }
