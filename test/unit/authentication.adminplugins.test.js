const { expect } = require('chai')
const { startApp } = require('../helpers/app')

describe('admins group plugins (unit)', () => {
  let app
  before(async () => { app = await startApp() })
  after(async () => { await app.close() })

  const authentication = () => app.cms.$authentication

  it('gives the admins group the Syslog plugin by default', () => {
    expect(authentication().adminsGroup.plugins).to.include('Syslog')
  })

  it('offers on the user the languages the admin is translated into, English when none is configured', () => {
    const field = authentication().usersSchema().schema.find((item) => item.field === 'language')
    expect(field.source).to.deep.equal(['enUS'])
    expect(field.default).to.equal('enUS')
  })

  it('offers the configured languages, and starts from the default one', () => {
    const auth = authentication()
    const cms = auth.cms
    const original = cms._options
    try {
      cms._options = { ...original, admin: { language: { defaultLocale: 'zhCN', locales: ['enUS', 'zhCN'] } } }
      const field = auth.usersSchema().schema.find((item) => item.field === 'language')
      expect(field.source).to.deep.equal(['enUS', 'zhCN'])
      expect(field.default).to.equal('zhCN')
    } finally {
      cms._options = original
    }
  })

  it('gives the admins group the Replicator plugin only when replication runs', () => {
    // src/utils/pluginPages.js: ['CmsReplicator', 'Replicator']
    expect(authentication().adminsGroup.plugins).to.include('Replicator')
  })

  it('adds the default plugins to an existing admins group and keeps the ones added by hand', async () => {
    const auth = authentication()
    await auth.groups.update(auth.adminsGroup._id, { plugins: ['Syslog', 'Sync Resource'] })
    // the authentication plugin registers the first bootstrap function: run it again, as a restart would
    await new Promise((resolve, reject) => app.cms.bootstrapFunctions[0](error => error ? reject(error) : resolve()))
    const group = await auth.groups.find({ name: 'admins' })
    expect(group.plugins).to.include.members(['Syslog', 'Replicator', 'Sync Resource'])
  })

  describe('without replication', () => {
    let plain
    before(async () => { plain = await startApp({ disableReplication: true }) })
    after(async () => { await plain.close() })

    it('does not give the admins group the Replicator plugin, and takes it away at the next start', async () => {
      const auth = plain.cms.$authentication
      expect(auth.adminsGroup.plugins).to.deep.equal(['Syslog'])
      await auth.groups.update(auth.adminsGroup._id, { plugins: ['Syslog', 'Replicator', 'Sync Resource'] })
      await new Promise((resolve, reject) => plain.cms.bootstrapFunctions[0](error => error ? reject(error) : resolve()))
      const group = await auth.groups.find({ name: 'admins' })
      expect(group.plugins).to.have.members(['Syslog', 'Sync Resource'])
    })
  })
})
