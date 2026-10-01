const _ = require('lodash')
const logger = require('../../logger')

// the keys of the replication (indexes, clocks, markers) start with U+00FF: every record key sorts before them
const FIRST_INTERNAL_KEY = '\xFF'

/**
 * Reads the records (the keys that are not internal) of a store that can only be read through its iterator, in key
 * order, with the same contract as the scan of jsondown. `needles` narrows the records that are parsed: an array of
 * groups, a record is only parsed when its text holds at least one needle of every group. This is a necessary
 * condition only (the caller still filters).
 * @param {object} db - an abstract-level database
 * @param {object} [options]
 * @param {string[][]} [options.needles]
 * @param {function(object): boolean} [options.predicate] - keeps the records it accepts
 * @param {number} [options.limit] - stop after this many records (0 for all)
 * @returns {Promise<object[]>}
 */
async function scanRecords (db, { needles = [], predicate, limit = 0 } = {}) {
  const results = []
  // the text as stored: it is parsed here, and only when it can match
  for await (const [key, raw] of db.iterator({ lt: FIRST_INTERNAL_KEY, valueEncoding: 'utf8' })) {
    if (!_.isString(raw)) {
      continue
    }
    if (needles.length && !needles.every(group => group.some(needle => raw.includes(needle)))) {
      continue
    }
    let record
    try {
      record = JSON.parse(raw)
    } catch {
      logger.warn(`Failed to parse value for key ${key}:`, raw)
      continue
    }
    if (predicate && !predicate(record)) {
      continue
    }
    results.push(record)
    if (limit !== 0 && results.length >= limit) {
      break
    }
  }
  return results
}

/**
 * Counts the records (the keys that are not internal) by reading the keys alone.
 * @param {object} db - an abstract-level database
 * @returns {Promise<number>}
 */
async function countRecords (db) {
  let count = 0
  for await (const _key of db.keys({ lt: FIRST_INTERNAL_KEY })) {
    count++
  }
  return count
}

module.exports = { scanRecords, countRecords, FIRST_INTERNAL_KEY }
