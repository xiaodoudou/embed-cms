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
 * Replication of the records of a resource with its peers over websockets on the HTTP port (protocol.js), and of the
 * files of their attachments over http.
 *
 * Every connection pulls: a node connects to a peer for a resource it receives from it, and the peer sends its changes,
 * the missing ones first, then each one as it is written (links.js). So this side of the protocol only sends: a peer that
 * connects can read what it may, and can never write here. The stores that keep an id per peer (MongoDB, PostgreSQL)
 * get the id of the peer passed to their sync.
 */
class Replicator {
  constructor (cms) {
    this.cms = cms
    const replication = _.get(cms.options, 'replication', {})
    this.secret = replication.secret
    this.strict = !!_.get(cms, 'security.strictReplication', false)
    this.passRemoteId = _.includes(['mongodb', 'postgres'], _.get(cms.options, 'dbEngine.type'))
    // the peers connected here, by connection: what they pull, since when, and what went to them
    this.served = new Map()
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
   * A peer connected to pull a resource: it gets what it lacks, then each change as it is written, until it goes away.
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
    const entry = { resource: name, peer: String(remoteId), since: Date.now(), sent: 0, lastSentAt: null }
    this.served.set(socket, entry)
    try {
      await resource.json.sync(socket, false, this.passRemoteId ? remoteId : null, {
        pull: false,
        push: true,
        live: resource.json.supportsLive,
        onSent: () => {
          entry.sent += 1
          entry.lastSentAt = Date.now()
        }
      })
    } finally {
      this.served.delete(socket)
    }
  }

  /**
   * @returns {Array<{resource: string, peer: string, since: number, sent: number, lastSentAt: number|null}>} the peers pulling from this node now
   */
  servedLinks () {
    return [...this.served.values()].map((entry) => ({ ...entry }))
  }

  /**
   * Connects to a peer for a resource, once the handshake is over.
   * @param {{url: string}} peer the url of its REST API, which gives the address of its replication websocket
   * @param {string} name the resource
   * @returns {Promise<{socket: import('stream').Duplex, remoteId: string}>}
   */
  connect (peer, name) {
    if (!this.secret) {
      return Promise.reject(new Error('replication.secret is required to replicate with a peer'))
    }
    let address
    try {
      address = protocol.replicationUrl(_.get(peer, 'url'))
    } catch (error) {
      return Promise.reject(error)
    }
    return new Promise((resolve, reject) => {
      protocol.Client(address, name, this.cms.options.mid, (error, socket, remoteId) => {
        if (error || !socket) {
          reject(error || new Error('The replication peer closed the connection'))
        } else {
          resolve({ socket, remoteId })
        }
      }, { secret: this.secret })
    })
  }

  /**
   * Deals with the records received from a peer: the files of attachments that are gone are removed, the files that are
   * missing or changed are downloaded from the peer.
   * @param {string} name the resource
   * @param {string} baseUrl the REST API of the peer the records came from
   * @returns {Promise<number>} how many records were dealt with
   */
  async processReceived (name, baseUrl) {
    const resource = this.cms.resource(name)
    const funcs = []
    const received = new EntryStream(resource.json._db, {
      gte: '\xFF new\x00',
      lte: '\xFF new\xFF',
      valueEncoding: 'json'
    })
    for await (const data of received) {
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
    // a local store marks what it received: with nothing marked there are no files to fetch (MongoDB and PostgreSQL
    // mark nothing, so their files are always compared)
    if (funcs.length === 0 && !this.passRemoteId) {
      return 0
    }
    await syncAttachment(resource, baseUrl, () => resource.cleanAttachment())
    return funcs.length
  }
}

exports = module.exports = Replicator
