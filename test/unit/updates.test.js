const WebSocket = require('ws')
const request = require('supertest')
const { expect } = require('chai')
const UpdatesManager = require('../../lib/UpdatesManager')
const { startApp, ADMIN } = require('../helpers/app')

// the update socket needs a login: the cookies of one are sent with the upgrade
const connect = (app, cookie) => new Promise((resolve, reject) => {
  const ws = new WebSocket(app.url.replace('http', 'ws'), { headers: { Cookie: cookie } })
  const messages = []
  ws.on('message', m => messages.push(JSON.parse(m)))
  ws.on('open', () => resolve({ ws, messages }))
  ws.on('error', reject)
})

const waitFor = async (check, timeout = 3000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (check()) return true
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return false
}

describe('record update websocket (unit)', () => {
  let app
  let cookie
  const clients = []

  before(async () => {
    app = await startApp()
    const login = await request(app.url).post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
    cookie = login.headers['set-cookie'].map(c => c.split(';')[0]).join('; ')
  })
  afterEach(() => {
    while (clients.length) clients.pop().ws.terminate()
  })
  after(async () => {
    await app.close()
  })

  const open = async () => {
    const client = await connect(app, cookie)
    clients.push(client)
    return client
  }

  it('greets a new client with a ping', async () => {
    const { messages } = await open()
    expect(await waitFor(() => messages.length > 0)).to.equal(true)
    expect(messages[0]).to.deep.equal({ action: 'ping' })
  })

  it('broadcasts create and update events with only metadata', async () => {
    const { messages } = await open()
    const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'ws', secret: 'do not leak' })
    await request(app.url).put(`/api/articles/${created.body._id}`).auth(...ADMIN).send({ title: 'ws2' })
    expect(await waitFor(() => messages.filter(m => m.action === 'update').length > 0)).to.equal(true)
    const create = messages.find(m => m.action === 'create')
    const update = messages.find(m => m.action === 'update')
    for (const event of [create, update]) {
      expect(event.data.resource).to.equal('articles')
      expect(event.data._id).to.equal(created.body._id)
      expect(Object.keys(event.data).sort()).to.deep.equal(['_id', '_updatedBy', 'resource'])
    }
    expect(JSON.stringify(messages)).to.not.include('do not leak')
  })

  it('does not broadcast changes to internal (underscore) resources', async () => {
    const { messages } = await open()
    await app.cms.$authentication.users.create({ username: 'quiet', password: 'quietPass', group: app.cms.$authentication.adminsGroup._id })
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(messages.filter(m => m.action !== 'ping')).to.have.length(0)
  })

  it('reaches every connected client', async () => {
    const a = await open()
    const b = await open()
    await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'fanout' })
    expect(await waitFor(() => a.messages.some(m => m.action === 'create') && b.messages.some(m => m.action === 'create'))).to.equal(true)
  })

  it('survives malformed messages and keeps serving', async () => {
    const { ws, messages } = await open()
    ws.send('this is not json')
    ws.send(JSON.stringify({ action: 'something-else' }))
    await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'still alive' })
    expect(await waitFor(() => messages.some(m => m.action === 'create'))).to.equal(true)
  })

  describe('heartbeat', () => {
    const fakeWs = (overrides = {}) => {
      const sent = []
      return { sent, terminated: false, isAlive: true, send: d => sent.push(JSON.parse(d)), terminate () { this.terminated = true }, ...overrides }
    }
    it('pings a live client and marks it as waiting for a pong', () => {
      const ws = fakeWs()
      UpdatesManager.heartbeat(ws)
      expect(ws.sent).to.deep.equal([{ action: 'ping' }])
      expect(ws.isAlive).to.equal(false)
    })
    it('terminates a client that never answered the previous ping', () => {
      const ws = fakeWs({ isAlive: false })
      UpdatesManager.heartbeat(ws)
      expect(ws.terminated).to.equal(true)
      expect(ws.sent).to.have.length(0)
    })
    it('a pong from the client makes it alive again', async () => {
      const { ws, messages } = await open()
      await waitFor(() => messages.length > 0)
      ws.send(JSON.stringify({ action: 'pong' }))
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(ws.readyState).to.equal(WebSocket.OPEN)
    })
    it('send does not throw when the socket is broken', () => {
      const ws = fakeWs({ send () { throw new Error('closed') } })
      expect(() => UpdatesManager.send(ws, { action: 'x' })).to.not.throw()
    })
  })

  describe('when wsRecordUpdates is disabled', () => {
    it('does not start a websocket server', async () => {
      const quiet = await startApp({ wsRecordUpdates: false })
      try {
        expect(quiet.cms.wss).to.equal(undefined)
        const failed = await new Promise(resolve => {
          const ws = new WebSocket(quiet.url.replace('http', 'ws'))
          ws.on('open', () => { ws.terminate(); resolve(false) })
          ws.on('error', () => resolve(true))
        })
        expect(failed).to.equal(true)
      } finally {
        await quiet.close()
      }
    })
  })
})
