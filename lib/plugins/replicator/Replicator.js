const _ = require('lodash')
const pAll = require('p-all')
const { EntryStream } = require('level-read-stream')
const logger = require('../../logger')
const protocol = require('./protocol')
const { syncAttachment, isSafeFileId } = require('./attachments')
const { isMachineId } = require('./validate')

const RESOURCE_NAME = /^[\w-]+$/

/**
 * Replication of the records of a resource with a peer over the replication port, and of the files of their
 * attachments over http. The stores that keep an id per peer (MongoDB, PostgreSQL) get the id of the peer passed to
 * their sync.
 */
class Replicator {
  constructor (cms) {
    this.cms = cms
    const replication = _.get(cms.options, 'replication', {})
    this.secret = replication.secret
    this.settleDelay = _.isNumber(replication.settleDelay) ? replication.settleDelay : 2000
    this.strict = !!_.get(cms, 'security.strictReplication', false)
    this.passRemoteId = _.includes(['mongodb', 'postgres'], _.get(cms.options, 'dbEngine.type'))
    /* Documents Replication */
    if (cms.options.netPort) {
      if (this.strict && !this.secret) {
        throw new Error('replication.secret is required when netPort is set: peers must prove they know it (set it on every node, or set security.strictReplication to false)')
      }
      this.server = protocol.Server(cms.options.netPort, cms.options.mid, (error, socket, name, remoteId) => {
        this.onPeer(error, socket, name, remoteId).catch((failure) => {
          logger.error('Replication with a peer failed:', failure.message)
          socket.destroy()
        })
      }, { secret: this.secret })
    }
  }

  /**
   * Stops listening for peers.
   * @returns {Promise<void>}
   */
  close () {
    return this.server ? this.server.closeAll() : Promise.resolve()
  }

  /**
   * Names a peer may ask for: plain names always, and only resources this node has when the profile is strict (a
   * peer must not make the node create resources, and with them folders and databases).
   * @param {*} name
   * @returns {boolean}
   */
  isServedResource (name) {
    return _.isString(name) && RESOURCE_NAME.test(name) && (!this.strict || _.includes(this.cms._resourceNames, name))
  }

  /**
   * A peer connected, or failed to: starts the exchange of the changes.
   * @param {Error|null} error
   * @param {import('stream').Duplex} socket
   * @param {string} name the resource
   * @param {string} remoteId the machine id of the peer
   */
  async onPeer (error, socket, name, remoteId) {
    if (error) {
      return logger.info('SERVER ERROR:', error)
    }
    if (!this.isServedResource(name) || (this.passRemoteId && !isMachineId(remoteId))) {
      logger.warn(`Replication request refused for resource ${JSON.stringify(name)}`)
      return socket.destroy()
    }
    const resource = this.cms.resource(name)
    if (!this.passRemoteId) {
      const no = await resource.json.cleanIndex()
      if (no > 0) {
        logger.info(`${name}: cleaned ${no} index`)
      }
    }
    await resource.json.sync(socket, false, this.passRemoteId ? remoteId : null)
  }

  /**
   * @param {string} name
   * @returns {object} the resource of the CMS
   */
  resource (name) {
    return this.cms.resource(name)
  }

  /**
   * Replicate a resource: its pending changes, then the attachments (only those of recordId when it is given)
   * @param {string} host
   * @param {number} port
   * @param {string} baseUrl - http url of the peer's api, for the attachments
   * @param {string} name
   * @param {string} [recordId]
   * @returns {Promise<{records: number}>} resolves once the records and their attachments are in sync
   */
  async replicate (host, port, baseUrl, name, recordId) {
    if (this.strict && !this.secret) {
      throw new Error('replication.secret is required to replicate with a peer')
    }
    const resource = this.resource(name)

    // Convert protocol.Client callback to Promise
    const [socket, remoteId] = await new Promise((resolve, reject) => {
      protocol.Client(host, port, name, this.cms.options.mid, (error, socket, id) => {
        if (error || !socket) {
          reject(error || new Error('The replication peer closed the connection'))
        } else {
          resolve([socket, id])
        }
      }, { secret: this.secret })
    })

    // the records: the peers exchange every change the other has not seen, a record id cannot narrow that down
    const remote = this.passRemoteId ? remoteId : null
    const failure = await resource.json.sync(socket, true, remote)
    if (failure) {
      throw failure
    }
    // sync attachment (optionally filter by recordId)
    const funcs = []
    const received = new EntryStream(resource.json._db, {
      gte: '\xFF new\x00',
      lte: '\xFF new\xFF',
      valueEncoding: 'json'
    })
    for await (const data of received) {
      if (recordId && data.value._id !== recordId) {
        continue
      }
      funcs.push(async () => {
        let removeAttachmentIds = []
        try {
          const previous = await resource.json._db.get(`\xFF old ${data.value._id}`)
          removeAttachmentIds = _.map((_.isString(previous) ? JSON.parse(previous) : previous)._attachments, '_id')
        } catch {
        }
        removeAttachmentIds = _.filter(_.difference(removeAttachmentIds, _.map(data.value._attachments, '_id')), isSafeFileId)
        await pAll(_.map(removeAttachmentIds, id => {
          return async () => {
            await resource.file.remove(id)
            logger.info(`file removed: ${id}`)
          }
        }), {concurrency: 10})
        await resource.json._db.batch([
          { type: 'del', key: data.key },
          {
            type: 'put',
            key: `\xFF old ${data.value._id}`,
            value: data.value,
            valueEncoding: 'json'
          }
        ])
      })
    }
    await pAll(funcs, {concurrency: 1})
    if (this.settleDelay > 0) {
      // the peer may still be flushing what it received
      await new Promise(resolve => setTimeout(resolve, this.settleDelay))
    }
    await syncAttachment(resource, baseUrl, () => resource.cleanAttachment())
    if (!this.passRemoteId) {
      const no = await resource.json.cleanIndex()
      if (no > 0) {
        logger.info(`${name}: cleaned ${no} index`)
      }
    }
    return { records: funcs.length }
  }
}

exports = module.exports = Replicator
