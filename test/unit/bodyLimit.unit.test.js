const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

// One setting, security.limits.json, sizes every JSON request body: the authentication plugin parses JSON for every route
// before any plugin sees it. A body above it is answered with a JSON 413 that says which setting to raise, not with the
// html page of Express.

const bodyOf = (kb) => ({ string: { enUS: `big-${Date.now()}` }, filler: 'x'.repeat(kb * 1024) })

describe('JSON body limit (unit)', () => {
  describe('with the default limit (100kb)', () => {
    let app
    before(async () => { app = await startApp() })
    after(async () => { await app.close() })

    it('answers a larger REST body with a JSON 413 naming security.limits.json', async () => {
      const res = await request(app.url).post('/api/articles').auth(...ADMIN).send(bodyOf(200))
      expect(res.status).to.equal(413)
      expect(res.type).to.equal('application/json')
      expect(res.body.message).to.match(/security\.limits\.json/)
      expect(res.body.message).to.match(/100kb/)
    })

    it('answers a larger sync body the same way', async () => {
      const res = await request(app.url).put('/sync/articles?token=whatever').send([bodyOf(200)])
      expect(res.status).to.equal(413)
      expect(res.body.message).to.match(/security\.limits\.json/)
    })

    it('accepts a body under the limit', async () => {
      const res = await request(app.url).post('/api/articles').auth(...ADMIN).send(bodyOf(50))
      expect(res.status).to.equal(200)
    })
  })

  describe('with security.limits.json raised to 1mb', () => {
    let app
    before(async () => { app = await startApp({ security: { limits: { json: '1mb' } } }) })
    after(async () => { await app.close() })

    it('accepts the body the default refused', async () => {
      const res = await request(app.url).post('/api/articles').auth(...ADMIN).send(bodyOf(200))
      expect(res.status).to.equal(200)
    })

    it('still refuses a body above the raised limit', async () => {
      const res = await request(app.url).post('/api/articles').auth(...ADMIN).send(bodyOf(1500))
      expect(res.status).to.equal(413)
      expect(res.body.message).to.match(/1mb/)
    })
  })
})
