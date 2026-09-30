// let level = require('level'),
const fs = require('fs-extra')
const logger = require('../logger')
const _ = require('lodash')
const path = require('path')
const queryNeedles = require('../util/queryNeedles')
const jsondown = require('./leveldown/jsondown')
const Sync = require('./leveldown/sync')
const mongodown = require('./mongo/mongodown')
const SyncMongoDb = require('./mongo/syncMongoDb')
const PgDOWN = require('./postgres/pgdown')
const SyncPostgres = require('./postgres/syncPostgres')

const encoding = 'json'
/*
 * Constructor
 *
 * @param {String} dbpath, e.g './data/articles'
 * @param {String} id, e.g 'SERVER-1'
 * @param {String} type, from ['normal', 'upstream', 'downstream']
 * @return {JsonStore} JsonStore
 */
class JsonStore {
  constructor (dbpath, id, options, name) {
    fs.mkdirpSync(dbpath)
    this._id = id
    const dbType = this.getDbType(options)
    let dbUrl = _.get(options, 'cms.dbEngine.url')
    this._options = options
    this._options.name = this._options.name || name
    if (dbType === 'mongodb') {
      dbUrl = dbUrl || `localhost/node-cms-${Date.now().toString(36)}`
      this._db = new mongodown(`${dbUrl}/${name}/${this.getIndexMap(options)}`, { keyEncoding: 'utf8', valueEncoding: encoding, testing: 1234 })
      this._sync = new SyncMongoDb(this._db, id, this._options)
    } else if (dbType === 'postgres') {
      dbUrl = dbUrl || `localhost:5432/node-cms-${Date.now().toString(36)}`
      this._db = new PgDOWN(
        `${dbUrl}/${name}/${this.getIndexMap(options)}`,
        { keyEncoding: 'utf8', valueEncoding: encoding }
      )
      this._sync = new SyncPostgres(this._db, id, this._options)
    } else {
      const jsonFilePath = path.join(dbpath, 'db.json')
      this._db = new jsondown(jsonFilePath, { keyEncoding: 'utf8', valueEncoding: encoding })
      this._sync = new Sync(this._db, id, this._options)
    }
  }

  /**
   * Opens the underlying DB (JsonDOWN, mongodown, etc.)
   * Must be called before any CRUD operation.
   */
  async open() {
    if (_.isFunction(this._db.open)) {
      await this._db.open()
    }
  }
  async close() {
    if (_.isFunction(this._db.close)) {
      // logger.verbose(`Closing JsonStore database for resource: ${this._options.name}`)
      this._db._closing = true
      await this._db.close()
    }
  }
  /*
   * Get db type
   *
   * @param {Object} options, Object
   * @return {String} indexMap
   */

  getIndexMap (options) {
    let indexMap = {}
    _.each(options.schema, field => {
      if (field.index) {
        indexMap[field.field] = field.index
      }
    })
    return JSON.stringify(indexMap)
  }

  /*
   * Get db type
   *
   * @param {Object} options, Object
   * @return {Readable} stream
   */

  getDbType (options) {
    const dbType = _.get(options, 'cms.dbEngine.type', false)
    return _.includes(['mongodb', 'postgres'], dbType) ? dbType : 'default'
  }

  /*
   * Sync store
   *
   * @param {Readable} socket, net.Socket
   * @param {Boolean} slave, indicates if store should initiate the connection
   */

  async sync (socket, slave, remoteId) {
    if (this._sync) {
      try {
        await this._sync.sync(socket, slave, remoteId)
      } catch (error) {
        return error
      }
    }
    return null
  }

  /*
   * Low level streaming APIs
   */
  async read (query, _options) {
    const limit = Number(_.get(_options, 'limit', 0)) || 0
    // The query is not an argument of the store: it is applied by the caller (sift), the store only reads. The
    // default store uses it to skip the records that cannot match without parsing them.
    if (_.isFunction(this._db.scan)) {
      return this._db.scan({ needles: queryNeedles(query), limit })
    }
    let results = []
    for await (const [key, value] of this._db.iterator({ limit: limit > 0 ? limit : -1 })) {
      // Ignore internal keys like 'ÿ clock', 'ÿ index', etc.
      if (_.isString(key) && key.startsWith('ÿ')) {
        continue
      }
      let parsedValue = value
      if (_.isString(value)) {
        try {
          parsedValue = JSON.parse(value)
        } catch {
          parsedValue = value
          logger.warn(`Failed to parse value for key ${key}:`, parsedValue)
        }
      }
      results.push(parsedValue)
    }
    return results
  }

  /**
   * Number of records.
   * @returns {Promise<number>}
   */
  async count () {
    if (_.isFunction(this._db.recordCount)) {
      return this._db.recordCount()
    }
    return (await this.read()).length
  }

  /*
   * Highlevel Async APIs
   */

  /*
   * Find a record in database
   *
   * @param {String} id
   */
  async find (id) {
    // If id is a string, treat as direct key lookup
    if (_.isString(id)) {
      try {
        return await this._db.get(id)
      // eslint-disable-next-line no-unused-vars
      } catch (error) {
        // logger.error(`JsonStore.find: record ${id} not found`, error.message)
        return undefined
      }
    }
    // If id is an object, treat as query
    if (!_.isObject(id)) {
      return undefined
    }
    const matches = (value) => _.every(_.keys(id), prop => _.isEqual(_.get(value, prop, null), id[prop]))
    if (_.isFunction(this._db.scan)) {
      // only the records that hold the wanted values as text are parsed
      const needles = _.compact(_.map(id, (wanted) => (_.isString(wanted) || _.isNumber(wanted) || _.isBoolean(wanted)) ? [JSON.stringify(wanted)] : null))
      return _.first(await this._db.scan({ needles, predicate: matches, limit: 1 }))
    }
    for await (const [_key, value] of this._db.iterator({})) {
      if (matches(value)) {
        return value
      }
    }
    return undefined
  }

  startsWith (str, prefix) {
    return str.indexOf(prefix) === 8
  }

  /*
   * Create a record in database
   * Note: yields error if record exists
   *
   * @param {String} id
   * @param {Object} object
   */
  async create (id, obj) {
    // logger.warn('JsonStore.create: writing record', id)
    try {
      await this._db.put(id, obj, { sync: true })
      // logger.warn('JsonStore.create: record written', id)
      // Always return the created object
      return obj
    } catch (error) {
      logger.error(`Failed to get ${id} from database`, error)
      throw error
    }
  }

  /*
   * Update a record in database
   * Note: yields error if record does not exist
   *
   * @param {String} id
   * @param {Object} object
   */
  async update (id, obj) {
    if (!this.startsWith(id, this._id)) {
      return { error: 'Can\'t modify foreign records' }
    }
    await this._db.get(id)
    await this._db.put(id, obj, { sync: true })
    return obj
  }

  /*
   * Delete a record from database
   *
   * @param {String} id
   */
  async remove (id) {
    if (!this.startsWith(id, this._id)) {
      return { error: 'Can\'t modify foreign records' }
    }
    try {
      await this._db.del(id)
      return true
    } catch (error) {
      return {error}
    }
  }

  /**
   * Drops the index entries that a later entry of the same machine and key replaces (the replication only needs the
   * latest change of a record; the clocks are not touched).
   * @returns {Promise<number>} the number of entries removed
   */
  async cleanIndex () {
    if (this.getDbType(this._options) !== 'default') {
      // the other stores keep no index entries
      return 0
    }
    const latest = new Map()
    const stale = []
    for await (const [indexKey, recordKey] of this._db.iterator({ gte: '\xFF index ', lte: '\xFF index\xFF' })) {
      const id = `${indexKey.split(' ')[2]}\u0000${recordKey}`
      if (latest.has(id)) {
        stale.push({ type: 'del', key: latest.get(id) })
      }
      latest.set(id, indexKey)
    }
    if (stale.length === 0) {
      return 0
    }
    try {
      await this._db.batch(stale)
      return stale.length
    } catch (error) {
      logger.error('Error cleaning index:', error)
      return 0
    }
  }
}

// Factory function for compatibility
function createJsonStore (dbpath, id, options, name) {
  return new JsonStore(dbpath, id, options, name)
}

exports = module.exports = createJsonStore
