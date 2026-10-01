const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

describe('paging (unit)', () => {
  let app, cities

  before(async () => {
    app = await startApp()
    cities = app.cms.api()('cities')
    for (let i = 0; i < 7; i++) {
      await cities.create({ key: `k${i}`, name: { en: i % 2 ? 'odd' : 'even' } })
    }
  })
  after(async () => { await app.close() })

  const keys = (records) => records.map(record => record.key)

  describe('through the api', () => {
    it('returns the requested page when there is no query', async () => {
      expect(keys(await cities.list({}, { limit: 3, page: 0 }))).to.deep.equal(['k0', 'k1', 'k2'])
      expect(keys(await cities.list({}, { limit: 3, page: 1 }))).to.deep.equal(['k3', 'k4', 'k5'])
      expect(keys(await cities.list({}, { limit: 3, page: 2 }))).to.deep.equal(['k6'])
      expect(keys(await cities.list({}, { limit: 3, page: 3 }))).to.deep.equal([])
    })

    it('returns the requested page of what a query matches', async () => {
      const query = { 'name.en': 'odd' }
      expect(keys(await cities.list(query, { limit: 2, page: 0 }))).to.deep.equal(['k1', 'k3'])
      expect(keys(await cities.list(query, { limit: 2, page: 1 }))).to.deep.equal(['k5'])
    })

    it('takes page and limit as the strings a query string carries', async () => {
      expect(keys(await cities.list({}, { limit: '2', page: '2' }))).to.deep.equal(['k4', 'k5'])
    })

    it('ignores a limit that is not a positive number, and a page without a limit', async () => {
      expect(await cities.list({}, { limit: 'abc', page: 1 })).to.have.length(7)
      expect(await cities.list({}, { limit: 0, page: 1 })).to.have.length(7)
      expect(await cities.list({}, { page: 1 })).to.have.length(7)
    })
  })

  describe('through REST', () => {
    const get = (query) => request(app.url).get('/api/cities').auth(...ADMIN).query(query)

    it('returns the requested page and the total in numRecords', async () => {
      const first = await get({ limit: 3, page: 0 })
      const second = await get({ limit: 3, page: 1 })
      expect(keys(first.body)).to.deep.equal(['k0', 'k1', 'k2'])
      expect(keys(second.body)).to.deep.equal(['k3', 'k4', 'k5'])
      expect(first.headers.numrecords).to.equal('7')
      expect(second.headers.numrecords).to.equal('7')
    })

    it('counts what the query matches, not what the page holds', async () => {
      const res = await get({ limit: 2, page: 1, query: JSON.stringify({ 'name.en': 'even' }) })
      expect(keys(res.body)).to.deep.equal(['k4', 'k6'])
      expect(res.headers.numrecords).to.equal('4')
    })

    it('sends no total when there is no limit', async () => {
      const res = await get({})
      expect(res.body).to.have.length(7)
      expect(res.headers.numrecords).to.equal(undefined)
    })
  })
})
