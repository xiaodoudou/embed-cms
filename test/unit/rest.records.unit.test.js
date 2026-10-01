const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

describe('REST records (unit)', () => {
  let app

  before(async () => {
    app = await startApp()
  })
  after(async () => {
    await app.close()
  })

  describe('GET /api/:resource/:id', () => {
    it('answers the record', async () => {
      const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'known' })
      const res = await request(app.url).get(`/api/articles/${created.body._id}`).auth(...ADMIN)
      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('_id', created.body._id)
    })

    it('answers an unknown id with a 404 json error (#19)', async () => {
      const res = await request(app.url).get('/api/articles/doesnotexist').auth(...ADMIN)
      expect(res.status).to.equal(404)
      expect(res.type).to.equal('application/json')
      expect(res.body).to.include({ code: 404 })
      expect(res.body.message).to.match(/not found/)
    })

    it('answers a removed record with a 404 (#19)', async () => {
      const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'gone' })
      await request(app.url).delete(`/api/articles/${created.body._id}`).auth(...ADMIN)
      const res = await request(app.url).get(`/api/articles/${created.body._id}`).auth(...ADMIN)
      expect(res.status).to.equal(404)
    })
  })
})
