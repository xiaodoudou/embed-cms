import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pluginPages, replicationEnabled } from '../../src/utils/pluginPages.js'

const names = (config, options) => pluginPages(config, options).map((page) => page.displayname)
const ROOT = path.resolve(__dirname, '../..')

describe('plugin pages added to the menu', () => {
  it('always offers Syslog, and no page to edit the configuration file', () => {
    expect(names({})).toEqual(['Syslog'])
    expect(names({})).not.toContain('Cms Config')
  })

  it('lists Syslog in the CMS group, with the pages that run the CMS, and the others in System', () => {
    expect(pluginPages({})[0]).toEqual({ title: 'Syslog', displayname: 'Syslog', group: 'CMS' })
    expect(pluginPages({ import: {} }).slice(1).every((page) => !page.group)).toBe(true)
  })

  it('offers Cms Import and Sync Resource when their plugins are on', () => {
    expect(names({ import: {}, sync: {} })).toEqual(['Syslog', 'Cms Import', 'Sync Resource'])
    expect(names({ sync: { disablePlugin: true } })).not.toContain('Sync Resource')
  })

  it('offers the Replicator page, in the System group\'s list, only when replication runs', () => {
    expect(names({}, { replication: true })).toContain('Replicator')
    expect(pluginPages({}, { replication: true }).find((page) => page.displayname === 'Replicator').title).toBe('CmsReplicator')
    expect(names({})).not.toContain('Replicator')
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8')
    expect(main).toContain(".component('CmsReplicator', CmsReplicator)")
    expect(main).toContain('pluginPages(config, { replication })')
  })

  it('knows replication runs when the replicator lists its resources, and not when its route is missing or refused', async () => {
    const asked = []
    expect(await replicationEnabled(async (url) => { asked.push(url); return [{ name: 'articles' }] })).toBe(true)
    expect(asked).toEqual(['../replicator/resources'])
    expect(await replicationEnabled(async () => { throw { status: 404 } })).toBe(false)
    expect(await replicationEnabled(async () => { throw { status: 401 } })).toBe(false)
    expect(await replicationEnabled(async () => '<html>')).toBe(false)
  })

  it('adds no Import from remote page, which was a placeholder, even with the plugin on (it is by default)', () => {
    expect(names({ importFromRemote: { local: {}, remote: {} } })).toEqual(['Syslog'])
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8')
    expect(main).not.toContain('ImportFromRemote')
    expect(main).toContain('pluginPages(config')
  })
})
