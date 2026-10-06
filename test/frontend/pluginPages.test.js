import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pluginPages } from '../../src/utils/pluginPages.js'

const names = (config) => pluginPages(config).map((page) => page.displayname)
const ROOT = path.resolve(__dirname, '../..')
const replication = { disableReplication: false }

describe('plugin pages added to the menu', () => {
  it('always offers Syslog, and no page to edit the configuration file', () => {
    expect(names({})).toEqual(['Syslog'])
    expect(names({})).not.toContain('Cms Config')
  })

  it('lists Syslog and Sync in the CMS group, with the pages that run the CMS, and the others in System', () => {
    expect(pluginPages({})[0]).toEqual({ title: 'Syslog', displayname: 'Syslog', label: 'TL_SYSLOG', group: 'CMS' })
    expect(pluginPages({ import: {} }).slice(1).every((page) => !page.group)).toBe(true)
    expect(pluginPages({ sync: {} }).find((page) => page.displayname === 'Sync Resource')).toEqual({ title: 'SyncResource', displayname: 'Sync Resource', label: 'TL_SYNC_RESOURCE', group: 'CMS' })
    expect(pluginPages({ import: {}, sync: {}, ...replication }).filter((page) => !page.group).map((page) => page.displayname)).toEqual(['Replicator', 'Cms Import'])
  })

  it('gives every page a translation key for its name, and keeps the display name the rights of a group refer to', () => {
    const pages = pluginPages({ import: {}, sync: {}, ...replication })
    expect(pages.map((page) => [page.displayname, page.label])).toEqual([
      ['Syslog', 'TL_SYSLOG'], ['Replicator', 'TL_REPLICATOR'], ['Cms Import', 'TL_CMS_IMPORT'], ['Sync Resource', 'TL_SYNC_RESOURCE']
    ])
  })

  it('offers Cms Import and Sync Resource when their plugins are on', () => {
    expect(names({ import: {}, sync: {} })).toEqual(['Syslog', 'Cms Import', 'Sync Resource'])
    expect(names({ sync: { disablePlugin: true } })).not.toContain('Sync Resource')
  })

  it('offers the Replicator page, in the System group\'s list, only when /config says replication runs', () => {
    expect(names(replication)).toContain('Replicator')
    expect(pluginPages(replication).find((page) => page.displayname === 'Replicator').title).toBe('CmsReplicator')
    expect(names({ disableReplication: true })).not.toContain('Replicator')
    // a server that does not say: no page, rather than a page whose routes answer 404
    expect(names({})).not.toContain('Replicator')
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8')
    expect(main).toContain('.component(\'CmsReplicator\', CmsReplicator)')
    expect(main).toContain('pluginPages(config)')
  })

  it('no longer probes the replicator\'s routes at start (a 404 in the console on every admin load when replication is off)', () => {
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8')
    expect(main).not.toContain('replicator/resources')
    const admin = fs.readFileSync(path.join(ROOT, 'lib/plugins/admin/index.js'), 'utf8')
    expect(admin).toMatch(/configFieldsToExpose = \[[^\]]*'disableReplication'/)
  })

  it('adds no Import from remote page, which was a placeholder, even with the plugin on (it is by default)', () => {
    expect(names({ importFromRemote: { local: {}, remote: {} } })).toEqual(['Syslog'])
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8')
    expect(main).not.toContain('ImportFromRemote')
    expect(main).toContain('pluginPages(config')
  })
})
