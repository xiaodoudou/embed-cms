const _ = require('lodash')
const logger = require('../../logger')
const express = require('express')
const Replicator = require('./Replicator')

const defaults = {}

class ReplicatorManager {
  constructor(cms, options) {
    this.cms = cms
    this.options = _.extend({}, defaults, options)
    this.cms.$replicator = this
    this.initialize()
  }

  /** Starts the replicator and mounts its routes. */
  initialize = () => {
    this.replicator = new Replicator(this.cms)
    // Mount API router
    const app = express()
    // List all resources, their type, and sync directions/peers
    app.get('/resources', this.onGetResources)
    // Trigger sync for all records of a resource
    app.post('/sync/:resource', this.onPostSyncResource)
    // Trigger sync for a specific record
    app.post('/sync/:resource/:id', this.onPostSyncRecord)
    this.cms._app.use('/replicator', app)
  }

  /**
   * The replication type of a resource. It lives in the options of the resource; earlier releases looked for it on the
   * resource itself, so every resource counted as 'normal' and the direction rules never applied. That is kept unless
   * replication.strictTypes is on, because applying the rules stops the replication of every peer whose direction
   * does not fit.
   * @param {object} resourceDef
   * @returns {string}
   */
  typeOf = (resourceDef) => {
    if (_.get(this.cms.options, 'replication.strictTypes', false)) {
      return _.get(resourceDef, 'options.type', 'normal')
    }
    return _.get(resourceDef, 'type', 'normal')
  }

  /**
   * Stops listening for peers.
   * @returns {Promise<void>}
   */
  close = () => this.replicator.close()

  /** GET /replicator/resources: each resource with its type (upstream, downstream, normal) and its peers. */
  onGetResources = (req, res) => {
    const resources = _.map(this.cms._resources, (def, name) => {
      const type = this.typeOf(def)
      const peersByResource = _.get(this.cms.options, 'replication.peersByResource', {})
      const peers = _.get(peersByResource, name, _.get(this.cms.options, 'replication.peers', []))
      logger.debug(`[Replicator] Resource: ${name}, Type: ${type}, Peers:`, peers)
      return {
        name,
        type,
        peers,
        direction: type === 'downstream' ? 'from peers' : type === 'upstream' ? 'to peers' : 'bi-directional'
      }
    })
    res.json(resources)
  }

  /**
   * @param {'upstream'|'downstream'|'normal'} type of the resource here
   * @param {{direction: string}} peer
   * @returns {boolean} whether the two may replicate: an upstream with a downstream, a downstream with an upstream, a normal one with any
   */
  directionIsValid = (type, peer) => {
    return (type === 'upstream' && peer.direction === 'downstream') ||
        (type === 'downstream' && peer.direction === 'upstream') ||
        (type === 'normal') ||
        (peer.direction === 'normal')
  }

  /** POST /replicator/sync/:resource: replicates a resource with its peers now. */
  onPostSyncResource = async (req, res) => {
    try {
      const { resource } = req.params
      const result = await this.syncResource(resource)
      res.json({ ok: true, result })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  }

  /** POST /replicator/sync/:resource/:id: replicates one record now. */
  onPostSyncRecord = async (req, res) => {
    try {
      const { resource, id } = req.params
      const result = await this.syncRecord(resource, id)
      res.json({ ok: true, result })
    } catch (error) {
      res.status(error.code === 404 ? 404 : 500).json({ error: error.message })
    }
  }

  /**
   * @param {string} resourceName
   * @returns {{type: string, peers: string[]}} the replication parameters of the resource, from the configuration; throws for an unknown resource
   */
  getParams = (resourceName) => {
    const resourceDef = this.cms._resources[resourceName]
    if (!resourceDef) {
      throw new Error(`Resource '${resourceName}' not found`)
    }
    const type = this.typeOf(resourceDef)
    const peers = this.peersOf(resourceName)
    logger.debug(`[Replicator] getParams for resource: ${resourceName}, type: ${type}, peers:`, peers)
    if (!_.isArray(peers) || peers.length === 0) {
      throw new Error('No replication peers configured for resource ' + resourceName)
    }
    return {type, peers}
  }

  /**
   * The peers of a resource: its own list, or the global one.
   * @param {string} resourceName
   * @returns {Array}
   */
  peersOf (resourceName) {
    const peersByResource = _.get(this.cms.options, 'replication.peersByResource', {})
    let peers = _.get(peersByResource, resourceName, undefined)
    if (!peers) {
      peers = _.get(this.cms.options, 'replication.peers', [])
    }
    return peers
  }

  /**
   * @param {string} resourceName
   * @returns {boolean} whether the resource has a peer to replicate to
   */
  hasPeers (resourceName) {
    const peers = this.peersOf(resourceName)
    return _.isArray(peers) && peers.length > 0
  }

  /**
   * Sync all records in a resource, direction-aware and peer-aware
   * @param {string} resourceName
   */
  async syncResource(resourceName) {
    const {type, peers} = this.getParams(resourceName)
    const results = []
    for (const peer of peers) {
      // peer: { url, direction: 'upstream'|'downstream'|'normal', resources: [...] }
      if (_.isArray(peer.resources) && !peer.resources.includes(resourceName)) {
        continue
      }
      // Only sync in allowed direction
      if (this.directionIsValid(type, peer)) {
        logger.debug(`[Replicator] syncResource: resource=${resourceName}, peer=`, peer)
        // Call replicator.replicate for this peer
        try {
          const result = await this.replicator.replicate(peer.host, peer.port, peer.url, resourceName)
          results.push({ peer, status: 'ok', result })
        } catch (err) {
          results.push({ peer, status: 'error', error: err.message })
        }
      }
    }
    return { resource: resourceName, results }
  }

  /**
   * Brings one record to the peers of its resource, direction-aware and peer-aware. The protocol exchanges changes, not
   * records: the record travels with every other change of the resource the peer has not seen yet (nothing is sent twice),
   * and only that record's attachments are synced afterwards.
   * @param {string} resourceName
   * @param {string} recordId
   * @throws {Error} with code 404 when this node has no such record
   */
  async syncRecord(resourceName, recordId) {
    const resourceDef = this.cms._resources[resourceName]
    if (resourceDef && !(await resourceDef.json.find(recordId))) {
      throw Object.assign(new Error(`Record ${recordId} not found in ${resourceName}`), { code: 404 })
    }
    const {type, peers} = this.getParams(resourceName)
    const results = []
    for (const peer of peers) {
      if (_.isArray(peer.resources) && !peer.resources.includes(resourceName)) {
        continue
      }
      if (this.directionIsValid(type, peer)) {
        logger.debug(`[Replicator] syncRecord: resource=${resourceName}, recordId=${recordId}, peer=`, peer)
        try {
          const result = await this.replicator.replicate(peer.host, peer.port, peer.url, resourceName, recordId)
          results.push({ peer, status: 'ok', result, recordId })
        } catch (err) {
          results.push({ peer, status: 'error', error: err.message, recordId })
        }
      }
    }
    return { resource: resourceName, recordId, results }
  }
}

exports = module.exports = ReplicatorManager
