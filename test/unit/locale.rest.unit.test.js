const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

// ?locale=zhCN says that the plain values of a body are the zhCN values. They are stored the way the admin stores them,
// field first ({ string: { zhCN: ... } }); the other keys of the body are kept as in any create or update. It used to
// store the record locale first ({ zhCN: { string: ... } }), a shape nothing else reads, and to drop every key that is not
// in the schema, _updatedBy included.
describe('?locale= on writes (unit)', () => {
  let app
  let articles
  before(async () => {
    app = await startApp()
    articles = app.cms.api()('articles')._resource
  })
  after(async () => { await app.close() })

  const unique = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  it('stores the values of a create field first, under that locale', async () => {
    const title = unique()
    const res = await request(app.url).post('/api/articles?locale=zhCN').auth(...ADMIN).send({ string: title, rate: 3, note: 'kept' })
    expect(res.status).to.equal(200)
    const stored = await articles.json.find(res.body._id)
    expect(stored.string).to.deep.equal({ zhCN: title })
    expect(stored.rate, 'a field that is not localised').to.equal(3)
    expect(stored.note, 'a key outside the schema').to.equal('kept')
    expect(stored._updatedBy).to.equal('admins~localAdmin')
    expect(stored).to.not.have.property('zhCN')
  })

  it('adds one locale to a record on update, keeping the others', async () => {
    const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ string: { enUS: unique() } })
    const res = await request(app.url).put(`/api/articles/${created.body._id}?locale=zhCN`).auth(...ADMIN).send({ string: '你好' })
    expect(res.status).to.equal(200)
    const stored = await articles.json.find(created.body._id)
    expect(stored.string).to.deep.equal({ enUS: created.body.string.enUS, zhCN: '你好' })
  })

  it('checks unique fields in that locale', async () => {
    const title = unique()
    await request(app.url).post('/api/articles?locale=zhCN').auth(...ADMIN).send({ string: title })
    const res = await request(app.url).post('/api/articles?locale=zhCN').auth(...ADMIN).send({ string: title })
    expect(res.status).to.equal(400)
  })

  it('refuses a locale the resource does not have', async () => {
    const res = await request(app.url).post('/api/articles?locale=frFR').auth(...ADMIN).send({ string: unique() })
    expect(res.status).to.equal(400)
    expect(res.body.message).to.match(/frFR/)
  })

  it('leaves a body without ?locale as it is', async () => {
    const title = { enUS: unique() }
    const res = await request(app.url).post('/api/articles').auth(...ADMIN).send({ string: title })
    expect((await articles.json.find(res.body._id)).string).to.deep.equal(title)
  })
})
