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

/** The translation key of the direction of a resource type (the server sends the direction in English) */
export function directionKey (type) {
  if (type === 'downstream') {
    return 'TL_DIRECTION_FROM_PEERS'
  }
  return type === 'upstream' ? 'TL_DIRECTION_TO_PEERS' : 'TL_DIRECTION_BOTH'
}

/**
 * What a sync really did. The server answers 200 with one entry per peer it tried, an error included:
 * { ok: true, result: { resource, results: [{ peer, status: 'ok' | 'error', error? }] } }.
 * @param {object} answer the JSON answer of POST /replicator/sync/…
 * @returns {{status: 'ok' | 'failed' | 'none', total: number, failed: Array<{peer: string, error: string}>}}
 * 'none' when no peer was tried (none accepts the direction of the resource)
 */
export function syncOutcome (answer) {
  const results = _.get(answer, 'result.results', [])
  const failed = _.map(_.filter(results, (entry) => _.get(entry, 'status') !== 'ok'), (entry) => ({ peer: peerLabel(entry.peer), error: _.toString(_.get(entry, 'error', '')) }))
  const status = results.length === 0 ? 'none' : failed.length > 0 ? 'failed' : 'ok'
  return { status, total: results.length, failed }
}
