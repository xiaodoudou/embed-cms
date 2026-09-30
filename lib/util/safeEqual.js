const crypto = require('crypto')

/**
 * Constant-time string comparison (avoids leaking how many leading characters matched).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
module.exports = function safeEqual (a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false
  }
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  // hash first so buffers have equal length and length is not leaked either
  const hashA = crypto.createHash('sha256').update(bufA).digest()
  const hashB = crypto.createHash('sha256').update(bufB).digest()
  return crypto.timingSafeEqual(hashA, hashB) && bufA.length === bufB.length
}
