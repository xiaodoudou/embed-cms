const request = require('supertest')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const TOKEN = 'local-token'

const waitFor = async (check, timeout = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await check()) return true
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}

describe('sync plugin (unit)', () => {
  let app, cities, syncConfig

  const configure = (data) => app.cms.api()('_sync').update(syncConfig._id, data)

  before(async () => {
    app = await startApp({ sync: { resources: ['cities'] } })
    cities = app.cms.api()('cities')
    syncConfig = await app.cms.api()('_sync').create({
      allows: ['read', 'write'],
      local: { token: TOKEN, url: app.url },
      remote: { token: 'remote-token', url: '' }
    })
    await cities.create({ key: 'paris', name: { en: 'Paris' } })
    await cities.create({ key: 'rome', name: { en: 'Rome' } })
  })
  after(async () => {
    await app.close()
  })

  describe('token handling', () => {
    it('rejects a missing token with 401', async () => {
      const res = await request(app.url).get('/sync/cities')
      expect(res.status).to.equal(401)
    })
    it('rejects a wrong token with 401', async () => {
      const res = await request(app.url).get('/sync/cities').query({ token: 'nope' })
      expect(res.status).to.equal(401)
    })
    it('rejects a token that only shares a prefix', async () => {
      const res = await request(app.url).get('/sync/cities').query({ token: `${TOKEN}x` })
      expect(res.status).to.equal(401)
    })
    it('requires the token for the from/to trigger as well', async () => {
      const post = await request(app.url).post('/sync/cities/from/remote/to/local')
      const get = await request(app.url).get('/sync/cities/from/remote/to/local')
      expect(post.status).to.equal(401)
      expect(get.status).to.equal(401)
    })
    it('refuses resources that are not listed in the sync config', async () => {
      const res = await request(app.url).get('/sync/articles').query({ token: TOKEN })
      expect(res.status).to.be.oneOf([400, 404, 500])
      expect(res.status).to.not.equal(200)
    })
  })

  describe('read', () => {
    it('returns the records without internal fields', async () => {
      const res = await request(app.url).get('/sync/cities').query({ token: TOKEN })
      expect(res.status).to.equal(200)
      expect(res.body.map(r => r.key).sort()).to.deep.equal(['paris', 'rome'])
      res.body.forEach(r => {
        expect(r).to.not.have.property('_createdAt')
        expect(r).to.not.have.property('_updatedAt')
      })
      expect(res.body.find(r => r.key === 'paris')).to.have.nested.property('name.en', 'Paris')
    })
    it('reports a done status when nothing is syncing', async () => {
      const res = await request(app.url).get('/sync/cities/status').query({ token: TOKEN })
      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('status', 'done')
    })
  })

  describe('write', () => {
    it('creates, updates and removes records to mirror the pushed list', async () => {
      const res = await request(app.url)
        .put('/sync/cities')
        .query({ token: TOKEN })
        .send([
          { key: 'paris', name: { en: 'Paname' } },
          { key: 'berlin', name: { en: 'Berlin' } }
        ])
      expect(res.status).to.equal(200)
      const done = await waitFor(async () => {
        const status = await request(app.url).get('/sync/cities/status').query({ token: TOKEN })
        return status.body.status === 'done' && (await cities.list()).some(c => c.key === 'berlin')
      })
      expect(done, 'sync did not finish').to.equal(true)
      const keys = (await cities.list()).map(c => c.key).sort()
      expect(keys).to.deep.equal(['berlin', 'paris'])
      expect(await cities.find({ key: 'paris' })).to.have.nested.property('name.en', 'Paname')
    })
    it('refuses writes when the config only allows read', async () => {
      await configure({ allows: ['read'] })
      const res = await request(app.url).put('/sync/cities').query({ token: TOKEN }).send([])
      expect(res.status).to.not.equal(200)
      const before = (await cities.list()).length
      expect(before).to.be.greaterThan(0)
      await configure({ allows: ['read', 'write'] })
    })
    it('refuses reads when the config does not allow read', async () => {
      await configure({ allows: ['write'] })
      const res = await request(app.url).get('/sync/cities').query({ token: TOKEN })
      expect(res.status).to.not.equal(200)
      await configure({ allows: ['read', 'write'] })
    })
  })
})
