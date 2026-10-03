

const JSONStream = require('JSONStream')
const through = require('through')
const pAll = require('p-all')
const _ = require('lodash')
const {setTimeout} = require('node:timers/promises')
const { EntryStream } = require('level-read-stream')
const logger = require('../../logger')
const { validatePeerRecord, isMachineId } = require('../../plugins/replicator/validate')
/*
 * Const
 */

/*
 * Constructor
 *
 * @param {Object} database, instnace of leveldb
 * @param {String} id, unique database instance id, used for replication
 * @param {Object} options
 *   @param {String} type, replication type (normal, upstream, downstream)
 *
 */

class SyncMongoDb {
  constructor (db, id, options) {
    this.db = db
    this.id = id
    this.options = options
    this.tag = `${_.get(options, 'cms.tag')} - ${options.name}`
  }

  /**
   * Streams the local changes to the peer, once its receiving side is ready.
   * @param {import('net').Socket} socket
   * @param {boolean} isSendDataOut
   * @returns {Promise<void>}
   */
  async pipeLocalDataToSocket (socket, isSendDataOut, _slave) {
    await setTimeout(500) // wait the receive socket is ready
    return new Promise((resolve, reject) => {
      let stream
      if (isSendDataOut) {
        stream = new EntryStream(this.db, {
          start: '\x00',
          end: '\xFF',
          valueEncoding: 'utf8',
          query: {
            _id: {
              $regex: new RegExp(`^.{8}${_.escapeRegExp(this.id)}`)
            }
          }
        })
      } else {
        stream = new EntryStream(this.db, {
          valueEncoding: 'utf8',
          query: {
            _id: 'INVALID_ID'
          }
        })
      }
      // send data to slave
      stream
        // .on('data', data => {
        //   console.log(111, this.tag, 'send', data.key)
        // })
        .on('end', () => {
          resolve()
        })
        .on('error', error => {
          reject(error)
        })
        .pipe(JSONStream.stringify())
        .pipe(socket)
        .on('error', error => {
          reject(error)
        })
    })
    // console.log(333, this.tag, 'send done')
  }

  /**
   * Writes the changes the peer sends, each one validated (and within `maxRecordBytes` under strict replication).
   * @param {import('net').Socket} socket
   * @param {string} remoteId the machine id of the peer
   * @returns {Promise<void>}
   */
  async onReceiveDataFromSocket (socket, remoteId) {
    // receive data from slave
    const strict = !!_.get(this.options, 'cms.securitySettings.strictReplication', false)
    const maxRecordBytes = _.get(this.options, 'cms.replication.maxRecordBytes')
    return new Promise((resolve, reject) => {
      const remoteKeys = []
      socket
        // .on('data', data => {
        //   console.log(222, this.tag, 'receive', _.toString(data))
        // })
        .pipe(JSONStream.parse())
        .pipe(through(
          async data => {
            if (!_.isArray(data)) {
              data = _.compact([data])
            }
            await pAll(_.map(data, item => {
              return async () => {
                if (strict) {
                  const check = validatePeerRecord(item, remoteId, maxRecordBytes)
                  if (!check.ok) {
                    return logger.warn(`Replication: record refused (${check.reason})`)
                  }
                }
                try {
                  remoteKeys.push(item.key)
                  await this.db.put(item.key, item.value)
                } catch (error) {
                  logger.error('Replication: could not write a record of the peer:', error.message)
                }
              }
            }), {concurrency: 1})
          },
          () => {
            resolve(remoteKeys)
          }
        ))
        .on('error', error => {
          reject(error)
        })
    })
    // console.log(444, 'onReceiveDataFromSocket', this.tag)
  }

  /**
   * Removes the records of a peer that it no longer has.
   * @param {string} id the machine id of the peer
   * @param {string[]} keys the keys it still has
   * @returns {Promise<void>}
   */
  async cleanRemoteData (id, keys) {
    return new Promise((resolve, reject) => {
      const stream = new EntryStream(this.db, {
        start: '\x00',
        end: '\xFF',
        valueEncoding: 'utf8',
        query: {
          $and: [
            {
              _id: {
                $regex: new RegExp(`^.{8}${_.escapeRegExp(id)}`)
              }
            },
            {
              _id: {
                $nin: keys
              }
            }
          ]
        }
      })
      stream
        .pipe(through(async item => {
          await this.db.del(item.key)
        }, () => {
          resolve()
        }))
        .on('error', error => {
          reject(error)
        })
    })
  }

  /**
   * Exchanges the changes with a peer: its id checked, its records received, the local ones sent.
   * @param {import('net').Socket} socket
   * @param {boolean} slave whether this side connected to the peer
   * @param {string} remoteId the machine id of the peer
   */
  async sync (socket, slave, remoteId) {
    if (!isMachineId(remoteId)) {
      // the id is used to find the records of the peer: it is not taken as it comes from the network
      throw new Error('Invalid replication peer id')
    }
    const type = this.options.type
    const isSendDataOut = type === 'normal' || (slave && type === 'upstream') || (!slave && type === 'downstream')
    let remoteKeys
    if (slave) {
      await pAll([
        async () => {
          await this.pipeLocalDataToSocket(socket, isSendDataOut, slave)
        },
        async () => {
          remoteKeys = await this.onReceiveDataFromSocket(socket, remoteId)
        }
      ], {concurrency: 1})
      socket.destroy()
    } else {
      await pAll([
        async () => {
          remoteKeys = await this.onReceiveDataFromSocket(socket, remoteId)
        },
        async () => {
          await this.pipeLocalDataToSocket(socket, isSendDataOut, slave)
        }
      ], {concurrency: 1})
    }
    await this.cleanRemoteData(remoteId, remoteKeys)
  }
}

exports = module.exports = SyncMongoDb
