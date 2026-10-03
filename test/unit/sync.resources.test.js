const express = require('express')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

const TOKEN = 'local-token'

const waitFor = async (check, timeout = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await check()) return true
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return false
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// the resources to sync are chosen in the Sync settings; the list of cms.json is what is used until one is chosen
describe('sync plugin: the resources to sync (unit)', () => {
  let app, syncConfig

  const settings = () => app.cms.api()('_sync')
  const configure = (data) => settings().update(syncConfig._id, data)
  const list = () => request(app.url).get('/sync/resources').auth(...ADMIN)
  const refusal = async (promise) => {
    try {
      await promise
    } catch (error) {
      return error
    }
    return null
  }

  before(async () => {
    // Basic authentication for the routes of a logged-in person (with the JWT login on, they take a token)
    app = await startApp({ sync: { resources: ['cities'] }, disableJwtLogin: true })
    syncConfig = await settings().create({ allows: ['read', 'write'], local: { token: TOKEN, url: app.url }, remote: { token: 'remote-token', url: '' } })
    await app.cms.api()('cities').create({ key: 'paris', name: { en: 'Paris' } })
    await app.cms.api()('countries').create({ key: 'fr', name: { en: 'France' } })
  })
  after(async () => {
    await app.close()
  })

  describe('which resources', () => {
    it('are the ones of cms.json while none is chosen', async () => {
      const res = await list()
      expect(res.status).to.equal(200)
      expect(res.body).to.deep.equal(['cities'])
      expect(await app.cms.$sync.syncedResources()).to.deep.equal(['cities'])
    })

    it('are the ones chosen in the settings, over cms.json, at once and without a restart', async () => {
      await configure({ resources: ['countries'] })
      expect((await list()).body).to.deep.equal(['countries'])
      expect((await request(app.url).get('/sync/countries').query({ token: TOKEN })).status).to.equal(200)
      // cities is in cms.json, but the settings choose others
      expect((await request(app.url).get('/sync/cities').query({ token: TOKEN })).status).to.not.equal(200)
    })

    it('go back to cms.json when the choice is emptied', async () => {
      await configure({ resources: [] })
      expect((await list()).body).to.deep.equal(['cities'])
      expect((await request(app.url).get('/sync/cities').query({ token: TOKEN })).status).to.equal(200)
    })

    it('are listed to a person who is logged in only', async () => {
      expect((await request(app.url).get('/sync/resources')).status).to.equal(401)
    })

    it('are not mixed up with a resource that has the name of the route', async () => {
      // /sync/resources is the list, not a resource: it answers a list, never a record set or a refusal
      expect(Array.isArray((await list()).body)).to.equal(true)
    })
  })

  describe('the form of the settings', () => {
    it('titles the groups of the local and the remote settings, in both languages, not with the bare names of their keys', async () => {
      const groups = app.cms.resource('_sync').options.groups
      expect(groups.local.label).to.deep.equal({ enUS: 'This CMS', zhCN: '本 CMS' })
      expect(groups.remote.label).to.deep.equal({ enUS: 'The other CMS', zhCN: '对方 CMS' })
      // the admin is given them with the schema
      const res = await request(app.url).get('/admin/resources').auth(...ADMIN)
      const shown = res.body.find(item => item.title === '_sync')
      expect(shown.groups.local.label.enUS).to.equal('This CMS')
    })
  })

  describe('what the settings accept', () => {
    it('refuses a name that is not a resource, and says which', async () => {
      const error = await refusal(configure({ resources: ['cities', 'citties', 'nothing'] }))
      expect(error, 'a refusal').to.be.an('object')
      expect(error.code).to.equal(400)
      expect(error.message).to.equal('Not resources of this CMS: citties, nothing')
      expect((await settings().find({})).resources).to.not.include('citties')
    })

    it('refuses a system resource', async () => {
      for (const name of ['_users', '_sync', '_groups']) {
        const error = await refusal(configure({ resources: [name] }))
        expect(error, name).to.be.an('object')
        expect(error.code).to.equal(400)
      }
    })

    it('refuses them when the settings are created as well', async () => {
      const second = await startApp({ sync: {} })
      try {
        const error = await refusal(second.cms.api()('_sync').create({ resources: ['typo'] }))
        expect(error, 'a refusal').to.be.an('object')
        expect(error.message).to.contain('typo')
      } finally {
        await second.close()
      }
    })

    it('accepts resources of this CMS, and changes that leave the choice alone', async () => {
      await configure({ resources: ['cities', 'countries'] })
      expect((await settings().find({})).resources).to.deep.equal(['cities', 'countries'])
      await configure({ allows: ['read'] })
      expect((await settings().find({})).resources).to.deep.equal(['cities', 'countries'])
    })
  })

  describe('the push after a change', () => {
    let remote, remoteUrl, calls, second, secondSettings

    before(async () => {
      calls = []
      const remoteApp = express()
      remoteApp.all('/*', (req, res) => {
        calls.push({ path: req.path, token: req.query.token })
        res.json({ message: 'done' })
      })
      remote = await new Promise(resolve => {
        const s = remoteApp.listen(0, () => resolve(s))
      })
      remoteUrl = `http://localhost:${remote.address().port}`
      // no list in cms.json: every resource can be chosen in the settings
      second = await startApp({ sync: {} })
      second.cms.$sync.hookDelay = 50
      secondSettings = await second.cms.api()('_sync').create({
        allows: ['read', 'write'],
        resources: ['cities'],
        local: { token: TOKEN, url: second.url },
        remote: { token: 'remote-token', url: remoteUrl }
      })
    })
    after(async () => {
      await second.close()
      await new Promise(resolve => remote.close(resolve))
    })
    beforeEach(() => { calls.length = 0 })

    it('works for a resource chosen in the settings that cms.json does not list', async () => {
      await second.cms.api()('cities').create({ key: 'lyon', name: { en: 'Lyon' } })
      expect(await waitFor(() => calls.length > 0)).to.equal(true)
      expect(calls[0].path).to.equal('/sync/cities/from/remote/to/local')
      expect(calls[0].token).to.equal('remote-token')
    })

    it('does not run for a resource that is not chosen', async () => {
      await second.cms.api()('countries').create({ key: 'de', name: { en: 'Germany' } })
      await sleep(300)
      expect(calls).to.have.length(0)
    })

    it('follows a change of the choice without a restart', async () => {
      await second.cms.api()('_sync').update(secondSettings._id, { resources: ['countries'] })
      await second.cms.api()('countries').create({ key: 'es', name: { en: 'Spain' } })
      expect(await waitFor(() => calls.length > 0)).to.equal(true)
      expect(calls[0].path).to.equal('/sync/countries/from/remote/to/local')
    })

    it('has no hook on a system resource', async () => {
      await second.cms.api()('_sync').update(secondSettings._id, { allows: ['read', 'write'] })
      await sleep(300)
      expect(calls).to.have.length(0)
    })
  })
})
