const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

describe('resource find / list with queries and paging', () => {
  let app, articles

  before(async () => {
    app = await startApp()
    articles = app.cms.api()('articles')
    for (const title of ['alpha', 'bravo', 'charlie', 'delta', 'echo']) {
      await articles.create({ title, category: title < 'c' ? 'first' : 'second' })
    }
  })
  after(async () => {
    await app.close()
  })

  it('find(query) matches a record that is not the first one stored', async () => {
    const found = await articles.find({ title: 'echo' })
    expect(found).to.have.property('title', 'echo')
  })
  it('find(query) returns null/undefined when nothing matches', async () => {
    const found = await articles.find({ title: 'zulu' })
    expect(found).to.not.be.ok
  })
  it('list(query) with a limit filters before limiting', async () => {
    const res = await articles.list({ category: 'second' }, { limit: 2 })
    expect(res).to.have.length(2)
    res.forEach(r => expect(r.category).to.equal('second'))
  })
  it('list(query) supports pages after filtering', async () => {
    const page0 = await articles.list({ category: 'second' }, { limit: 2, page: 0 })
    const page1 = await articles.list({ category: 'second' }, { limit: 2, page: 1 })
    expect(page1).to.have.length(1)
    // the two pages together cover the three matching records exactly once
    expect(page0.concat(page1).map(r => r.title).sort()).to.deep.equal(['charlie', 'delta', 'echo'])
  })
  it('list() without a query honours the limit', async () => {
    const res = await articles.list({}, { limit: 3 })
    expect(res).to.have.length(3)
  })
  it('REST ?query= with limit filters before limiting', async () => {
    const res = await request(app.url).get('/api/articles').auth(...ADMIN)
      .query({ query: JSON.stringify({ title: 'echo' }), limit: 1 })
    expect(res.status).to.equal(200)
    expect(res.body.map(r => r.title)).to.deep.equal(['echo'])
  })
})
