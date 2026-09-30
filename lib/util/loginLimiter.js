/**
 * In-memory limiter for failed logins.
 *
 * Failures are counted per account and address, per address (one address trying many accounts) and per account
 * (many addresses trying one account, at a higher threshold so an attacker cannot lock a user out cheaply).
 * Counts older than the lock duration are forgotten, and the table is bounded.
 */
class LoginLimiter {
  /**
   * @param {object} options
   * @param {number} options.retry - failures tolerated per account and address before it is locked
   * @param {number} options.duration - lock duration and counting window, in minutes
   * @param {number} [options.maxEntries] - size of the table
   * @param {function(): number} [options.now]
   */
  constructor ({ retry, duration, maxEntries = 10000, now = Date.now }) {
    this.retry = Number(retry) >= 0 ? Number(retry) : 5
    this.windowMs = (Number(duration) > 0 ? Number(duration) : 5) * 60 * 1000
    this.maxEntries = maxEntries
    this.now = now
    this.entries = new Map()
  }

  keys (username, ip) {
    return [
      { key: `ai\u0000${username}\u0000${ip}`, limit: this.retry },
      { key: `ip\u0000${ip}`, limit: this.retry * 5 },
      { key: `ac\u0000${username}`, limit: this.retry * 20 }
    ]
  }

  entry (key) {
    const entry = this.entries.get(key)
    if (entry && entry.expires <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry
  }

  /**
   * @param {string} username
   * @param {string} ip
   * @returns {{blocked: boolean, retryAfter?: number}} retryAfter is in seconds
   */
  check (username, ip) {
    let until = 0
    for (const { key } of this.keys(username, ip)) {
      const entry = this.entry(key)
      if (entry && entry.blockUntil > this.now()) {
        until = Math.max(until, entry.blockUntil)
      }
    }
    return until ? { blocked: true, retryAfter: Math.max(1, Math.ceil((until - this.now()) / 1000)) } : { blocked: false }
  }

  /**
   * Records a failed attempt.
   * @param {string} username
   * @param {string} ip
   * @param {string} [fingerprint] - identifies the password that was tried: repeating the same wrong password counts once
   */
  fail (username, ip, fingerprint) {
    const now = this.now()
    this.keys(username, ip).forEach(({ key, limit }, index) => {
      const entry = this.entry(key) || { count: 0, blockUntil: 0, last: undefined }
      // an unchanged password is a stale client, not a guess: only the account and address counter ignores it
      if (index === 0 && fingerprint !== undefined && entry.last === fingerprint && entry.count > 0) {
        return
      }
      entry.count += 1
      entry.last = fingerprint
      entry.expires = now + this.windowMs
      if (entry.count > limit) {
        entry.blockUntil = now + this.windowMs
      }
      // re-insert so the oldest entry is always the first one
      this.entries.delete(key)
      this.entries.set(key, entry)
    })
    this.prune()
  }

  /**
   * A successful login clears the counter of that account and address.
   * @param {string} username
   * @param {string} ip
   */
  success (username, ip) {
    this.entries.delete(this.keys(username, ip)[0].key)
  }

  prune () {
    if (this.entries.size <= this.maxEntries) {
      return
    }
    const now = this.now()
    for (const [key, entry] of this.entries) {
      if (entry.expires <= now) {
        this.entries.delete(key)
      }
    }
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) {
        break
      }
      this.entries.delete(key)
    }
  }
}

module.exports = LoginLimiter
