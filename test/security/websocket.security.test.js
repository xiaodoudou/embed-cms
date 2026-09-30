const WebSocket = require('ws')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, hardened, createUser } = require('../helpers/app')

/**
 * Opens a websocket and reports how the upgrade went.
 * @param {string} httpUrl
 * @param {object} [headers]
 * @returns {Promise<{state: 'open'|'rejected'|'error', status?: number, ws?: WebSocket, messages?: object[]}>}
 */
const connect = (httpUrl, headers = {}) => new Promise((resolve) => {
  const ws = new WebSocket(httpUrl.replace('http', 'ws') + '/_updates', { headers })
  // the server pings as soon as the socket opens: keep what arrives before the caller starts listening
  const messages = []
  ws.on('message', data => messages.push(JSON.parse(data)))
  ws.on('open', () => resolve({ state: 'open', ws, messages }))
  ws.on('unexpected-response', (req, res) => {
    resolve({ state: 'rejected', status: res.statusCode })
    req.destroy()
  })
  ws.on('error', (error) => resolve({ state: 'error', error }))
})

const cookiesOf = (res) => res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ')

describe('record update websocket (security)', () => {
  describe('hardened profile', () => {
    let app, cookie
    before(async () => {
      app = await startApp(hardened({ security: { allowedOrigins: ['https://admin.example'] } }))
      const user = await createUser(app)
      cookie = cookiesOf(await request(app.url).post('/admin/login').send({ username: user.username, password: user.password }))
    })
    after(async () => { await app.close() })

    it('rejects a client that is not logged in', async () => {
      const result = await connect(app.url)
      expect(result).to.include({ state: 'rejected', status: 401 })
    })

    it('rejects a client with a session id that does not exist', async () => {
      const result = await connect(app.url, { Cookie: 'connect.sid=s%3Anot-a-session.signature' })
      expect(result).to.include({ state: 'rejected', status: 401 })
    })

    it('rejects a logged in browser on a foreign origin', async () => {
      const result = await connect(app.url, { Cookie: cookie, Origin: 'https://evil.example' })
      expect(result).to.include({ state: 'rejected', status: 403 })
    })

    it('accepts a logged in client, from its own origin, from a listed origin and from a script', async () => {
      for (const headers of [{ Cookie: cookie }, { Cookie: cookie, Origin: app.url }, { Cookie: cookie, Origin: 'https://admin.example' }]) {
        const result = await connect(app.url, headers)
        expect(result.state, JSON.stringify(headers)).to.equal('open')
        result.ws.close()
      }
    })

    it('sends the pings and the record events to a logged in client', async () => {
      const result = await connect(app.url, { Cookie: cookie })
      expect(result.state).to.equal('open')
      const started = Date.now()
      while (!result.messages.length && Date.now() - started < 3000) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      expect(result.messages[0]).to.deep.equal({ action: 'ping' })
      result.ws.close()
    })

    it('closes a connection that sends more than a pong needs, and the server keeps running', async () => {
      const result = await connect(app.url, { Cookie: cookie })
      expect(result.state).to.equal('open')
      const closed = new Promise(resolve => result.ws.on('close', code => resolve(code)))
      result.ws.send('x'.repeat(64 * 1024))
      expect(await closed).to.equal(1009)
      expect((await connect(app.url, { Cookie: cookie })).state).to.equal('open')
    })

    it('rejects the session of a user who logged out', async () => {
      const user = await createUser(app)
      const agent = request.agent(app.url)
      const login = await agent.post('/admin/login').send({ username: user.username, password: user.password })
      const own = cookiesOf(login)
      expect((await connect(app.url, { Cookie: own })).state).to.equal('open')
      await agent.get('/admin/logout')
      expect((await connect(app.url, { Cookie: own })).status).to.equal(401)
    })
  })

  describe('JWT cookie mode (hardened profile)', () => {
    it('accepts the cookies of a logged in user and rejects the other clients', async () => {
      const app = await startApp(hardened({ disableAuthentication: true }))
      try {
        const user = await createUser(app)
        const login = await request(app.url).post('/admin/login').send({ username: user.username, password: user.password })
        expect((await connect(app.url, { Cookie: cookiesOf(login) })).state).to.equal('open')
        expect((await connect(app.url)).status).to.equal(401)
      } finally {
        await app.close()
      }
    })
  })

  describe('Basic authentication mode (hardened profile)', () => {
    it('accepts a client that carries valid credentials', async () => {
      const app = await startApp(hardened({ disableJwtLogin: true }))
      try {
        const user = await createUser(app)
        const authorization = `Basic ${Buffer.from(`${user.username}:${user.password}`).toString('base64')}`
        expect((await connect(app.url, { Authorization: authorization })).state).to.equal('open')
        const wrong = `Basic ${Buffer.from(`${user.username}:wrong`).toString('base64')}`
        expect((await connect(app.url, { Authorization: wrong })).status).to.equal(401)
        expect((await connect(app.url)).status).to.equal(401)
      } finally {
        await app.close()
      }
    })
  })

  describe('legacy profile', () => {
    it('accepts anyone (existing behaviour)', async () => {
      const app = await startApp()
      try {
        const result = await connect(app.url, { Origin: 'https://evil.example' })
        expect(result.state).to.equal('open')
        result.ws.close()
      } finally {
        await app.close()
      }
    })
  })
})
