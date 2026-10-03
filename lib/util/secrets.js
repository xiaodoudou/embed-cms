const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const _ = require('lodash')

// values that ship in the source (`defaultConfig()` in index.js) and in older documentation
const PUBLISHED_DEFAULTS = new Set(['MdjIwFRi9ezT1234567890abcdef', 'MdjIwFRi9ezT'])
const FILE_NAME = '.secrets.json'
const SECRETS = [
  { path: 'auth.secret', key: 'authSecret', enabled: () => true },
  { path: 'session.secret', key: 'sessionSecret', enabled: () => true }
]

/**
 * @param {*} value - a configured secret
 * @param {number} minLength
 * @returns {boolean} true when the secret is missing, too short or one of the published defaults
 */
function isWeak (value, minLength) {
  const values = _.isArray(value) ? value : [value]
  return values.length === 0 || values.some(item => !_.isString(item) || item.length < minLength || PUBLISHED_DEFAULTS.has(item))
}

/** @returns {string} a new random secret, base64url */
const generate = () => crypto.randomBytes(48).toString('base64url')

/**
 * @param {string} file
 * @returns {object} the secrets kept in the file; {} when there is none or it cannot be read
 */
function readStored (file) {
  try {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'))
    return _.isPlainObject(stored) ? stored : {}
  } catch {
    return {}
  }
}

/**
 * Writes the secrets, readable by the owner only, through a temporary file renamed over it.
 * @param {string} file
 * @param {object} stored
 */
function writeStored (file, stored) {
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(stored, null, 2), { mode: 0o600 })
  fs.renameSync(temporary, file)
}

/**
 * Enforces the secret policy (production, or `security.strongSecrets`): `auth.secret` and `session.secret` must be set, at least
 * `minLength` characters long and not a published default. With `security.generateSecrets` a missing or weak secret
 * is generated once and kept in `<data>/.secrets.json` (readable by the owner only), otherwise boot is refused.
 * Does nothing unless `security.strongSecrets` is on.
 * @param {object} options - CMS options (auth.secret and session.secret are replaced in place, never mutated)
 * @param {object} security - resolved security settings
 * @param {number} minLength
 * @returns {void}
 * @throws {Error} naming the setting that must be fixed
 */
function ensureStrongSecrets (options, security, minLength) {
  if (!security.strongSecrets) {
    return
  }
  const file = path.resolve(options.data, FILE_NAME)
  const stored = security.generateSecrets ? readStored(file) : {}
  let changed = false
  for (const secret of SECRETS) {
    if (!isWeak(_.get(options, secret.path), minLength)) {
      continue
    }
    if (!security.generateSecrets) {
      throw new Error(`config.${secret.path} is missing, shorter than ${minLength} characters or still the published default: set a strong value, or set security.generateSecrets to true to generate one`)
    }
    if (isWeak(stored[secret.key], minLength)) {
      stored[secret.key] = generate()
      changed = true
    }
    const [group, name] = secret.path.split('.')
    options[group] = { ...options[group], [name]: stored[secret.key] }
  }
  if (changed) {
    writeStored(file, stored)
  }
}

module.exports = { ensureStrongSecrets, isWeak }
