const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

// A change the store refuses (a record another machine made, a delete that fails) must be answered as a failure: it used to come
// back from the store as a returned { error }, which the driver took for the result, so the request said "done" and the record
// stayed.

describe('refused changes to records (unit)', () => {
  let app
  let articles

  before(async () => {
    app = await startApp()
    articles = app.cms.api()('articles')._resource
  })
  after(async () => {
    await app.close()
  })

  const url = (id) => `/api/articles/${id}`
  // an id whose machine part is not this machine's: the record looks like another machine made it
  const foreignId = () => `muov4cv1abcdefgh${Math.random().toString(36).slice(2, 10)}`
  const putForeign = async (record) => {
    const id = foreignId()
    await articles.json._db.put(id, { _id: id, string: { enUS: `foreign-${id}` }, ...record }, { sync: true })
    return id
  }

  describe('a record of another machine', () => {
    it('is not deleted, and the request says so with a 403', async () => {
      const id = await putForeign()
      const res = await request(app.url).delete(url(id)).auth(...ADMIN)
      expect(res.status).to.equal(403)
      expect(res.body.message).to.match(/foreign/i)
      expect(await articles.json._db.get(id)).to.be.ok
    })

    it('is not updated, and the request says so with a 403', async () => {
      const id = await putForeign()
      const res = await request(app.url).put(url(id)).auth(...ADMIN).send({ rate: 3 })
      expect(res.status).to.equal(403)
      expect(res.body.message).to.match(/foreign/i)
      expect(JSON.parse(JSON.stringify(await articles.json._db.get(id))).rate).to.equal(undefined)
    })
  })

  describe('a record of this machine', () => {
    it('is deleted', async () => {
      const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ string: { enUS: `mine-${Date.now()}` } })
      expect(created.status).to.equal(200)
      const res = await request(app.url).delete(url(created.body._id)).auth(...ADMIN)
      expect(res.status).to.equal(200)
      expect(await articles.json.find(created.body._id)).to.equal(undefined)
    })

    it('is not reported as deleted when the store fails to delete it', async () => {
      const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ string: { enUS: `kept-${Date.now()}` } })
      const original = articles.json._db.del
      articles.json._db.del = async () => { throw new Error('disk full') }
      try {
        const res = await request(app.url).delete(url(created.body._id)).auth(...ADMIN)
        expect(res.status).to.equal(500)
        expect(res.text).to.not.match(/disk full/)
      } finally {
        articles.json._db.del = original
      }
      expect(await articles.json.find(created.body._id)).to.be.ok
    })
  })
})
