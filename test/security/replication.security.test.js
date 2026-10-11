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

/** The peers of a node that pulls the comments of another one */
const pullsCommentsFrom = (node) => ({ comments: [{ url: `${node.url}/api/`, direction: 'upstream' }] })

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
      // the node that pulls first, so that no link is still connected to a node that is gone
      if (b) {
        await b.close()
      }
      if (a) {
        await a.close()
      }
      a = b = undefined
    })

    it('replicate a record from one node to the other when they share the secret', async () => {
      a = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret } }))
      const record = await a.cms.api()('comments').create({ title: { enUS: 'from A' } })
      b = await startNode('bbbbbbbb', hardened({ replication: { peers: [], peersByResource: pullsCommentsFrom(a), secret } }))
      expect(await waitFor(async () => (await b.cms.api()('comments').list()).some(item => item._id === record._id))).to.equal(true)
    })

    it('refuse to replicate when the secrets differ', async () => {
      a = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret } }))
      await a.cms.api()('comments').create({ title: { enUS: 'from A' } })
      b = await startNode('bbbbbbbb', hardened({ replication: { peers: [], peersByResource: pullsCommentsFrom(a), secret: randomSecret() } }))
      const link = b.cms.$replicator.links[0]
      expect(await waitFor(() => link.state === 'reconnecting' && !!link.error)).to.equal(true)
      await sleep(200)
      expect(await b.cms.api()('comments').list()).to.have.length(0)
    })

    it('do not listen for peers without a secret', async () => {
      a = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {} } }))
      b = await startNode('bbbbbbbb', hardened({ replication: { peers: [], peersByResource: pullsCommentsFrom(a), secret } }))
      const link = b.cms.$replicator.links[0]
      expect(await waitFor(() => /answered 404/.test(link.error || ''))).to.equal(true)
    })

    it('keep the record updates socket on the same port', async () => {
      a = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret } }))
      // the replication takes its path; any other path is still the updates socket, which asks for a login
      const answer = await new Promise((resolve) => {
        const ws = new WebSocket(`${a.url.replace(/^http/, 'ws')}/_updates`)
        ws.on('unexpected-response', (req, res) => resolve(res.statusCode))
        ws.on('open', () => { ws.terminate(); resolve('open') })
        ws.on('error', () => resolve('error'))
      })
      expect(answer).to.equal(401)
    })

    it('never take a write from a peer that connects to them, even one that knows the secret', async () => {
      a = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: {}, secret } }))
      const socket = await new Promise((resolve, reject) => {
        protocol.Client(a.replicationUrl, 'comments', 'cccccccc', (error, stream) => error ? reject(error) : resolve(stream), { secret })
      })
      socket.on('error', () => {})
      socket.on('data', () => {})
      const encode = mps.createEncodeStream()
      encode.pipe(socket)
      // a well formed change of a record of that peer: a node that pulls would take it, the node it connected to does not
      const id = 'lkjhgfdscccccccc12345678'
      const value = JSON.stringify({ _id: id, _createdAt: 1, _updatedAt: 1, title: { enUS: 'pushed by C' } })
      encode.write({ op: 'put', key: [REPLICA_PREFIX, 'cccccccc', String(Date.now()), id].join(' '), value })
      await sleep(400)
      socket.destroy()
      let stored
      try {
        stored = await a.cms.resource('comments').json._db.get(id)
      } catch {
        stored = undefined
      }
      expect(stored).to.equal(undefined)
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

  describe('records sent by a peer this node pulls from', () => {
    const secret = randomSecret()
    let node, existing, fakeHttp, fake
    // what the fake peer sends to the node as soon as the node connects to pull
    let frames = []
    // how many times the node connected to the fake peer: a test waits for its own connection, not a fixed time
    let served = 0
    const otherRecordId = 'lkjhgfdscccccccc12345678' // 8 characters of time, machine cccccccc, 8 of random

    before(async () => {
      fakeHttp = await httpServer()
      fake = protocol.Server(fakeHttp, 'cccccccc', (error, stream) => {
        stream.on('error', () => {})
        // the node asks with its clock: read it, the answer is the frames of the test
        stream.on('data', () => {})
        const encode = mps.createEncodeStream()
        encode.pipe(stream)
        frames.forEach(item => encode.write(item))
        served += 1
      }, { secret })
      const peer = { url: `http://localhost:${fakeHttp.address().port}/api/`, direction: 'upstream' }
      node = await startNode('aaaaaaaa', hardened({ replication: { peers: [], peersByResource: { comments: [peer] }, secret } }))
      existing = await node.cms.api()('comments').create({ title: { enUS: 'mine' } })
      // the link connects at start-up: the tests begin once it is live, so that each restart is theirs
      expect(await waitFor(() => served > 0 && link().state === 'live', 10000)).to.equal(true)
    })
    after(async () => {
      await node.close()
      await fake.close()
      fakeHttp.close()
    })

    /**
     * Makes the fake peer send these frames: the link of the node connects again, and takes them.
     * @param {object[]} list
     */
    const link = () => node.cms.$replicator.links.find(item => item.name === 'comments')
    const send = async (list) => {
      frames = list
      const before = served
      link().restart()
      expect(await waitFor(() => served > before && link().state === 'live', 10000)).to.equal(true)
      await sleep(400)
    }
    const stored = async (key) => {
      try {
        return await node.cms.resource('comments').json._db.get(key)
      } catch {
        return undefined
      }
    }
    const replicaKey = (namespace, key) => [REPLICA_PREFIX, namespace, String(Date.now()), key].join(' ')

    it('takes a well formed change for a record of that peer', async () => {
      const value = JSON.stringify({ _id: otherRecordId, _createdAt: 1, _updatedAt: 1, title: { enUS: 'from C' } })
      await send([{ op: 'put', key: replicaKey('cccccccc', otherRecordId), value }])
      expect(await waitFor(async () => !!(await stored(otherRecordId)))).to.equal(true)
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

    it('does not bring the node down with a clock that is not a clock', async () => {
      await send([{ op: 'clock', value: null }, { op: 'clock', value: 'x' }, 'not even an object', { op: 'nonsense' }])
      expect(await stored(existing._id)).to.be.ok
    })
  })

  describe('replication.strictTypes', () => {
    const secret = randomSecret()
    const peer = (direction) => ({ url: 'http://localhost:1/api/', direction })
    const directionsOf = (app, name) => app.cms.$replicator.links.filter(link => link.name === name).map(link => link.peer.direction).sort()
    let app
    afterEach(async () => { if (app) { await app.close(); app = undefined } })

    it('opens a link to every peer without it', async () => {
      app = await startApp({ replication: { peers: [peer('downstream'), peer('upstream'), peer('normal')], peersByResource: {}, secret } })
      expect(directionsOf(app, 'comments')).to.deep.equal(['downstream', 'normal', 'upstream'])
    })

    it('then opens links only to the peers this node takes from: upstream and normal', async () => {
      app = await startApp({ replication: { peers: [peer('downstream'), peer('upstream'), peer('normal')], peersByResource: {}, strictTypes: true, secret } })
      expect(directionsOf(app, 'comments')).to.deep.equal(['normal', 'upstream'])
      expect(directionsOf(app, 'articles')).to.deep.equal(['normal', 'upstream'])
    })

    it('reports the type through the resource list', async () => {
      app = await startApp({ replication: { peers: [peer('upstream')], peersByResource: {}, secret } })
      const agent = request.agent(app.url)
      await agent.post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
      const { body } = await agent.get('/replicator/resources')
      expect(body.find(item => item.name === 'articles')).to.include({ type: 'downstream' })
    })
  })
})
