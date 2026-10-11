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
 * @returns {{shown: Array<object>, others: number}} the resources to list, and how many others do not replicate
 */
export function replicatedResources (resources) {
  const shown = _.filter(resources, (resource) => !_.isEmpty(resource.peers) || !_.isEmpty(resource.receives) || !_.isEmpty(resource.sends))
  return { shown, others: _.size(resources) - shown.length }
}
