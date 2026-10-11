const http = require('http')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const fs = require('fs-extra')
const mps = require('msgpack-stream')
const WebSocket = require('ws')
const request = require('supertest')
const { expect } = require('chai')
const protocol = require('../../lib/plugins/replicator/protocol')
const { startApp, hardened, randomSecret } = require('../helpers/app')

const REPLICA_PREFIX = '\xFDreplica\xFD'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Starts a node: replication goes over its HTTP port, at /_replicator.
 * @param {string} mid - machine id (8 characters)
 * @param {object} [overrides]
 */
async function startNode (mid, overrides = {}) {
  const app = await startApp({ mid, ...overrides })
  return Object.assign(app, { replicationUrl: `${app.url.replace(/^http/, 'ws')}/_replicator` })
}

const replicate = (from, to, resource = 'comments') =>
  from.cms.$replicator.replicator.replicate({ url: `${to.url}/api/` }, resource)

/** An HTTP server on a free port, as the CMS has one: the replication is an upgrade on it */
const httpServer = () => new Promise((resolve) => {
  const server = http.createServer((req, res) => res.writeHead(404).end())
  server.listen(0, () => resolve(server))
})

/** One frame of the handshake: a length byte, then the text */
const frame = (text) => Buffer.concat([Buffer.from([text.length]), Buffer.from(text)])

/**
 * Opens a raw websocket to a replication address, sends what it is given, and gives back what came in before it ends.
 * @param {string} url
 * @param {Buffer[]} messages
 * @param {number} [wait]
 */
const rawPeer = (url, messages, wait = 300) => new Promise((resolve) => {
  const seen = []
  const ws = new WebSocket(url)
  ws.on('error', () => resolve(Buffer.concat(seen)))
  ws.on('message', (data) => seen.push(Buffer.from(data)))
  ws.on('open', () => {
    messages.forEach(message => ws.send(message))
    setTimeout(() => { ws.terminate(); resolve(Buffer.concat(seen)) }, wait)
  })
})

const waitFor = async (check, timeout = 4000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) {
      return true
    }
    await sleep(50)
  }
  return false
}

describe('replication security', () => {
  describe('handshake with a shared secret (protocol)', () => {
    const secret = randomSecret()
    let http1, server, url, accepted
    beforeEach(async () => {
      http1 = await httpServer()
      url = `ws://localhost:${http1.address().port}/_replicator`
      accepted = []
      server = protocol.Server(http1, 'SERVERID', (error, socket, name, id) => {
        accepted.push({ error, name, id })
        socket.destroy()
      }, { secret })
    })
    afterEach(async () => {
      await server.close()
      http1.close()
    })

    const connect = (options) => new Promise((resolve) => {
      protocol.Client(url, 'articles', 'CLIENTID', (error, socket, id) => {
        if (socket) {
          socket.destroy()
        }
        resolve({ error, id })
      }, options)
    })

    it('lets a peer that knows the secret in, and both sides prove it', async () => {
      const result = await connect({ secret })
      expect(result.error).to.equal(null)
      expect(result.id).to.equal('SERVERID')
      await waitFor(() => accepted.length === 1)
      expect(accepted[0]).to.include({ name: 'articles', id: 'CLIENTID' })
    })

    it('rejects a peer with the wrong secret before any resource is named', async () => {
      const result = await connect({ secret: randomSecret() })
      expect(result.error).to.be.ok
      await sleep(100)
      expect(accepted).to.have.length(0)
    })

    it('rejects a peer that names itself without authenticating', async () => {
      await rawPeer(url, [frame('CLIENTIDarticles')])
      await sleep(100)
      expect(accepted).to.have.length(0)
    })

    it('rejects a peer that sends garbage instead of a proof', async () => {
      await rawPeer(url, [Buffer.alloc(300, 0x41)])
      await sleep(100)
      expect(accepted).to.have.length(0)
    })

    it('has no client that skips the secret', async () => {
      const result = await connect(undefined)
      expect(result.error.message).to.match(/replication\.secret/)
      expect(accepted).to.have.length(0)
    })

    it('compares proofs in constant time', async () => {
      const original = crypto.timingSafeEqual
      let calls = 0
      crypto.timingSafeEqual = (...args) => { calls++; return original(...args) }
      try {
        await connect({ secret })
        await connect({ secret: randomSecret() })
      } finally {
        crypto.timingSafeEqual = original
      }
      expect(calls).to.be.at.least(2)
    })

    it('a client with a secret refuses a server that does not authenticate', async () => {
      // a server that names itself at once, with no challenge
      const plainHttp = await httpServer()
      const plain = new WebSocket.WebSocketServer({ server: plainHttp })
      plain.on('connection', (ws) => ws.send(frame('PLAINID1')))
      try {
        const result = await new Promise(resolve => {
          protocol.Client(`ws://localhost:${plainHttp.address().port}/_replicator`, 'articles', 'CLIENTID', (error, socket) => {
            if (socket) {
              socket.destroy()
            }
            resolve({ error, socket })
          }, { secret })
        })
        expect(result.error).to.be.ok
        expect(result.socket).to.equal(undefined)
      } finally {
        plain.close()
        plainHttp.close()
      }
    })
  })

  describe('two nodes', () => {
    const secret = randomSecret()
    let a, b
    afterEach(async () => {
      await Promise.all([a, b].filter(Boolean).map(node => node.close()))
      a = b = undefined
    })

    it('replicate a record from one node to the other when they share the secret', async () => {
      a = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret, settleDelay: 0 } }))
      b = await startNode('bbbbbbbb', hardened({ replication: { peers: [], peersByResource: {}, secret, settleDelay: 0 } }))
      const record = await a.cms.api()('comments').create({ title: { enUS: 'from A' } })
      await replicate(b, a)
      expect(await waitFor(async () => (await b.cms.api()('comments').list()).some(item => item._id === record._id))).to.equal(true)
    })

    it('refuse to replicate when the secrets differ', async () => {
      a = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret, settleDelay: 0 } }))
      b = await startNode('bbbbbbbb', hardened({ replication: { peers: [], peersByResource: {}, secret: randomSecret(), settleDelay: 0 } }))
      await a.cms.api()('comments').create({ title: { enUS: 'from A' } })
      let error
      try {
        await replicate(b, a)
      } catch (e) {
        error = e
      }
      expect(error).to.be.ok
      await sleep(200)
      expect(await b.cms.api()('comments').list()).to.have.length(0)
    })

    it('do not listen for peers without a secret', async () => {
      a = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, settleDelay: 0 } }))
      b = await startNode('bbbbbbbb', hardened({ replication: { peers: [], peersByResource: {}, secret, settleDelay: 0 } }))
      let error
      try {
        await replicate(b, a)
      } catch (e) {
        error = e
      }
      expect(error.message).to.match(/answered 404/)
    })

    it('keep the record updates socket on the same port', async () => {
      a = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret, settleDelay: 0 } }))
      // the replication takes its path; any other path is still the updates socket, which asks for a login
      const answer = await new Promise((resolve) => {
        const ws = new WebSocket(`${a.url.replace(/^http/, 'ws')}/_updates`)
        ws.on('unexpected-response', (req, res) => resolve(res.statusCode))
        ws.on('open', () => { ws.terminate(); resolve('open') })
        ws.on('error', () => resolve('error'))
      })
      expect(answer).to.equal(401)
    })
  })

  describe('a peer that names a resource', () => {
    const outside = path.join(os.tmpdir(), `embed-cms-traversal-${crypto.randomBytes(4).toString('hex')}`)
    let node
    afterEach(async () => {
      if (node) {
        await node.close()
        node = undefined
      }
      await fs.remove(outside)
    })

    const nameResource = (target, name, options) => new Promise((resolve) => {
      protocol.Client(target.replicationUrl, name, 'PEERID00', (error, socket) => {
        if (socket) {
          socket.destroy()
        }
        resolve({ error, socket })
      }, options)
    })

    it('cannot make the server create a resource it does not have', async () => {
      const secret = randomSecret()
      node = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret, settleDelay: 0 } }))
      const before = [...node.cms._resourceNames]
      await nameResource(node, 'somethingnew', { secret })
      await sleep(300)
      expect(node.cms._resourceNames).to.deep.equal(before)
      expect(fs.existsSync(path.join(node.dataDir, 'somethingnew'))).to.equal(false)
    })

    it('cannot read anything without the secret', async () => {
      const secret = randomSecret()
      node = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret, settleDelay: 0 } }))
      // a peer that names the users without the handshake: it gets the challenge, and nothing else
      const seen = await rawPeer(node.replicationUrl, [frame('PEERID00_users')], 400)
      expect(seen.toString('latin1')).to.not.match(/password|salt/)
    })
  })

  describe('records sent by an authenticated peer', () => {
    const secret = randomSecret()
    let node, existing
    const otherRecordId = 'lkjhgfdscccccccc12345678' // 8 characters of time, machine cccccccc, 8 of random

    before(async () => {
      node = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret, settleDelay: 0 } }))
      existing = await node.cms.api()('comments').create({ title: { enUS: 'mine' } })
    })
    after(async () => { await node.close() })

    /**
     * Connects as a peer that knows the secret and sends the given frames.
     * @param {object[]} frames
     */
    const send = async (frames) => {
      const socket = await new Promise((resolve, reject) => {
        protocol.Client(node.replicationUrl, 'comments', 'cccccccc', (error, s) => error ? reject(error) : resolve(s), { secret })
      })
      const encode = mps.createEncodeStream()
      encode.pipe(socket)
      socket.on('error', () => {})
      socket.on('data', () => {})
      frames.forEach(frame => encode.write(frame))
      await sleep(400)
      socket.destroy()
    }
    const stored = async (key) => {
      try {
        return await node.cms.resource('comments').json._db.get(key)
      } catch {
        return undefined
      }
    }
    const replicaKey = (namespace, key) => [REPLICA_PREFIX, namespace, String(Date.now()), key].join(' ')

    it('accepts a well formed change for a record of that peer', async () => {
      const value = JSON.stringify({ _id: otherRecordId, _createdAt: 1, _updatedAt: 1, title: { enUS: 'from C' } })
      await send([{ op: 'put', key: replicaKey('cccccccc', otherRecordId), value }])
      expect(await stored(otherRecordId)).to.be.ok
    })

    it('ignores a put that overwrites a record of this node', async () => {
      const value = JSON.stringify({ _id: existing._id, title: { enUS: 'hacked' } })
      await send([{ op: 'put', key: existing._id, value }])
      expect(JSON.stringify(await stored(existing._id))).to.not.include('hacked')
    })

    it('ignores a put that claims a change originated on this node', async () => {
      const value = JSON.stringify({ _id: existing._id, title: { enUS: 'hacked' } })
      await send([{ op: 'put', key: replicaKey('aaaaaaaa', existing._id), value }])
      expect(JSON.stringify(await stored(existing._id))).to.not.include('hacked')
    })

    it('ignores a delete of a record of this node', async () => {
      await send([{ op: 'del', key: existing._id }, { op: 'del', key: replicaKey('aaaaaaaa', existing._id) }])
      expect(await stored(existing._id)).to.be.ok
    })

    it('ignores keys that are not record ids (internal keys, free text)', async () => {
      await send([
        { op: 'put', key: 'anything at all', value: '"x"' },
        { op: 'put', key: '\xFF clock aaaaaaaa', value: '"1"' },
        { op: 'put', key: replicaKey('cccccccc', 'not-a-record-id'), value: JSON.stringify({ _id: 'not-a-record-id' }) }
      ])
      expect(await stored('anything at all')).to.equal(undefined)
      expect(await stored('not-a-record-id')).to.equal(undefined)
    })

    it('ignores a record whose _id is not its key, and records that are not objects', async () => {
      const mismatch = 'lkjhgfdscccccccc99999999'
      await send([
        { op: 'put', key: replicaKey('cccccccc', mismatch), value: JSON.stringify({ _id: existing._id, title: { enUS: 'hacked' } }) },
        { op: 'put', key: replicaKey('cccccccc', 'lkjhgfdscccccccc88888888'), value: '"just a string"' },
        { op: 'put', key: replicaKey('cccccccc', 'lkjhgfdscccccccc77777777'), value: '{not json' }
      ])
      expect(await stored(mismatch)).to.equal(undefined)
      expect(await stored('lkjhgfdscccccccc88888888')).to.equal(undefined)
      expect(await stored('lkjhgfdscccccccc77777777')).to.equal(undefined)
      expect(JSON.stringify(await stored(existing._id))).to.not.include('hacked')
    })

    it('ignores a record whose attachments carry ids that are paths', async () => {
      const key = 'lkjhgfdscccccccc66666666'
      const value = JSON.stringify({ _id: key, _attachments: [{ _id: '../../../etc/passwd', _name: 'x' }] })
      await send([{ op: 'put', key: replicaKey('cccccccc', key), value }])
      expect(await stored(key)).to.equal(undefined)
    })

    it('ignores a record that is too large', async () => {
      const key = 'lkjhgfdscccccccc55555555'
      const value = JSON.stringify({ _id: key, title: { enUS: 'x'.repeat(5 * 1024 * 1024) } })
      await send([{ op: 'put', key: replicaKey('cccccccc', key), value }])
      expect(await stored(key)).to.equal(undefined)
    })

    it('does not bring the server down with a clock that is not a clock', async () => {
      await send([{ op: 'clock', value: null }, { op: 'clock', value: 'x' }, 'not even an object', { op: 'nonsense' }])
      expect(await stored(existing._id)).to.be.ok
    })
  })

  describe('replication.strictTypes', () => {
    const peers = [{ host: 'localhost', port: 1, url: 'http://localhost:1/api/' }]
    let app
    afterEach(async () => { if (app) { await app.close(); app = undefined } })

    it('treats every resource as normal by default (existing behaviour)', async () => {
      app = await startApp({ replication: { peers, peersByResource: {} } })
      expect(app.cms.$replicator.getParams('articles').type).to.equal('normal')
    })

    it('reads the type of the resource from its options when it is on', async () => {
      app = await startApp({ replication: { peers, peersByResource: {}, strictTypes: true } })
      expect(app.cms.$replicator.getParams('articles').type).to.equal('downstream')
      expect(app.cms.$replicator.getParams('authors').type).to.equal('normal')
    })

    it('then skips the peers whose direction does not fit the type', async () => {
      app = await startApp({
        replication: {
          peers: [{ ...peers[0], direction: 'downstream' }, { ...peers[0], direction: 'upstream' }, { ...peers[0], direction: 'normal' }],
          peersByResource: {},
          strictTypes: true
        }
      })
      const result = await app.cms.$replicator.syncResource('articles')
      // articles is downstream: it takes from an upstream peer and from a normal one, not from a downstream one
      expect(result.results.map(item => item.peer.direction).sort()).to.deep.equal(['normal', 'upstream'])
    })

    it('reports the real type through the resource list', async () => {
      app = await startApp({ replication: { peers, peersByResource: {}, strictTypes: true } })
      const agent = request.agent(app.url)
      await agent.post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
      const { body } = await agent.get('/replicator/resources')
      const articles = body.find(item => item.name === 'articles')
      expect(articles).to.include({ type: 'downstream', direction: 'from peers' })
    })
  })
})
