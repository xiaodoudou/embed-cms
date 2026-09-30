const crypto = require('crypto')
const _ = require('lodash')

// the last part of an id starts here (36^8 is 2821109907456): 8 characters in base 36 whatever the random part is
const TAIL_BASE = 2664381579264

/*
 * Constructor
 *
 * @param {String} 8-digit machine id
 * @return {String} 24-digit uuid, that consist of timestamp, machine id and random number, all base 36.
 *   The ids one generator makes sort in the order they were made: within a millisecond the random part only grows.
 */
function UUID (mid) {
  let lastMs = 0
  let sequence = 0
  return function () {
    if (_.isString(mid) && mid.length === 8) {
      const now = Date.now()
      if (now > lastMs) {
        lastMs = now
        sequence = crypto.randomInt(1000000000)
      } else {
        // same millisecond, or the clock stepped back: still after the previous id
        sequence += 1 + crypto.randomInt(100)
      }
      return lastMs.toString(36) + mid + (TAIL_BASE + sequence).toString(36)
    }
    throw new Error('Machine id should be an 8 digit string')
  }
}
exports = module.exports = UUID
