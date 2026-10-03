// let level = require('level'),
const fs = require('fs-extra')
const logger = require('../logger')
const { isLocalId } = require('../util/localId')
const ForeignRecordError = require('./ForeignRecordError')
const _ = require('lodash')
const path = require('path')
const queryNeedles = require('../util/queryNeedles')
const { createLocalEngine, LOCAL_ENGINES } = require('./local/localEngines')
const Sync = require('./local/Sync')
const mongodown = require('./mongo/MongoDown')
const SyncMongoDb = require('./mongo/SyncMongoDb')
const PgDOWN = require('./postgres/PgDown')
const SyncPostgres = require('./postgres/SyncPostgres')

const encoding = 'json'
const DB_TYPES = ['jsondown', 'sqlite', 'leveldb', 'mongodb', 'postgres']
// the engines that keep the index entries of the replication in the store itself
const INDEXED_DB_TYPES = ['default', 'jsondown', 'sqlite', 'leveldb']
// the internal key a flush writes (see flush()); like the index and clock keys, it starts with \xFF
const FLUSH_KEY = '\xFF flush'
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
      dbUrl = dbUrl || `localhost/embed-cms-${Date.now().toString(36)}`
      this._db = new mongodown(`${dbUrl}/${name}/${this.getIndexMap(options)}`, { keyEncoding: 'utf8', valueEncoding: encoding, testing: 1234 })
      this._sync = new SyncMongoDb(this._db, id, this._options)
    } else if (dbType === 'postgres') {
      dbUrl = dbUrl || `localhost:5432/embed-cms-${Date.now().toString(36)}`
      this._db = new PgDOWN(
        `${dbUrl}/${name}/${this.getIndexMap(options)}`,
        { keyEncoding: 'utf8', valueEncoding: encoding }
      )
      this._sync = new SyncPostgres(this._db, id, this._options)
    } else {
      this._db = createLocalEngine(this.localEngine(dbType, dbpath, name), dbpath, { keyEncoding: 'utf8', valueEncoding: encoding })
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
    if (!dbType) {
      return 'default'
    }
    if (!_.includes(DB_TYPES, dbType)) {
      // a typo must not start an empty store beside the one that holds the content
      throw new Error(`Unknown dbEngine.type "${dbType}". Use one of: ${DB_TYPES.join(', ')}`)
    }
    return dbType
  }

  /**
   * The local engine a resource uses. A configured type is used as it is. Without one, new content goes to LevelDB; a
   * resource that already has a `db.json` and no LevelDB store keeps its file, so a server that is updated does not
   * start on an empty store (`npm run migrate-store` moves the content, see docs/operations/STORAGE.md).
   * @param {string} dbType - from getDbType
   * @param {string} dbpath - the folder of the resource's store
   * @param {string} name - the resource
   * @returns {string} jsondown, sqlite or leveldb
   */
  localEngine (dbType, dbpath, name) {
    if (dbType !== 'default') {
      return dbType
    }
    if (fs.existsSync(path.join(dbpath, LOCAL_ENGINES.jsondown.artifact)) && !fs.existsSync(path.join(dbpath, LOCAL_ENGINES.leveldb.artifact))) {
      logger.warn(`Resource "${name}" still keeps its records in db.json. embed-cms now starts new content on LevelDB: run "npm run migrate-store -- --from jsondown --to leveldb" to move it, or set dbEngine.type to "jsondown" to keep the file.`)
      return 'jsondown'
    }
    return 'leveldb'
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
    return isLocalId(str, prefix)
  }

  /*
   * Create a record in database
   * Note: yields error if record exists
   *
   * @param {String} id
   * @param {Object} object
   */
  async create (id, obj) {
    try {
      await this._db.put(id, obj, this.writeOptions())
      return obj
    } catch (error) {
      logger.error(`Failed to write ${id} to the database`, error)
      throw error
    }
  }

  /**
   * A write waits for the disk (`sync: true`: the record survives a power cut, not only a crash of the process), unless it is
   * one of many in a bulk(): then the disk is waited for once, at the end.
   */
  writeOptions () {
    return { sync: !this._bulkDepth }
  }

  /**
   * Runs `work`, whose writes to this store are answered without waiting for the disk, then waits for the disk once: a run
   * of many writes (a sync, an import) takes the time of one flush instead of one per record, which is what takes the time
   * of a write. The records are as safe as before once bulk() has answered; a power cut while it runs can lose the last of
   * them, as it can lose any write before its flush. Can be nested: the disk is waited for when the outermost one ends.
   * @param {function(): Promise<*>} work
   * @returns {Promise<*>} what work answers
   */
  async bulk (work) {
    this._bulkDepth = (this._bulkDepth || 0) + 1
    try {
      return await work()
    } finally {
      this._bulkDepth -= 1
      if (this._bulkDepth === 0) {
        await this.flush()
      }
    }
  }

  /**
   * Waits for the writes made so far to be on disk. The local engines flush their log up to a write made with `sync: true`,
   * so one write of a marker key does it; the marker is an internal key, not a change of the data (the replication leaves
   * the keys that start with \xFF alone). The database servers keep their own durability: nothing to do.
   */
  async flush () {
    if (_.includes(INDEXED_DB_TYPES, this.getDbType(this._options))) {
      await this._db.put(FLUSH_KEY, Date.now(), { sync: true })
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
      throw new ForeignRecordError(id)
    }
    await this._db.get(id)
    await this._db.put(id, obj, this.writeOptions())
    return obj
  }

  /*
   * Delete a record from database
   *
   * @param {String} id
   */
  async remove (id) {
    if (!this.startsWith(id, this._id)) {
      throw new ForeignRecordError(id)
    }
    // a failed delete is thrown, never answered as "done" for a record that is still there
    await this._db.del(id)
    return true
  }

  /**
   * Drops the index entries that a later entry of the same machine and key replaces (the replication only needs the
   * latest change of a record; the clocks are not touched).
   * @returns {Promise<number>} the number of entries removed
   */
  async cleanIndex () {
    if (!_.includes(INDEXED_DB_TYPES, this.getDbType(this._options))) {
      // the database servers keep no index entries
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
