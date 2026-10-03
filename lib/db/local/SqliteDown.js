const fs = require('fs')
const path = require('path')
const { AbstractLevel, AbstractIterator } = require('abstract-level')
const { scanRecords, FIRST_INTERNAL_KEY } = require('./records')

// rows an iterator fetches per round trip: the iterator pages by key, so a long scan never holds a cursor open
const PAGE = 256

/**
 * An iterator over a key range of the table, one page of rows at a time.
 */
class SqliteIterator extends AbstractIterator {
  constructor (db, options) {
    super(db, options)
    const { gte, lte, gt, lt, reverse, limit } = options || {}
    this._reverse = !!reverse
    this._left = limit !== undefined && limit > -1 ? limit : Infinity
    // the bounds, as the pager moves them: [value, inclusive]
    this._low = gte !== undefined ? [gte, true] : gt !== undefined ? [gt, false] : null
    this._high = lte !== undefined ? [lte, true] : lt !== undefined ? [lt, false] : null
    this._rows = []
    this._index = 0
    this._done = false
  }

  /** Reads the next page of rows, from the last key seen, within the range and the limit. */
  _fetch () {
    const where = []
    const params = []
    if (this._low) {
      where.push(`key ${this._low[1] ? '>=' : '>'} ?`)
      params.push(this._low[0])
    }
    if (this._high) {
      where.push(`key ${this._high[1] ? '<=' : '<'} ?`)
      params.push(this._high[0])
    }
    const size = Math.min(PAGE, this._left)
    const sql = `SELECT key, value FROM kv${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY key ${this._reverse ? 'DESC' : 'ASC'} LIMIT ${size}`
    this._rows = this.db._db.prepare(sql).all(...params)
    this._index = 0
    if (this._rows.length < size) {
      this._done = true
    } else if (this._reverse) {
      this._high = [this._rows[this._rows.length - 1].key, false]
    } else {
      this._low = [this._rows[this._rows.length - 1].key, false]
    }
  }

  /** @returns {Promise<[string, *]|undefined>} the next entry; nothing at the end */
  async _next () {
    if (this._left <= 0) {
      return undefined
    }
    if (this._index >= this._rows.length) {
      if (this._done) {
        return undefined
      }
      this._fetch()
      if (!this._rows.length) {
        return undefined
      }
    }
    const row = this._rows[this._index++]
    this._left--
    return [row.key, row.value]
  }
}

/**
 * A key-value store on disk in a single SQLite file, behind the abstract-level interface, like jsondown, mongodown and
 * pgdown. Nothing is kept in memory: reads come from the page cache of SQLite, writes go to its write-ahead log, so a
 * crash never leaves a torn file.
 */
class SqliteDOWN extends AbstractLevel {
  constructor (location, options = {}) {
    super({ encodings: { utf8: true, buffer: true, view: true } }, options)
    this.location = location
  }

  /** Opens the file (WAL mode, synced at checkpoints), creates the table, prepares the statements. */
  async _open (_options) {
    // node:sqlite is loaded here, so the module and its experimental warning only matter to a store that uses it
    const { DatabaseSync } = require('node:sqlite')
    fs.mkdirSync(path.dirname(this.location), { recursive: true })
    this._db = new DatabaseSync(this.location)
    this._db.exec('PRAGMA journal_mode = WAL')
    // the log is synced at checkpoints, not at every commit, unless the write asks for it (sync: true): a power cut
    // can lose the last commits but never corrupts
    this._db.exec('PRAGMA synchronous = NORMAL')
    this._db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID')
    this._get1 = this._db.prepare('SELECT value FROM kv WHERE key = ?')
    this._put1 = this._db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    this._del1 = this._db.prepare('DELETE FROM kv WHERE key = ?')
  }

  async _close () {
    if (this._db) {
      this._db.close()
      this._db = null
    }
  }

  /**
   * @param {string} key
   * @returns {Promise<*>} the value; the not-found error abstract-level expects
   */
  async _get (key, _options) {
    const row = this._get1.get(key)
    if (!row) {
      const notFoundError = new Error(`Key not found in database [${key}]`)
      notFoundError.code = 404
      throw notFoundError
    }
    return row.value
  }

  /**
   * Runs a write. With `sync: true`, as LevelDB takes it, the log is synced before the write is answered, so it also
   * survives a power cut and not only a crash of the process; without it a power cut can lose the last writes.
   */
  _write (options, write) {
    const durable = !!(options && options.sync)
    if (durable) {
      this._db.exec('PRAGMA synchronous = FULL')
    }
    try {
      write()
    } finally {
      if (durable) {
        this._db.exec('PRAGMA synchronous = NORMAL')
      }
    }
  }

  /**
   * @param {string} key
   * @param {*} value
   * @param {{sync?: boolean}} [options] synced before answering when `sync` (see _write)
   */
  async _put (key, value, options) {
    this._write(options, () => this._put1.run(key, value))
  }

  /**
   * @param {string} key
   * @param {{sync?: boolean}} [options] synced before answering when `sync` (see _write)
   */
  async _del (key, options) {
    this._write(options, () => this._del1.run(key))
  }

  /**
   * Applies several writes in one transaction.
   * @param {{type: 'put'|'del', key: string, value?: *}[]} operations
   * @param {{sync?: boolean}} [options]
   */
  async _batch (operations, options) {
    this._write(options, () => {
      this._db.exec('BEGIN')
      try {
        for (const op of operations) {
          if (op.type === 'put') {
            this._put1.run(op.key, op.value)
          } else if (op.type === 'del') {
            this._del1.run(op.key)
          }
        }
        this._db.exec('COMMIT')
      } catch (error) {
        this._db.exec('ROLLBACK')
        throw error
      }
    })
  }

  /**
   * @param {{needles?: string[][], predicate?: function(object): boolean, limit?: number}} [options] see records.js
   * @returns {Promise<object[]>} the records
   */
  scan (options) {
    return scanRecords(this, options)
  }

  /** @returns {Promise<number>} the records, the keys of the replication left out */
  async recordCount () {
    await this._ready()
    // the keys of the replication (U+00FF and above) are not records
    return this._db.prepare('SELECT COUNT(*) AS n FROM kv WHERE key < ?').get(FIRST_INTERNAL_KEY).n
  }

  /** Opens the store if it is not open yet, for the reads that go straight to it. */
  async _ready () {
    if (this.status !== 'open') {
      await this.open()
    }
  }

  /**
   * @param {object} options the range (gt, gte, lt, lte, reverse, limit)
   * @returns {SqliteIterator}
   */
  _iterator (options) {
    return new SqliteIterator(this, options)
  }
}

module.exports = SqliteDOWN
