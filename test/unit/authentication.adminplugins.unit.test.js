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
})
