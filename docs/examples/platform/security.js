// The small protections of a site that takes forms: headers on every answer, a limit on how often something may be done, and a token for the forms.
// All of it is a few lines of the example's own, so that nothing hides what a protection does.
const crypto = require('crypto')

/**
 * Headers for every answer. The site loads nothing from elsewhere, so the policy says so: a script injected into a page (or a page put in another one) finds no way to run.
 * @returns {import('express').RequestHandler}
 */
function securityHeaders () {
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin'
    })
    next()
  }
}

/** At most `limit` hits for each key in each window of `windowMs`: the sign-in of one address, the messages from one machine. It is kept in memory, so it starts again with the process. */
class Limiter {
  /**
   * @param {object} options
   * @param {number} options.limit how many hits a key may make in a window
   * @param {number} options.windowMs how long a window lasts
   * @param {number} [options.maxKeys] how many keys are remembered at most: the oldest goes first, so that a flood of addresses cannot fill the memory
   * @param {function(): number} [options.now] the clock, a test gives its own
   */
  constructor ({ limit, windowMs, maxKeys = 5000, now = Date.now }) {
    this.limit = limit
    this.windowMs = windowMs
    this.maxKeys = maxKeys
    this.now = now
    /** @type {Map<string, {count: number, resetAt: number}>} */
    this.keys = new Map()
  }

  /**
   * @param {string} key
   * @returns {{allowed: boolean, retryAfter: number}} retryAfter in seconds, when it is not allowed
   */
  hit (key) {
    const now = this.now()
    let entry = this.keys.get(key)
    if (!entry || entry.resetAt <= now) {
      this.prune(now)
      entry = { count: 0, resetAt: now + this.windowMs }
      this.keys.delete(key)
      this.keys.set(key, entry)
    }
    entry.count++
    return { allowed: entry.count <= this.limit, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  /** Forgets a key (a successful sign-in starts the count again). */
  reset (key) {
    this.keys.delete(key)
  }

  /** Drops the windows that are over, and the oldest keys when there are still too many. */
  prune (now) {
    for (const [key, entry] of this.keys) {
      if (entry.resetAt <= now) {
        this.keys.delete(key)
      }
    }
    while (this.keys.size >= this.maxKeys) {
      this.keys.delete(this.keys.keys().next().value)
    }
  }
}

/**
 * The token of the forms of this visitor: made once, kept in the session, and put in each form as `_csrf`. A page of another site cannot read it, so it cannot send a form that is accepted.
 * @param {import('express').Request} req
 * @returns {string}
 */
function csrfToken (req) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(24).toString('base64url')
  }
  return req.session.csrf
}

/**
 * @param {import('express').Request} req a request with a parsed body
 * @returns {boolean} whether the form carries the token of the session
 */
function csrfValid (req) {
  const wanted = req.session && req.session.csrf
  const given = req.body && req.body._csrf
  if (typeof wanted !== 'string' || typeof given !== 'string' || given.length !== wanted.length) {
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(wanted))
}

/**
 * Where to go after signing in: a path of this site, never an address of another one (`//evil.example` and `/\evil.example` are both read by a browser as another site).
 * @param {*} value
 * @returns {string}
 */
function localPath (value) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) && !/[\r\n]/.test(value) ? value : '/account'
}

module.exports = { securityHeaders, Limiter, csrfToken, csrfValid, localPath }
