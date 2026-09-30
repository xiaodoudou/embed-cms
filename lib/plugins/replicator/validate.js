const _ = require('lodash')

const REPLICA_PREFIX = '\xFDreplica\xFD'
// what a machine id and a record id look like: <8 time><8 machine><8 random>
const MACHINE_ID = /^[\w-]{8}$/
const RECORD_ID = /^[0-9A-Za-z]{24}$/
const FILE_ID = /^[\w-]{1,200}$/
const MAX_CLOCK_ENTRIES = 1000

/**
 * @param {*} id
 * @returns {boolean} true for a machine id as sent in the replication header
 */
const isMachineId = (id) => _.isString(id) && MACHINE_ID.test(id)

/**
 * @param {*} id
 * @returns {boolean} true for an id that can name a stored file (attachment or resized copy)
 */
const isFileId = (id) => _.isString(id) && FILE_ID.test(id) && id !== '.' && id !== '..'

/**
 * The clock a peer sends: an object of machine keys and timestamps.
 * @param {*} value
 * @returns {boolean}
 */
const isClock = (value) => _.isPlainObject(value) && _.size(value) <= MAX_CLOCK_ENTRIES && _.every(value, (time, key) => _.isString(key) && _.isString(time))

/**
 * Checks a change received from a peer before it is written: it must be a replicated record (never a plain key of
 * the store, an internal key, or a record that belongs to this node), and the record must be what its key says.
 * @param {{op: string, key: *, value: *}} change - a put or del frame
 * @param {object} context
 * @param {string} context.ownId - machine id of this node
 * @param {number} [context.maxRecordBytes] - size limit of a record
 * @returns {{ok: boolean, reason?: string}}
 */
function validateChange (change, { ownId, maxRecordBytes = 4 * 1024 * 1024 }) {
  const key = change.key
  if (!_.isString(key) || !key.startsWith(REPLICA_PREFIX)) {
    return { ok: false, reason: 'not a replicated record key' }
  }
  const [, namespace, timestamp, ...rest] = key.split(' ')
  const recordId = rest.join(' ')
  if (!isMachineId(namespace) || !/^[\d.]+$/.test(timestamp || '')) {
    return { ok: false, reason: 'malformed replica key' }
  }
  if (namespace === ownId) {
    return { ok: false, reason: 'the peer claims a change that originated here' }
  }
  if (!RECORD_ID.test(recordId) || recordId.slice(8, 16) !== namespace) {
    return { ok: false, reason: 'the record id does not belong to the machine that sent it' }
  }
  if (change.op === 'del') {
    return { ok: true }
  }
  if (!_.isString(change.value) || change.value.length > maxRecordBytes) {
    return { ok: false, reason: 'the record is not a string or is too large' }
  }
  let record
  try {
    record = JSON.parse(change.value)
  } catch {
    return { ok: false, reason: 'the record is not json' }
  }
  return validateRecord(record, recordId)
}

/**
 * @param {*} record - a parsed record
 * @param {string} recordId - the key it is stored under
 * @returns {{ok: boolean, reason?: string}}
 */
function validateRecord (record, recordId) {
  if (!_.isPlainObject(record) || record._id !== recordId) {
    return { ok: false, reason: 'the record is not an object with the _id of its key' }
  }
  if (record._attachments !== undefined) {
    const attachments = record._attachments
    if (!_.isArray(attachments) || !_.every(attachments, item => _.isPlainObject(item) && isFileId(item._id))) {
      return { ok: false, reason: 'an attachment id is not a plain file id' }
    }
  }
  return { ok: true }
}

/**
 * Checks a record frame of the MongoDB and PostgreSQL replication ({ key, value }): the peer only sends its own records.
 * @param {*} item
 * @param {string} remoteId - machine id of the peer
 * @param {number} [maxRecordBytes]
 * @returns {{ok: boolean, reason?: string}}
 */
function validatePeerRecord (item, remoteId, maxRecordBytes = 4 * 1024 * 1024) {
  if (!_.isPlainObject(item) || !_.isString(item.key) || !RECORD_ID.test(item.key) || item.key.slice(8, 16) !== remoteId) {
    return { ok: false, reason: 'the record id does not belong to the machine that sent it' }
  }
  if (!_.isString(item.value) || item.value.length > maxRecordBytes) {
    return { ok: false, reason: 'the record is not a string or is too large' }
  }
  try {
    return validateRecord(JSON.parse(item.value), item.key)
  } catch {
    return { ok: false, reason: 'the record is not json' }
  }
}

module.exports = { validateChange, validatePeerRecord, isMachineId, isFileId, isClock, REPLICA_PREFIX }
