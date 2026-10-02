const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

// Regression tests for the security audit. Each test documents one finding;
// tests marked "FIXME" fail until the corresponding patch lands.
describe('security regressions (REST)', () => {
  let app

  before(async () => {
    app = await startApp({ anonymousRead: ['publicData'] })
    // sift evaluates $where per record, so the collections must not be empty
    await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'seed' })
    await request(app.url).post('/api/publicData').auth(...ADMIN).send({ title: 'seed' })
  })
  after(async () => {
    await app.close()
  })

  describe('query injection', () => {
    it('never executes $where sent through ?query=', async () => {
      global.__whereExecuted = false
      await request(app.url)
        .get('/api/articles')
        .auth(...ADMIN)
        .query({ query: JSON.stringify({ $where: 'global.__whereExecuted = true; return true' }) })
      expect(global.__whereExecuted).to.equal(false)
    })
    it('never executes $where for the anonymous group', async () => {
      global.__whereExecuted = false
      await request(app.url)
        .get('/api/publicData')
        .query({ query: JSON.stringify({ $where: 'global.__whereExecuted = true; return true' }) })
      expect(global.__whereExecuted).to.equal(false)
    })
  })

  describe('prototype pollution', () => {
    afterEach(() => { delete Object.prototype.polluted })
    it('PUT with __proto__ does not pollute Object.prototype', async () => {
      const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'pp' })
      await request(app.url)
        .put(`/api/articles/${created.body._id}`)
        .auth(...ADMIN)
        .set('Content-Type', 'application/json')
        .send('{"title":"pp2","__proto__":{"polluted":"yes"}}')
      expect({}.polluted).to.equal(undefined)
    })
  })

  describe('authorization', () => {
    it('requires authentication to download an attachment by id', async () => {
      const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'att' })
      const att = await request(app.url)
        .post(`/api/articles/${created.body._id}/attachments`)
        .auth(...ADMIN)
        .field('_filename', 'man.jpg')
        .attach('image', './test/fixtures/man.jpg', { contentType: 'image/jpeg' })
      const res = await request(app.url).get(`/api/articles/file/${att.body._id}`)
      expect(res.status).to.be.oneOf([401, 403, 404])
    })
    ;['/import/status', '/import/execute', '/importFromRemote/status', '/importFromRemote/execute', '/replicator/resources'].forEach(route => {
      it(`does not serve ${route} without credentials`, async () => {
        const res = await request(app.url).get(route)
        expect(res.status, `${route} answered ${res.status}`).to.be.oneOf([401, 403, 404])
      })
    })
    it('anonymous cannot write to a read-only public resource', async () => {
      const res = await request(app.url).post('/api/publicData').send({ title: 'x' })
      expect(res.status).to.be.oneOf([401, 403])
    })
    it('anonymous cannot read a private resource', async () => {
      const res = await request(app.url).get('/api/privateData')
      expect(res.status).to.be.oneOf([401, 403])
    })
  })

  describe('information disclosure', () => {
    it('does not log the plaintext password on login', async () => {
      const lines = []
      const orig = console.log
      console.log = (...a) => { lines.push(a.join(' ')); orig(...a) }
      try {
        await request(app.url).post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
      } finally {
        console.log = orig
      }
      expect(lines.join('\n')).to.not.include('"password":"localAdmin"').and.not.include('password: \'localAdmin\'')
    })
    it('error responses do not echo internal call arguments', async () => {
      const res = await request(app.url).get('/api/articles/doesnotexist').auth(...ADMIN)
      expect(JSON.stringify(res.body)).to.not.include('"data"')
    })
  })
})
