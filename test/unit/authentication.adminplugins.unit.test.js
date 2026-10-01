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

  it('gives the admins group the Cms Config plugin by default, under the name the admin menu lists', () => {
    // src/main.js: addPlugin('CmsConfig', 'Cms Config'); the menu keeps the plugins whose display name the group lists
    expect(authentication().adminsGroup.plugins).to.include('Cms Config')
  })

  it('gives the admins group the Replicator plugin by default (the page only shows when replication runs)', () => {
    // src/utils/pluginPages.js: ['CmsReplicator', 'Replicator']
    expect(authentication().adminsGroup.plugins).to.include('Replicator')
  })

  it('adds the default plugins to an existing admins group and keeps the ones added by hand', async () => {
    const auth = authentication()
    await auth.groups.update(auth.adminsGroup._id, { plugins: ['Syslog', 'Sync Resource'] })
    // the authentication plugin registers the first bootstrap function: run it again, as a restart would
    await new Promise((resolve, reject) => app.cms.bootstrapFunctions[0](error => error ? reject(error) : resolve()))
    const group = await auth.groups.find({ name: 'admins' })
    expect(group.plugins).to.include.members(['Syslog', 'Cms Config', 'Sync Resource'])
  })
})
