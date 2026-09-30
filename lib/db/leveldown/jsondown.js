const _ = require('lodash')
const logger = require('../../logger')
const fs = require('fs-extra')
const nodeFs = require('fs')
const { AbstractLevel, AbstractIterator } = require('abstract-level')
const path = require('path')

// keys of the replication (indexes, clocks, markers) start with U+00FF: the store and the sort treat them as one block
const isInternal = (key) => key.charCodeAt(0) >= 0xFF

// first index whose key is >= the given key, in a sorted array
const lowerBound = (keys, key) => {
  let low = 0
  let high = keys.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (keys[middle] < key) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}
// first index whose key is > the given key
const upperBound = (keys, key) => {
  let low = 0
  let high = keys.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (keys[middle] <= key) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

/**
 * An iterator for the SingleJsonFileDb.
 * It iterates over the keys of the in-memory Map, respecting range options.
 * This version uses the modern async _next() method.
 */
class SingleJsonFileIterator extends AbstractIterator {
  constructor(db, options) {
    super(db, options)
    this.options = options || {}
    // the keys inside the range, in order (gt, gte, lt and lte are the range options of abstract-level): the keys
    // are kept sorted, so the range is found by bisection and only the keys the caller asks for are copied
    const { gte, lte, gt, lt, reverse, limit } = this.options
    const size = db._keyCount()
    let from = 0
    let to = size
    if (gte !== undefined) from = Math.max(from, db._lowerBound(gte))
    if (gt !== undefined) from = Math.max(from, db._upperBound(gt))
    if (lte !== undefined) to = Math.min(to, db._upperBound(lte))
    if (lt !== undefined) to = Math.min(to, db._lowerBound(lt))
    to = Math.max(from, to)
    const max = limit !== undefined && limit > -1 ? limit : Infinity
    this._keys = reverse
      ? db._keySlice(Math.max(from, to - max), to).reverse()
      : db._keySlice(from, Math.min(to, from + max))
    this._index = 0
  }
  // Modern async _next(), returns [key, value] or undefined.
  async _next() {
    // a key deleted since the iterator was made is skipped
    while (this._index < this._keys.length) {
      const key = this._keys[this._index++]
      if (this.db._store.has(key)) {
        // the value as stored: abstract-level decodes it
        return [key, this.db._store.get(key)]
      }
    }
    // Returning undefined signals the end of iteration
  }
}
/**
 * A custom database that uses a single JSON file for persistence,
 * while keeping the entire dataset in memory for fast reads.
 * This version uses the modern async/await private methods.
 */
class JsonDOWN extends AbstractLevel {
  /**
     * Ensure all pending writes are flushed to disk before closing.
     */
  async close() {
    this._closing = true
    // Wait for any pending debounced persist to finish
    if (this._persistScheduled && this._persistPromise) {
      try {
        await this._persistPromise
      } catch (err) {
        // Log but do not throw, to avoid blocking close
        logger.error(`[jsondown] [${new Date().toISOString()}] _close: ERROR in pending persist`, err)
      }
    }
    // Final flush to disk to ensure all data is persisted
    try {
      await this._persist()
    } catch (err) {
      logger.error(`[jsondown] [${new Date().toISOString()}] _close: ERROR in final persist`, err)
    }
  }
  /*
   * The keys are kept in two sorted arrays: the records, and the internal keys (indexes, clocks and markers of the
   * replication, which start with a character from U+00FF on). Every key of the first array sorts before every key of
   * the second, so together they are the sorted keys; a record that is added or removed only moves the keys of the
   * records after it, not the (many) index entries. Single writes are bisected into place, a big batch marks the
   * arrays stale and the next reader rebuilds them.
   */
  _arrays() {
    if (!this._records) {
      const records = []
      const internal = []
      for (const key of this._store.keys()) {
        (isInternal(key) ? internal : records).push(key)
      }
      this._records = records.sort()
      this._internal = internal.sort()
    }
    return [this._records, this._internal]
  }
  _keyCount() {
    const [records, internal] = this._arrays()
    return records.length + internal.length
  }
  _lowerBound(key) {
    const [records, internal] = this._arrays()
    return isInternal(key) ? records.length + lowerBound(internal, key) : lowerBound(records, key)
  }
  _upperBound(key) {
    const [records, internal] = this._arrays()
    return isInternal(key) ? records.length + upperBound(internal, key) : upperBound(records, key)
  }
  _keySlice(from, to) {
    const [records, internal] = this._arrays()
    if (to <= records.length) {
      return records.slice(from, to)
    }
    if (from >= records.length) {
      return internal.slice(from - records.length, to - records.length)
    }
    return records.slice(from).concat(internal.slice(0, to - records.length))
  }
  _keyAdded(key) {
    if (this._records) {
      const target = isInternal(key) ? this._internal : this._records
      target.splice(lowerBound(target, key), 0, key)
    }
  }
  _keyRemoved(key) {
    if (this._records) {
      const target = isInternal(key) ? this._internal : this._records
      const index = lowerBound(target, key)
      if (target[index] === key) {
        target.splice(index, 1)
      }
    }
  }
  _keysChanged() {
    this._records = null
    this._internal = null
  }
  /**
   * @returns {number} the number of records (the keys that are not internal)
   */
  async recordCount() {
    await this._ready()
    return this._arrays()[0].length
  }

  /**
   * Resolves once the file has been read. The methods that read the map directly (not through abstract-level, which
   * holds an operation back until the database is open) must not answer from the empty map of a store that is opening.
   * @returns {Promise<void>}
   */
  async _ready() {
    if (this.status !== 'open') {
      await this.open()
    }
  }

  /**
   * Reads the records (the keys that are not internal), in key order. `needles` narrows the records that are parsed:
   * an array of groups, a record is only parsed when its text holds at least one needle of every group. This is a
   * necessary condition only (the caller still filters), it makes a search parse the few records that could match
   * instead of all of them.
   * @param {object} [options]
   * @param {string[][]} [options.needles]
   * @param {function(object): boolean} [options.predicate] - keeps the records it accepts
   * @param {number} [options.limit] - stop after this many records (0 for all)
   * @returns {Promise<object[]>}
   */
  async scan({ needles = [], predicate, limit = 0 } = {}) {
    await this._ready()
    const results = []
    for (const key of this._arrays()[0]) {
      const raw = this._store.get(key)
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

  constructor(location, options = {}) {
    // Manifest must declare supported encodings
    const manifest = {
      encodings: { utf8: true, buffer: true, view: true }
      // Add more features if needed (e.g., has, getMany, etc.)
    }
    super(manifest, options)
    this.location = location
    this._store = new Map()

    // Add hooks support for sync/replication
    this.hooks = {
      prewrite: {
        noop: true,  // Start as true, set to false when hooks are added
        add: (hook) => {
          this._prewriteHooks = this._prewriteHooks || []
          this._prewriteHooks.push(hook)
          this.hooks.prewrite.noop = false
        },
        delete: (hook) => {
          if (this._prewriteHooks) {
            const index = this._prewriteHooks.indexOf(hook)
            if (index !== -1) {
              this._prewriteHooks.splice(index, 1)
            }
          }
          this.hooks.prewrite.noop = !this._prewriteHooks || this._prewriteHooks.length === 0
        },
        run: (op, batch) => {
          if (this._prewriteHooks) {
            for (const hook of this._prewriteHooks) {
              hook(op, batch)
            }
          }
        }
      },
      postopen: {
        noop: true,
        add: () => {},
        delete: () => {},
        run: () => {}
      },
      newsub: {
        noop: true,
        add: () => {},
        delete: () => {},
        run: () => {}
      }
    }
    // Track closing state
    this._closing = false
    // Write queue for serializing all write operations
    this._writeQueue = []
    this._writeInProgress = false
    // Debounced persist state
    this._persistScheduled = false
    this._persistDelay = 50 // ms, can be tuned
    this._persistPromise = null
  }
  /**
   * Writes the entire in-memory map to the JSON file. The file is written next to its final place and renamed over
   * it, so a crash leaves either the old or the new content and never a torn file.
   */
  _persist() {
    // one write at a time: two of them would share the temporary file
    const run = () => this._writeFile()
    const result = (this._persistQueue || Promise.resolve()).then(run, run)
    this._persistQueue = result.catch(() => {})
    return result
  }

  async _writeFile() {
    if (!this._dirty) {
      return
    }
    this._dirty = false
    const started = Date.now()
    // a consistent snapshot: the values are strings, nothing changes them
    const entries = [...this._store]
    const temporary = `${this.location}.${process.pid}.tmp`
    try {
      const handle = await nodeFs.promises.open(temporary, 'w')
      try {
        // the same text as JSON.stringify(data, null, 2) of { '$key': 'value' }, written in slices, so no stretch of
        // work is long and requests are served in between
        let separator = '{'
        for (let from = 0; from < entries.length; from += 500) {
          let text = ''
          for (const [key, value] of entries.slice(from, from + 500)) {
            text += `${separator}\n  ${JSON.stringify(`$${key}`)}: ${JSON.stringify(value)}`
            separator = ','
          }
          await handle.write(text)
          await new Promise(resolve => global.setImmediate(resolve))
        }
        await handle.write(entries.length ? '\n}' : '{}')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await nodeFs.promises.rename(temporary, this.location)
    } catch (err) {
      logger.error(`[jsondown] [${new Date().toISOString()}] _persist: ERROR writing file to ${this.location}`, err)
      await nodeFs.promises.unlink(temporary).catch(() => {})
      this._dirty = true
      throw err
    }
    // a big file takes long to write: flush it less often, so writing never takes most of the time of the process
    this._persistDelay = Math.min(5000, Math.max(50, (Date.now() - started) * 2))
  }

  /**
   * Debounced persist: schedule a flush to disk after a short delay.
   * Returns a promise that resolves when the flush is complete.
   */
  _schedulePersist() {
    this._dirty = true
    if (this._persistScheduled) {
      // Already scheduled, return the pending promise
      return this._persistPromise
    }
    this._persistScheduled = true
    this._persistPromise = new Promise((resolve, reject) => {
      setTimeout(async () => {
        this._persistScheduled = false
        try {
          await this._persist()
          resolve()
        } catch (err) {
          reject(err)
        }
      }, this._persistDelay)
    })
    return this._persistPromise
  }
  async _open(_options) {
    try {
      // Ensure the directory for the file exists
      await fs.ensureDir(path.dirname(this.location))
      // Try to read the existing database file
      const content = await fs.readFile(this.location, { encoding: 'utf8' })
      let data
      try {
        data = JSON.parse(content)
        // Handle legacy array format and convert to object format
        if (_.isArray(data)) {
          const objectData = {}
          for (const [key, value] of data) {
            objectData[key] = value
          }
          data = objectData
        }
        // Ensure we have an object
        if (!_.isObject(data) || _.isArray(data) || data === null) {
          data = {}
        }
      } catch (error) {
        // never overwrite what could not be read: keep the file aside, so it can be repaired or restored
        const kept = `${this.location}.corrupt-${Date.now()}`
        await nodeFs.promises.rename(this.location, kept)
        logger.error(`Parsing error: [${this.location}], the file was moved to ${kept} and the store starts empty`, error)
        data = {}
      }
      // Convert object to Map entries for storage
      const entries = []
      for (const [prefixedKey, value] of Object.entries(data)) {
        // Remove $ prefix from keys when loading
        const key = prefixedKey.startsWith('$') ? prefixedKey.substring(1) : prefixedKey
        if (_.isString(value)) {
          // Handle index and clock keys - they should not be double-encoded
          if (key.startsWith('ÿ index') || key.startsWith('ÿ clock')) {
            // For index and clock keys, clean up any double encoding and store as proper JSON strings
            let cleanValue = value
            // Remove extra quotes if they exist
            if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
              try {
                cleanValue = JSON.parse(cleanValue)
                // If it's still a quoted string after parsing, parse again
                if (_.isString(cleanValue) && cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
                  cleanValue = JSON.parse(cleanValue)
                }
              } catch {
                // If parsing fails, just use the original value without quotes
                cleanValue = cleanValue.slice(1, -1)
              }
            }
            // Store as proper JSON string (single encoding only)
            entries.push([key, JSON.stringify(cleanValue)])
          } else {
            // For record keys, handle normally
            try {
              // Try parsing to see what we have
              JSON.parse(value)
              // abstract-level will call JSON.parse() on what we return
              // So we need to return a JSON string that will parse to the correct final value
              entries.push([key, value])
            } catch {
              // Not valid JSON, treat as raw string value
              // We want final result to be this string, so store it JSON-encoded
              entries.push([key, JSON.stringify(value)])
            }
          }
        } else {
          // For non-string values (objects, arrays, etc.), JSON encode them
          // This handles cases where the file has already-parsed objects
          entries.push([key, JSON.stringify(value)])
        }
      }
      this._store = new Map(entries)
      this._keysChanged()
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err
      }
      this._store = new Map()
      this._keysChanged()
    }
  }
  // abstract-level runs the prewrite hooks before the operations reach _put, _del and _batch (it turns put and del into
  // batches while a hook is registered), so the hooks must not run again here
  async _put(key, value, _options) {
    return this._enqueueWrite(async () => {
      if (this._closing) {
        throw new Error('Database is closing, no new writes allowed')
      }
      const known = this._store.has(key)
      this._store.set(key, this._storedValue(key, value))
      if (!known) {
        this._keyAdded(key)
      }
      // Schedule a debounced persist, but do not await it
      this._schedulePersist()
    })
  }
  /**
   * The value as the store keeps it. Index and clock entries are kept as json text (abstract-level decodes with
   * JSON.parse), records arrive as text already.
   */
  _storedValue(key, value) {
    if (key.startsWith('ÿ index') || key.startsWith('ÿ clock')) {
      if (!_.isString(value)) {
        return JSON.stringify(value)
      }
      try {
        JSON.parse(value)
        return value
      } catch {
        return JSON.stringify(value)
      }
    }
    return _.isString(value) ? value : JSON.stringify(value)
  }
  async _get(key, _options) {
    if (!this._store.has(key)) {
      const notFoundError = new Error(`Key not found in database [${key}]`)
      notFoundError.code = 404
      throw notFoundError
    }
    const value = this._store.get(key)
    return value
  }
  async _del(key, _options) {
    return this._enqueueWrite(async () => {
      if (this._closing) {
        throw new Error('Database is closing, no new writes allowed')
      }
      if (this._store.delete(key)) {
        this._keyRemoved(key)
      }
      // Schedule a debounced persist, but do not await it
      this._schedulePersist()
    })
  }
  async _batch(operations, _options) {
    return this._enqueueWrite(async () => {
      if (this._closing) {
        throw new Error('Database is closing, no new writes allowed')
      }
      // a big batch is cheaper to sort once than to bisect in key by key
      const rebuild = operations.length > 64
      for (const op of operations) {
        if (op.type === 'put') {
          const known = this._store.has(op.key)
          this._store.set(op.key, this._storedValue(op.key, op.value))
          if (!known && !rebuild) {
            this._keyAdded(op.key)
          }
        } else if (op.type === 'del') {
          if (this._store.delete(op.key) && !rebuild) {
            this._keyRemoved(op.key)
          }
        }
      }
      if (rebuild) {
        this._keysChanged()
      }
      // Schedule a debounced persist, but do not await it
      this._schedulePersist()
    })
  }
  /**
     * Enqueue a write operation to ensure all writes are serialized.
     * @param {Function} fn - The async function to execute.
     */
  async _enqueueWrite(fn) {
    return new Promise((resolve, reject) => {
      this._writeQueue.push({ fn, resolve, reject })
      this._processWriteQueue()
    })
  }

  async _processWriteQueue() {
    if (this._writeInProgress) return
    const next = this._writeQueue.shift()
    if (!next) return
    this._writeInProgress = true
    try {
      const result = await next.fn()
      next.resolve(result)
    } catch (err) {
      next.reject(err)
    } finally {
      this._writeInProgress = false
      // eslint-disable-next-line no-undef
      setImmediate(() => this._processWriteQueue())
    }
  }
  _iterator(options) {
    return new SingleJsonFileIterator(this, options)
  }
}

module.exports = JsonDOWN
