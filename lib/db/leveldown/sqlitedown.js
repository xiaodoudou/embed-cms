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

  async _put (key, value, options) {
    this._write(options, () => this._put1.run(key, value))
  }

  async _del (key, options) {
    this._write(options, () => this._del1.run(key))
  }

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

  scan (options) {
    return scanRecords(this, options)
  }

  async recordCount () {
    await this._ready()
    // the keys of the replication (U+00FF and above) are not records
    return this._db.prepare('SELECT COUNT(*) AS n FROM kv WHERE key < ?').get(FIRST_INTERNAL_KEY).n
  }

  async _ready () {
    if (this.status !== 'open') {
      await this.open()
    }
  }

  _iterator (options) {
    return new SqliteIterator(this, options)
  }
}

module.exports = SqliteDOWN
