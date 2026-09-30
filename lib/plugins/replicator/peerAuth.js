const _ = require('lodash')

/**
 * Builds fetch options for requests made to a replication peer.
 * When `replication.auth` ({ username, password }) is configured, a Basic Authorization header is added so
 * attachments can be downloaded from peers that require authentication. Without it requests stay anonymous.
 * @param {Object} resource - resource being replicated (gives access to the cms options)
 * @param {Object} [extra] - fetch options to merge in (e.g. { method: 'HEAD' })
 * @returns {Object} fetch options
 */
module.exports = function peerFetchOptions (resource, extra = {}) {
  const auth = _.get(resource, 'options.cms.replication.auth')
  if (!auth || !auth.username) {
    return extra
  }
  const credentials = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64')
  return { ...extra, headers: { ...extra.headers, Authorization: `Basic ${credentials}` } }
}
