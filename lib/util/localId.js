// A record id is 8 characters of time, then the id of the machine that made it (8 characters), then a random tail:
//   muov4i42 42424242 y0f7dv8q
// A record belongs to this machine when the machine id sits exactly at position 8. Looking for it with indexOf finds it too
// early when the end of the time part and the start of the machine id overlap (a time part ending in "42" and a machine id
// made of "42"s: the id appears at position 6), and the record then looked foreign: it could not be removed or updated.
const TIME_LENGTH = 8

/**
 * @param {string} id a record id
 * @param {string} mid the id of this machine
 * @returns {boolean} true when the record was made by this machine
 */
function isLocalId (id, mid) {
  if (typeof id !== 'string' || typeof mid !== 'string' || mid.length === 0) {
    return false
  }
  return id.slice(TIME_LENGTH, TIME_LENGTH + mid.length) === mid
}

module.exports = { isLocalId, TIME_LENGTH }
