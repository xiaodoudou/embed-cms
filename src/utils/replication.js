import _ from 'lodash'

/**
 * Pure helpers of the Replicator page (src/components/pages/CmsReplicator.vue). No Vue, no requests.
 */

/** How a peer is named in the page: its REST url, else host:port */
export function peerLabel (peer) {
  if (_.isString(peer)) {
    return peer
  }
  return _.get(peer, 'url') || _.compact([_.get(peer, 'host'), _.get(peer, 'port')]).join(':') || '?'
}

/** The translation key of the direction of a resource type: downstream is received here, upstream sent from here */
export function directionKey (type) {
  if (type === 'downstream') {
    return 'TL_DIRECTION_FROM_PEERS'
  }
  return type === 'upstream' ? 'TL_DIRECTION_TO_PEERS' : 'TL_DIRECTION_BOTH'
}

const STATES = {
  live: { key: 'TL_LINK_LIVE', tone: 'success' },
  polling: { key: 'TL_LINK_POLLING', tone: 'success' },
  waiting: { key: 'TL_LINK_WAITING', tone: 'success' },
  connecting: { key: 'TL_LINK_CONNECTING', tone: 'neutral' },
  reconnecting: { key: 'TL_LINK_RECONNECTING', tone: 'error' },
  stopped: { key: 'TL_LINK_STOPPED', tone: 'neutral' }
}

/**
 * @param {string} state the state of a link, as the server reports it
 * @returns {{key: string, tone: 'success'|'neutral'|'error'}} the translation key of its name and the colour of its badge
 */
export function linkState (state) {
  return STATES[state] || { key: 'TL_LINK_STOPPED', tone: 'neutral' }
}

/**
 * The resources the page lists: those that have peers, a link, or a peer pulling them from here.
 * @param {Array<object>} resources the answer of GET /replicator/resources
 * @returns {Array<object>} the resources that replicate
 */
export function replicatedResources (resources) {
  return _.filter(resources, (resource) => !_.isEmpty(resource.peers) || !_.isEmpty(resource.receives) || !_.isEmpty(resource.sends))
}

/**
 * @param {string} url the REST url of a peer
 * @returns {string} its host and port, the part a person recognises: http://site-1.internal:9990/api/ -> site-1.internal:9990
 */
export function peerHost (url) {
  try {
    return new URL(url).host || url
  } catch {
    return _.toString(url)
  }
}

/**
 * The machine ids of the peers this node pulls from, with their host: a peer that pulls from here is named by its machine
 * id only, and this tells which host it is when this node also pulls from it.
 * @param {Array<object>} resources the answer of GET /replicator/resources
 * @returns {Object<string, string>} host by machine id
 */
export function hostsById (resources) {
  const hosts = {}
  _.each(resources, (resource) => {
    _.each(resource.receives, (link) => {
      if (link.peerId) {
        hosts[link.peerId] = peerHost(link.peer)
      }
    })
  })
  return hosts
}

/**
 * @param {string} type the replication type of a resource
 * @returns {string} the icon of its direction: up for what is sent, down for what is received, both for normal
 */
export function directionIcon (type) {
  if (type === 'upstream') {
    return '$arrowUp'
  }
  return type === 'downstream' ? '$arrowDown' : '$swapVertical'
}
