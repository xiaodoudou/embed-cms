const _ = require('lodash')
const { isInternal } = require('../db/local/records')

/**
 * Which record holds a value of a unique field, kept in memory: the check that a value is not taken is a lookup, not a
 * scan of the resource (which made a run of creates quadratic). The store feeds it every write that reaches the engine,
 * its own and the ones of the replication alike, through the prewrite hook of the engine.
 */
class UniqueIndex {
  /**
   * @param {string[]} paths the paths of the unique values in a record: `slug`, or `title.enUS` for a value per language
   */
  constructor (paths) {
    this.paths = paths
    this.idByKey = new Map()
    this.keysById = new Map()
  }

  /**
   * @param {string} path
   * @param {*} value
   * @returns {string} the key of the value at the path, in the index
   */
  static keyOf (path, value) {
    return `${path}\u0000${JSON.stringify(value)}`
  }

  /** The id of the record that holds the value at the path, if any */
  idOf (path, value) {
    return this.idByKey.get(UniqueIndex.keyOf(path, value))
  }

  /** Records the values of a record (the ones it held before are forgotten) */
  put (id, record) {
    this.delete(id)
    const keys = []
    for (const path of this.paths) {
      const value = _.get(record, path)
      if (!_.isNil(value)) {
        const key = UniqueIndex.keyOf(path, value)
        this.idByKey.set(key, id)
        keys.push(key)
      }
    }
    this.keysById.set(id, keys)
  }

  /** Forgets the values of a record */
  delete (id) {
    for (const key of this.keysById.get(id) || []) {
      if (this.idByKey.get(key) === id) {
        this.idByKey.delete(key)
      }
    }
    this.keysById.delete(id)
  }

  /**
   * Follows a write that reaches the engine: `{ type: 'put' | 'del', key, value }`. A record arriving from a peer comes as
   * JSON text; the keys of the replication are not records.
   */
  apply (change) {
    if (isInternal(change.key)) {
      return
    }
    if (change.type === 'del') {
      this.delete(change.key)
    } else if (change.type === 'put') {
      let record = change.value
      if (_.isString(record)) {
        try {
          record = JSON.parse(record)
        } catch {
          return
        }
      }
      if (_.isPlainObject(record)) {
        this.put(change.key, record)
      }
    }
  }
}

module.exports = { UniqueIndex }
