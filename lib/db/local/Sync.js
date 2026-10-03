const timestamp = require('../../util/timestamp')
const logger = require('../../logger')
const _ = require('lodash')
const mps = require('msgpack-stream')
const { EntryStream } = require('level-read-stream')
const { validateChange, isClock, REPLICA_PREFIX } = require('../../plugins/replicator/validate')

/*
 * Const
 */

const replicaPrefix = REPLICA_PREFIX
const indexPrefix = '\xFF index'
const clockPrefix = '\xFF clock'
// marks the records received from a peer, until the replicator has dealt with their attachments
const newPrefix = '\xFF new '

const clockRange = {
  gte: `${clockPrefix} `,
  lte: `${clockPrefix}\xFF`
}

/**
 * Keeps track of what changed in a store, and exchanges the changes with a peer.
 *
 * Every write is recorded in the store itself: an index entry `\xFF index <machine> <timestamp>` that points to the key
 * that changed, and the latest timestamp per machine in `\xFF clock <machine>`. Two stores exchange their clocks, and
 * the one that has newer entries of a machine sends them, one change per request. A change a peer sends arrives as a
 * replica key (`<prefix> <machine> <timestamp> <key>`): the hook stores the record under its own key, keeps the
 * machine and the timestamp of its origin, and marks it as new.
 */
class Sync {
  constructor(db, id, options) {
    this.db = db
    this.id = id
    this.options = options
    this.clock = {}
    this.wrap()
  }

  /**
   * @param {*} str
   * @param {string} prefix
   * @returns {boolean} false for a key that is not a string
   */
  startsWith(str, prefix) {
    return str && str.startsWith(prefix)
  }

  /**
   * @param {string} namespace the machine id
   * @param {string} ts the timestamp
   * @returns {string} the key of the index entry of a change
   */
  indexKey(namespace, ts) {
    return `${indexPrefix} ${namespace} ${ts}`
  }

  /**
   * @param {string} namespace the machine id
   * @returns {string} the key of the clock of the machine
   */
  clockKey(namespace) {
    return `${clockPrefix} ${namespace}`
  }

  /** Hooks the store: every write of a record gets an index entry and moves the clock; a change a peer sent is stored under its own key and marked new. */
  wrap() {
    if (!this.db.hooks || !this.db.hooks.prewrite || typeof this.db.hooks.prewrite.add !== 'function') {
      throw new Error('Database instance does not support hooks.prewrite. Class: ' + this.db.constructor.name)
    }
    const clock = this.clock
    const id = this.id
    this.db.hooks.prewrite.add((change, batch) => {
      // internal keys (indexes, clocks, markers) are not changes of the data
      if (this.startsWith(change.key, '\xFF')) {
        return
      }
      let ts, namespace
      if (this.startsWith(change.key, replicaPrefix)) {
        const parts = change.key.split(' ')
        parts.shift()
        namespace = parts.shift()
        ts = parts.shift()
        change.key = parts.join(' ')
        // the record as it arrived (json text), so it is read back as the record
        batch.add({ type: 'put', key: `${newPrefix}${change.key}`, value: change.value, valueEncoding: 'utf8' })
      } else {
        ts = timestamp()
        namespace = id
      }
      batch.add({ type: 'put', key: this.indexKey(namespace, ts), value: change.key })
      const k = this.clockKey(namespace)
      const local = clock[k] || '0'
      if (local > ts) {
        ts = local
      } else {
        clock[k] = ts
      }
      batch.add({ type: 'put', key: k, value: ts.toString() })
    })
  }

  /**
   * Reads the clock kept in the store (once): what was recorded before this process started.
   * @returns {Promise<void>}
   */
  loadClock() {
    if (!this.loaded) {
      this.loaded = (async () => {
        for await (const entry of new EntryStream(this.db, clockRange)) {
          const value = String(entry.value)
          if (!this.clock[entry.key] || this.clock[entry.key] < value) {
            this.clock[entry.key] = value
          }
        }
      })()
    }
    return this.loaded
  }

  /**
   * The oldest change of a machine after a time.
   * @param {string} name - machine id
   * @param {string} time - the newest change the peer has of that machine, '' for none
   * @returns {Promise<{ts: string, key: string}|undefined>}
   */
  async nextChange(name, time) {
    const range = { gte: `${this.indexKey(name, time)}  `, lte: this.indexKey(name, '\xFF'), limit: 1 }
    for await (const entry of new EntryStream(this.db, range)) {
      return { ts: entry.key.split(' ')[3], key: String(entry.value) }
    }
    return undefined
  }

  /**
   * Exchanges changes with a peer over a socket, until neither has anything the other lacks.
   * @param {net.Socket} socket
   * @param {boolean} slave - true when this side opened the connection
   * @returns {Promise<null>} resolves when the peer has ended
   */
  async sync(socket, slave) {
    await this.loadClock()
    return new Promise((resolve, reject) => {
      const db = this.db
      const clock = this.clock
      const type = this.options.type
      // a peer may only send well formed changes to records of other nodes (see replicator/validate.js)
      const strict = !!_.get(this.options, 'cms.securitySettings.strictReplication', false)
      const maxRecordBytes = _.get(this.options, 'cms.replication.maxRecordBytes')
      const pullChanges = (type === 'normal') || (type === 'downstream' && slave) || (type === 'upstream' && !slave)
      const pushChanges = (type === 'normal') || (type === 'downstream' && !slave) || (type === 'upstream' && slave)
      let pushClosed = !pushChanges
      let pullClosed = !pullChanges
      const encode = mps.createEncodeStream()
      const decode = mps.createDecodeStream()
      let closing = false
      const end = () => {
        if (!closing) {
          closing = true
          encode.end()
        }
      }
      const send = (frame) => encode.write(frame)
      const ask = () => send({ op: 'clock', value: clock })

      const receive = async (data) => {
        if (data.op === 'put' || data.op === 'del') {
          if (!pullChanges) {
            return pushClosed && end()
          }
          if (strict) {
            const check = validateChange(data, { ownId: this.id, maxRecordBytes })
            if (!check.ok) {
              logger.warn(`Replication: change refused (${check.reason})`)
              return ask()
            }
          }
          try {
            if (data.op === 'put') {
              await db.put(data.key, data.value, { valueEncoding: 'utf8' })
            } else {
              await db.del(data.key)
            }
          } catch (error) {
            logger.error(error)
          }
          return ask()
        }
        if (data.op !== 'clock' || !isClock(data.value)) {
          // 'end', and whatever is not a frame of this protocol
          return
        }
        if (!pushChanges) {
          return pullClosed && end()
        }
        const clientClock = data.value
        let target
        _.find(clock, (time, name) => {
          if (!clientClock[name]) {
            target = { name: name.split(' ')[2], time: '' }
            return true
          } else if (clientClock[name] < time) {
            target = { name: name.split(' ')[2], time: clientClock[name] }
            return true
          }
          return false
        })
        if (pullChanges) {
          pullClosed = true
          _.find(clientClock, (time, name) => {
            if (!clock[name] || clock[name] < time) {
              pullClosed = false
              return true
            }
            return false
          })
        }
        const change = target && await this.nextChange(target.name, target.time)
        if (!change) {
          pushClosed = true
          return pullClosed && end()
        }
        const key = [replicaPrefix, target.name, change.ts, change.key].join(' ')
        let record
        try {
          record = await db.get(change.key, { valueEncoding: 'utf8' })
        } catch (error) {
          if (!(error.notFound || error.code === 404 || error.code === 'LEVEL_NOT_FOUND')) {
            return logger.info('ERROR: trying to pull index key from database', error)
          }
        }
        send(record === undefined ? { key, op: 'del' } : { key, op: 'put', value: record })
      }

      // frames are handled one at a time, in the order they arrived
      const queue = []
      let busy = false
      const pump = async () => {
        if (busy) {
          return
        }
        busy = true
        while (queue.length && !closing) {
          const data = queue.shift()
          try {
            if (_.isPlainObject(data)) {
              await receive(data)
            }
          } catch (error) {
            logger.error('Replication: a frame could not be handled:', error)
          }
        }
        busy = false
      }
      decode.on('data', (data) => {
        queue.push(data)
        pump()
      })

      // a peer that sends garbage or resets the connection must not raise an error nobody listens to
      const fail = (error) => {
        socket.destroy()
        reject(error)
      }
      socket.on('error', fail)
      decode.on('error', fail)
      encode.on('error', fail)
      socket.on('end', () => resolve(null))
      socket.on('close', () => resolve(null))
      socket.pipe(decode)
      encode.pipe(socket)

      if (pullChanges) {
        ask()
      }
    })
  }
}


module.exports = Sync
