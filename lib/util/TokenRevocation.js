const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const logger = require('../logger')

/**
 * @param {string} token
 * @returns {string} its SHA-256: what is kept instead of the token
 */
const digest = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')

/**
 * Tokens that were logged out before they expired. Only a hash of each token is kept, with its expiry, in memory and
 * (when a file is given) in a small json file so a restart does not bring logged out tokens back.
 */
class TokenRevocation {
  /**
   * @param {object} [options]
   * @param {string} [options.file] - where to persist the list
   * @param {function(): number} [options.now]
   * @param {number} [options.saveDelay] - debounce of the writes, in ms
   */
  constructor ({ file, now = Date.now, saveDelay = 200 } = {}) {
    this.file = file
    this.now = now
    this.saveDelay = saveDelay
    this.revoked = new Map()
    this.timer = null
    this.load()
  }

  load () {
    if (!this.file) {
      return
    }
    try {
      const stored = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      Object.entries(stored).forEach(([key, expires]) => Number(expires) > this.now() && this.revoked.set(key, Number(expires)))
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('Could not read the revoked token list, starting empty:', error.message)
      }
    }
  }

  /**
   * @param {string} token
   * @param {number} expiresAt - epoch ms after which the token is invalid anyway
   */
  revoke (token, expiresAt) {
    this.prune()
    this.revoked.set(digest(token), expiresAt > this.now() ? expiresAt : this.now() + 24 * 60 * 60 * 1000)
    this.schedule()
  }

  /**
   * @param {string} token
   * @returns {boolean} revoked, and not expired yet
   */
  isRevoked (token) {
    const expires = this.revoked.get(digest(token))
    return expires !== undefined && expires > this.now()
  }

  prune () {
    for (const [key, expires] of this.revoked) {
      if (expires <= this.now()) {
        this.revoked.delete(key)
      }
    }
  }

  /** Schedules one write of the file soon, so that a burst of revocations is written once. */
  schedule () {
    if (!this.file || this.timer) {
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, this.saveDelay)
    this.timer.unref()
  }

  /**
   * Writes the list now (through a temporary file, so a crash never leaves a torn file).
   * @returns {Promise<void>}
   */
  async flush () {
    if (!this.file) {
      return
    }
    clearTimeout(this.timer)
    this.timer = null
    this.prune()
    const temporary = `${this.file}.${process.pid}.tmp`
    try {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
      await fs.promises.writeFile(temporary, JSON.stringify(Object.fromEntries(this.revoked)), { mode: 0o600 })
      await fs.promises.rename(temporary, this.file)
    } catch (error) {
      logger.debug('Could not save the revoked token list:', error.message)
    }
  }
}

module.exports = TokenRevocation
