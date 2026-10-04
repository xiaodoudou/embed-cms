import _ from 'lodash'

/**
 * The plugin pages the admin adds to its menu, decided from the server's /config answer. A page is then listed for a
 * user whose group's `plugins` name its display name.
 * @param {object} config the /config answer; the Replicator page needs its disableReplication to be false (absent counts as off:
 * a page whose routes answer 404 is worse than no page)
 * @returns {Array<{title: string, displayname: string, label: string, group?: string}>} title is the registered component, displayname what groups
 * list (it never changes: it is what a group's `plugins` names), label the translation key of the name shown in the menu, group the menu
 * group when it is not System
 */
export function pluginPages (config = {}) {
  // the log belongs with the other pages that run the CMS itself (Users, Groups, Settings...)
  const pages = [['Syslog', 'Syslog', 'TL_SYSLOG', 'CMS']]
  if (_.get(config, 'disableReplication') === false) {
    pages.push(['CmsReplicator', 'Replicator', 'TL_REPLICATOR'])
  }
  if (_.get(config, 'import')) {
    pages.push(['CmsImport', 'Cms Import', 'TL_CMS_IMPORT'])
  }
  // importFromRemote has no admin page: the plugin is driven through its routes (/importFromRemote/…)
  if (_.get(config, 'sync') && !_.get(config, 'sync.disablePlugin')) {
    // next to the Sync settings (CMS group), which it is the page of
    pages.push(['SyncResource', 'Sync Resource', 'TL_SYNC_RESOURCE', 'CMS'])
  }
  return _.map(pages, ([title, displayname, label, group]) => (group ? { title, displayname, label, group } : { title, displayname, label }))
}
