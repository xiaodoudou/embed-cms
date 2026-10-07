// The members of the reading room: their passwords, and who may sign in. The CMS keeps the records; what a password is, and when it counts, is decided here.
const crypto = require('crypto')
const { AsyncLocalStorage } = require('async_hooks')
const { promisify } = require('util')

const scrypt = promisify(crypto.scrypt)

/**
 * @param {string} password
 * @returns {Promise<string>} `scrypt$<salt>$<hash>`: a salted hash that is slow to guess at, so a copy of the database does not give the passwords
 */
async function hashPassword (password) {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(password, salt, 32)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

/**
 * @param {string} password what was typed
 * @param {string} stored what hashPassword made
 * @returns {Promise<boolean>} false for a wrong password and for a value that is not a hash of ours
 */
async function verifyPassword (password, stored) {
  const [scheme, salt, hash, ...rest] = String(stored || '').split('$')
  if (scheme !== 'scrypt' || !salt || !hash || rest.length) {
    return false
  }
  const expected = Buffer.from(hash, 'base64')
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length)
  return crypto.timingSafeEqual(actual, expected)
}

// What no reader of the CMS may see: the admin, the REST API and cms.api() all get the members without these. Only the sign-in reads them, inside `secretly`.
const SECRETS = ['password', 'passwordHash']
// A flag that exists only in the chain of calls that `secretly` starts: a request that comes over HTTP is another chain, and cannot set it.
const reading = new AsyncLocalStorage()

/**
 * @param {function(): Promise<*>} work reads the members; what it reads has its secrets
 * @returns {Promise<*>}
 */
const secretly = (work) => reading.run(true, work)

// what is checked when there is no such member, so that "no such member" and "wrong password" take the same time and say the same thing (of a secret nobody knows: it can never match)
const NOBODY = hashPassword(crypto.randomBytes(16).toString('hex'))

/**
 * Hooks of the members resource. They run for every reader and writer (the admin, a script, the loader), and they are the only way a password is kept or shown:
 * - before a write: what an editor types in `password` becomes `passwordHash`; a `passwordHash` in the data is dropped, so that a client cannot plant a hash, and the admin
 *   (which sends back the record it read, without the hash) cannot blank it;
 * - after a read or a write: `password` and `passwordHash` are taken out of what is answered.
 * @param {object} cms
 */
function install (cms) {
  const members = cms.api()('members')
  const prepare = async (context) => {
    try {
      const object = context.params.object
      if (object) {
        delete object.passwordHash
        if (typeof object.email === 'string') {
          object.email = object.email.trim().toLowerCase()
        }
        if (object.password) {
          object.passwordHash = await hashPassword(String(object.password))
          object.password = ''
        }
      }
      context.next()
    } catch (error) {
      context.error(error)
    }
  }
  const hide = (context) => {
    if (!reading.getStore()) {
      // the records are copies: taking a key out of them does not touch the store
      for (const record of [].concat(context.getResult() || [])) {
        SECRETS.forEach((key) => delete record[key])
      }
    }
    context.next()
  }
  members.before('create', prepare)
  members.before('update', prepare)
  for (const event of ['read', 'find', 'list', 'create', 'update']) {
    members.after(event, hide)
  }
}

/**
 * @param {object} cms
 * @param {string|object} idOrQuery
 * @returns {Promise<object|null>} the member as it is kept, with its hash: for the sign-in, and nothing else
 */
const stored = (cms, idOrQuery) => secretly(() => cms.api()('members').find(idOrQuery))

/**
 * @param {object} cms
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object|null>} the member, or null: no such member, a wrong password and an inactive member are the same answer
 */
async function signIn (cms, email, password) {
  const member = await stored(cms, { email: String(email || '').trim().toLowerCase() })
  const ok = await verifyPassword(String(password || ''), member ? member.passwordHash : await NOBODY)
  return ok && member && member.active ? member : null
}

/**
 * Asked at every request of a member, not only at the sign-in: an editor who ticks "Active" off ends the access at once, whatever session is open.
 * @param {object} cms
 * @param {string} id
 * @returns {Promise<object|null>} the member when it still exists and is active
 */
async function current (cms, id) {
  const member = id ? await cms.api()('members').find(id) : null
  return member && member.active ? member : null
}

module.exports = { hashPassword, verifyPassword, install, stored, signIn, current }
