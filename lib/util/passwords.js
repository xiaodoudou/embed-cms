const crypto = require('crypto')
const { promisify } = require('util')

const scrypt = promisify(crypto.scrypt)
const pbkdf2 = promisify(crypto.pbkdf2)

// scrypt cost: N=2^15, r=8, p=1 needs 32 MiB and about 70 ms on a current core
const SCRYPT_DEFAULTS = Object.freeze({ N: 32768, r: 8, p: 1, keyLength: 32 })
// a stored hash comes from the database (and from replication peers): its cost parameters are bounded
const LIMITS = Object.freeze({ maxWork: 1 << 21, maxP: 16, maxKeyLength: 128 })
const PREFIX = '$scrypt$v=1$'

/**
 * @param {number} n
 * @returns {boolean} (the cost N of scrypt has to be one)
 */
const isPowerOfTwo = (n) => Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0

/**
 * Historic hash: PBKDF2-HMAC-SHA1, 100 iterations, 512 bytes as hex, no marker.
 * @param {string} password
 * @param {string} salt
 * @returns {Promise<string>}
 */
const legacyHash = async (password, salt) => (await pbkdf2(password, salt, 100, 512, 'sha1')).toString('hex')

/**
 * @param {string} stored
 * @returns {{scheme: 'legacy'}|{scheme: 'scrypt', params: {N: number, r: number, p: number, keyLength: number}, digest: Buffer}|null}
 *   null for a value that is neither a legacy hash nor a well formed scrypt hash within the cost limits
 */
function parse (stored) {
  if (typeof stored !== 'string' || !stored) {
    return null
  }
  if (!stored.startsWith('$')) {
    return { scheme: 'legacy' }
  }
  if (!stored.startsWith(PREFIX)) {
    return null
  }
  const [paramText, digestText, ...rest] = stored.slice(PREFIX.length).split('$')
  if (rest.length || !paramText || !digestText) {
    return null
  }
  const values = {}
  for (const part of paramText.split(',')) {
    const [key, value] = part.split('=')
    values[key] = Number(value)
  }
  const digest = Buffer.from(digestText, 'base64url')
  const params = { N: values.N, r: values.r, p: values.p, keyLength: digest.length }
  const valid = isPowerOfTwo(params.N) && Number.isInteger(params.r) && params.r > 0 && Number.isInteger(params.p) && params.p > 0 &&
    params.N * params.r <= LIMITS.maxWork && params.p <= LIMITS.maxP && params.keyLength >= 16 && params.keyLength <= LIMITS.maxKeyLength
  return valid ? { scheme: 'scrypt', params, digest } : null
}

/**
 * @param {string} password
 * @param {Buffer} salt
 * @param {{N: number, r: number, p: number, keyLength: number}} params
 * @returns {Buffer} the digest, the memory limit set from the parameters
 */
const scryptDigest = (password, salt, { N, r, p, keyLength }) => scrypt(password, salt, keyLength, { N, r, p, maxmem: 256 * N * r + 128 * r * p })

/**
 * Hashes a password.
 * @param {string} password
 * @param {object} [options]
 * @param {'legacy'|'scrypt'} [options.scheme]
 * @param {string} [options.salt] - reuse a salt (verification of a legacy hash); a random one otherwise
 * @param {object} [options.params] - scrypt cost overrides
 * @returns {Promise<{salt: string, hash: string}>}
 */
async function hash (password, { scheme = 'legacy', salt, params } = {}) {
  if (scheme === 'scrypt') {
    const cost = { ...SCRYPT_DEFAULTS, ...params }
    salt = salt || crypto.randomBytes(16).toString('base64')
    const digest = await scryptDigest(password, salt, cost)
    return { salt, hash: `${PREFIX}N=${cost.N},r=${cost.r},p=${cost.p}$${digest.toString('base64url')}` }
  }
  salt = salt || crypto.randomBytes(128).toString('base64')
  return { salt, hash: await legacyHash(password, salt) }
}

/**
 * @param {Buffer} a
 * @param {Buffer} b
 * @returns {boolean} whether they are the same, in constant time
 */
const equal = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b)

/**
 * Checks a password against a stored hash, whatever scheme wrote it.
 * @param {string} password
 * @param {string} stored - the stored hash
 * @param {string} salt - the stored salt
 * @returns {Promise<{ok: boolean, scheme?: string, params?: object}>}
 */
async function verify (password, stored, salt) {
  const parsed = parse(stored)
  if (!parsed || typeof password !== 'string' || typeof salt !== 'string') {
    return { ok: false }
  }
  if (parsed.scheme === 'legacy') {
    const candidate = await legacyHash(password, salt)
    return { ok: equal(Buffer.from(candidate), Buffer.from(stored)), scheme: 'legacy' }
  }
  const candidate = await scryptDigest(password, salt, parsed.params)
  return { ok: equal(candidate, parsed.digest), scheme: 'scrypt', params: parsed.params }
}

/**
 * Whether a successfully verified hash should be replaced by one in the wanted scheme.
 * @param {{scheme?: string, params?: object}} verified - the result of verify()
 * @param {'legacy'|'scrypt'} wanted
 * @returns {boolean}
 */
function needsRehash (verified, wanted) {
  if (wanted !== 'scrypt') {
    return false
  }
  if (verified.scheme !== 'scrypt') {
    return true
  }
  const { N, r, p } = verified.params
  return N < SCRYPT_DEFAULTS.N || r < SCRYPT_DEFAULTS.r || p < SCRYPT_DEFAULTS.p
}

/**
 * Spends the time of a verification without a stored hash, so a login for an unknown account takes as long as one
 * for a known account.
 * @param {string} password
 * @param {'legacy'|'scrypt'} scheme
 * @returns {Promise<void>}
 */
async function burn (password, scheme) {
  await hash(typeof password === 'string' ? password : '', { scheme })
}

module.exports = { hash, verify, parse, needsRehash, burn }
