const _ = require('lodash')
const logger = require('../../logger')
const express = require('express')
const Replicator = require('./Replicator')
const { Link } = require('./links')

const defaults = {}

/**
 * The replication plugin: it serves the peers that pull from this node, keeps a live link to each peer this node pulls
 * from, and reports how they are doing (GET /replicator/resources, the Replicator page).
 */
class ReplicatorManager {
  constructor(cms, options) {
    this.cms = cms
    this.options = _.extend({}, defaults, options)
    this.cms.$replicator = this
    this.links = []
    this.initialize()
  }

  /** Starts the replicator and mounts its routes. */
  initialize = () => {
    this.replicator = new Replicator(this.cms)
    // the websocket of the peers needs the HTTP server, which the CMS gets when it starts; the links start then too
    this.cms.bootstrapFunctions = this.cms.bootstrapFunctions || []
    this.cms.bootstrapFunctions.push((callback) => {
      this.replicator.listen(this.cms.server)
      this.startLinks()
      callback()
    })
    const app = express()
    // each resource with its type, its peers, the links that bring its changes here and the peers that pull it from here
    app.get('/resources', this.onGetResources)
    // connect the links of a resource again now, to catch up after a change of configuration or an outage
    app.post('/sync/:resource', this.onPostSyncResource)
    this.cms._app.use('/replicator', app)
  }

  /**
   * @param {object} resourceDef
   * @returns {'normal'|'upstream'|'downstream'} the replication type of a resource, from its declaration
   */
  typeOf = (resourceDef) => _.get(resourceDef, 'options.type', 'normal')

  /**
   * Whether this node pulls a resource from a peer. A resource of type upstream is only sent from here, so it is pulled
   * from no one. With replication.strictTypes, the peer must also be one this node takes from: upstream or normal.
   * @param {'normal'|'upstream'|'downstream'} type of the resource here
   * @param {{direction?: string}} peer
   * @returns {boolean}
   */
  pullsFrom = (type, peer) => {
    if (type === 'upstream') {
      return false
    }
    if (!_.get(this.cms.options, 'replication.strictTypes', false)) {
      return true
    }
    return _.includes(['upstream', 'normal'], _.get(peer, 'direction'))
  }

  /**
   * The peers of a resource: its own list, or the global one, which never covers the resources of the CMS itself (names starting with _).
   * @param {string} resourceName
   * @returns {Array}
   */
  peersOf (resourceName) {
    const peersByResource = _.get(this.cms.options, 'replication.peersByResource', {})
    const own = _.get(peersByResource, resourceName, undefined)
    if (own) {
      return own
    }
    // the resources of the CMS itself (_users, _groups, _settings...) only replicate when peersByResource names them: every node
    // makes its own admins group and localAdmin, and a node that took another node's could no longer update them
    if (_.startsWith(resourceName, '_')) {
      return []
    }
    return _.get(this.cms.options, 'replication.peers', [])
  }

  /**
   * @param {string} resourceName
   * @returns {boolean} whether the resource has a peer
   */
  hasPeers (resourceName) {
    const peers = this.peersOf(resourceName)
    return _.isArray(peers) && peers.length > 0
  }

  /** Opens a live link for each resource and each peer this node pulls it from. */
  startLinks () {
    if (this.links.length > 0) {
      return
    }
    const pollInterval = _.get(this.cms.options, 'replication.pollInterval')
    _.each(this.cms._resourceNames, (name) => {
      const resourceDef = this.cms._resources[name]
      if (!resourceDef) {
        return
      }
      const type = this.typeOf(resourceDef)
      _.each(this.peersOf(name), (peer) => {
        if (_.isArray(peer.resources) && !peer.resources.includes(name)) {
          return
        }
        if (this.pullsFrom(type, peer)) {
          this.links.push(new Link(this.replicator, name, peer, { pollInterval }))
        }
      })
    })
    if (this.links.length > 0 && !this.replicator.secret) {
      logger.warn('Replication peers are listed, but replication.secret is not set: nothing replicates until it is')
      this.links = []
      return
    }
    this.links.forEach((link) => link.start())
  }

  /**
   * Stops the links and stops listening for peers.
   * @returns {Promise<void>}
   */
  close = async () => {
    const links = this.links
    this.links = []
    await Promise.all(links.map((link) => link.stop()))
    await this.replicator.close()
  }

  /**
   * @returns {Array<object>} each resource: its type, its peers, the links that pull it here and the peers that pull it from here
   */
  status () {
    const served = this.replicator.servedLinks()
    return _.map(this.cms._resources, (def, name) => ({
      name,
      type: this.typeOf(def),
      peers: this.peersOf(name),
      receives: this.links.filter((link) => link.name === name).map((link) => link.status()),
      sends: served.filter((entry) => entry.resource === name).map((entry) => _.omit(entry, ['resource']))
    }))
  }

  /** GET /replicator/resources: the status of the replication of each resource. */
  onGetResources = (req, res) => {
    res.json(this.status())
  }

  /** POST /replicator/sync/:resource: the links of the resource connect again now and catch up. */
  onPostSyncResource = async (req, res) => {
    try {
      res.json({ ok: true, result: this.syncResource(req.params.resource) })
    } catch (error) {
      res.status(error.code === 404 ? 404 : 500).json({ error: error.message })
    }
  }

  /**
   * Connects the links of a resource again now: they take what the peers have that this node lacks, then stay live.
   * @param {string} resourceName
   * @returns {{resource: string, links: Array<object>}}
   */
  syncResource (resourceName) {
    if (!this.cms._resources[resourceName]) {
      throw Object.assign(new Error(`Resource '${resourceName}' not found`), { code: 404 })
    }
    const links = this.links.filter((link) => link.name === resourceName)
    if (links.length === 0) {
      throw new Error(`This node pulls ${resourceName} from no peer`)
    }
    links.forEach((link) => link.restart())
    return { resource: resourceName, links: links.map((link) => link.status()) }
  }
}

exports = module.exports = ReplicatorManager
