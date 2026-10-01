import _ from 'lodash'

/**
 * The plugin pages the admin adds to its menu, decided from the server's /config answer. A page is then listed for a
 * user whose group's `plugins` name its display name.
 * @param {object} config the /config answer
 * @returns {Array<{title: string, displayname: string, group?: string}>} title is the registered component, displayname what groups list,
 * group the menu group when it is not System
 */
export function pluginPages (config = {}, { replication = false } = {}) {
  // the log belongs with the other pages that run the CMS itself (Users, Groups, Settings...)
  const pages = [['Syslog', 'Syslog', 'CMS']]
  if (replication) {
    pages.push(['CmsReplicator', 'Replicator'])
  }
  if (_.get(config, 'import')) {
    pages.push(['CmsImport', 'Cms Import'])
  }
  // importFromRemote has no admin page: the plugin is driven through its routes (/importFromRemote/…)
  if (_.get(config, 'sync') && !_.get(config, 'sync.disablePlugin')) {
    pages.push(['SyncResource', 'Sync Resource'])
  }
  return _.map(pages, ([title, displayname, group]) => (group ? { title, displayname, group } : { title, displayname }))
}

/**
 * Whether the replication plugin runs. /config does not say (disableReplication is not among the options it exposes),
 * so the plugin's own route is asked: it answers the list of resources when the plugin runs, and 404 when it is off.
 * Any other answer (refused, unreachable) hides the page too.
 * @param {Function} get a GET that resolves to the parsed JSON and rejects on an error status (RequestService.get)
 * @param {string} url the replicator's resource list, relative to the admin page
 * @returns {Promise<boolean>}
 */
export async function replicationEnabled (get, url = '../replicator/resources') {
  try {
    return _.isArray(await get(url))
  } catch {
    return false
  }
}
