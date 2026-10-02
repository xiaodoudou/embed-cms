const request = require('supertest')
const { expect } = require('chai')
const logger = require('../../lib/logger')
const { startApp, hardened, createUser, ADMIN } = require('../helpers/app')

// A request the CMS refuses because of what the client sent (a query it does not accept, wrong credentials, a missing
// token) is an answer, not a server fault: it must not fill the log with error lines and stack traces.

describe('logging of refused requests (unit)', () => {
  let lines
  const original = {}

  beforeEach(() => {
    lines = []
    for (const level of ['error', 'warn', 'info', 'debug']) {
      original[level] = logger[level]
      logger[level] = (...args) => lines.push({ level, text: args.map(String).join(' ') })
    }
  })
  afterEach(() => {
    Object.assign(logger, original)
  })

  const errors = () => lines.filter((line) => line.level === 'error' && !/SECURITY: the built-in localAdmin/.test(line.text))

  describe('default profile', () => {
    let app
    before(async () => {
      app = await startApp({ anonymousRead: [] })
    })
    after(async () => {
      await app.close()
    })

    it('logs a failed login as a warning, not an error', async () => {
      lines.length = 0
      const res = await request(app.url).post('/admin/login').send({ username: 'nobody', password: 'wrong' })
      expect(res.status).to.be.within(400, 499)
      expect(errors(), JSON.stringify(errors())).to.have.length(0)
      expect(lines.some((line) => line.level === 'warn' && /Login refused/.test(line.text))).to.equal(true)
    })

    it('logs a request without credentials as no error', async () => {
      lines.length = 0
      const res = await request(app.url).get('/api/articles')
      expect(res.status).to.equal(401)
      expect(errors(), JSON.stringify(errors())).to.have.length(0)
    })

    it('answers a query it does not accept with a 400 and logs no error', async () => {
      lines.length = 0
      const res = await request(app.url).get('/api/articles').auth(...ADMIN).query({ query: JSON.stringify({ $where: 'true' }) })
      expect(res.status).to.equal(400)
      expect(errors(), JSON.stringify(errors())).to.have.length(0)
    })
  })

  describe('the default settings', () => {
    let app
    let admin
    before(async () => {
      app = await startApp(hardened())
      admin = await createUser(app)
    })
    after(async () => {
      await app.close()
    })

    it('answers a query it does not accept with a 400 and logs no error', async () => {
      lines.length = 0
      const res = await request(app.url).get('/api/articles').auth(admin.username, admin.password).query({ query: JSON.stringify({ $where: 'true' }) })
      expect(res.status).to.equal(400)
      expect(errors(), JSON.stringify(errors())).to.have.length(0)
    })

    it('does not log a duplicate key as an error', async () => {
      const value = `once-${Date.now()}-${Math.random()}`
      const post = () => request(app.url).post('/api/articles').auth(admin.username, admin.password).send({ string: { enUS: value } })
      const first = await post()
      expect(first.status, JSON.stringify(first.body)).to.equal(200)
      lines.length = 0
      const second = await post()
      expect(second.status).to.equal(400)
      expect(second.body.message).to.match(/duplicated/)
      expect(errors(), JSON.stringify(errors())).to.have.length(0)
    })
  })
})
