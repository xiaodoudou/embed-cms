const _ = require('lodash')
const { default: pAll } = require('p-all')
const { EntryStream } = require('level-read-stream')
const logger = require('../../logger')
const protocol = require('./protocol')
const { addUpgradeRoute, refuseUpgrade } = require('../../util/upgrades')
const { syncAttachment, isSafeFileId } = require('./attachments')
const { isMachineId } = require('./validate')

const RESOURCE_NAME = /^[\w-]+$/

/**
 * Replication of the records of a resource with a peer over a websocket on the HTTP port (protocol.js), and of the files
 * of their attachments over http. The stores that keep an id per peer (MongoDB, PostgreSQL) get the id of the peer
 * passed to their sync.
 */
class Replicator {
  constructor (cms) {
    this.cms = cms
    const replication = _.get(cms.options, 'replication', {})
    this.secret = replication.secret
    this.settleDelay = _.isNumber(replication.settleDelay) ? replication.settleDelay : 2000
    this.strict = !!_.get(cms, 'security.strictReplication', false)
    this.passRemoteId = _.includes(['mongodb', 'postgres'], _.get(cms.options, 'dbEngine.type'))
    if (cms.options.netPort) {
      logger.warn('netPort is no longer used: peers replicate over the HTTP port, at /_replicator next to the REST API. Remove netPort, and give each peer the url of its API.')
    }
  }

  /**
   * Listens for peers on the HTTP server of the CMS, when replication.secret is set: without it, no peer could prove who
   * it is, so nothing listens.
   * @param {import('http').Server} [httpServer]
   */
  listen (httpServer) {
    if (!httpServer || this.server) {
      return
    }
    if (!this.secret) {
      // the path stays this plugin's, so that a peer is told nothing replicates here rather than meeting another socket
      const removeRoute = addUpgradeRoute(httpServer, {
        match: (pathname) => pathname.endsWith(protocol.PATH_END),
        handle: (req, socket) => refuseUpgrade(socket, 404)
      })
      this.server = { close: () => Promise.resolve(removeRoute()) }
      return
    }
    this.server = protocol.Server(httpServer, this.cms.options.mid, (error, socket, name, remoteId) => {
      this.onPeer(error, socket, name, remoteId).catch((failure) => {
        logger.error('Replication with a peer failed:', failure.message)
        socket.destroy()
      })
    }, { secret: this.secret })
  }

  /**
   * Stops listening for peers.
   * @returns {Promise<void>}
   */
  close () {
    return this.server ? this.server.close() : Promise.resolve()
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
   * @param {{url: string}} peer - the url of its REST API, which also gives the address of its replication websocket
   * @param {string} name
   * @param {string} [recordId]
   * @returns {Promise<{records: number}>} resolves once the records and their attachments are in sync
   */
  async replicate (peer, name, recordId) {
    if (!this.secret) {
      throw new Error('replication.secret is required to replicate with a peer')
    }
    const baseUrl = _.get(peer, 'url')
    const address = protocol.replicationUrl(baseUrl)
    const resource = this.resource(name)

    // Convert protocol.Client callback to Promise
    const [socket, remoteId] = await new Promise((resolve, reject) => {
      protocol.Client(address, name, this.cms.options.mid, (error, socket, id) => {
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
