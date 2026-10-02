const fs = require('fs')
const net = require('net')
const path = require('path')
const { PassThrough } = require('stream')
const request = require('supertest')
const { expect } = require('chai')
const through = require('../../lib/plugins/replicator/through')
const cap = require('../../lib/plugins/replicator/cap')
const protocol = require('../../lib/plugins/replicator/protocol')
const peerFetchOptions = require('../../lib/plugins/replicator/peerAuth')
const { startApp, ADMIN } = require('../helpers/app')

const freePort = () => new Promise((resolve) => {
  const server = net.createServer().listen(0, () => {
    const { port } = server.address()
    server.close(() => resolve(port))
  })
})

describe('replicator (unit)', () => {
  describe('through', () => {
    it('transforms chunks with access to its locals', (done) => {
      const upper = through(function (chunk, enc, cb) {
        this.count++
        cb(null, chunk.toString().toUpperCase())
      }, { count: 0 })
      const out = []
      upper.on('data', c => out.push(c.toString()))
      upper.on('end', () => {
        expect(out.join('')).to.equal('AB')
        expect(upper.count).to.equal(2)
        done()
      })
      upper.write('a')
      upper.end('b')
    })
  })

  describe('cap', () => {
    it('hands back exactly `length` bytes and leaves the rest on the socket', (done) => {
      const socket = new PassThrough()
      cap(socket, 3, (head) => {
        expect(head.toString()).to.equal('abc')
        global.setImmediate(() => {
          expect(socket.read().toString()).to.equal('defg')
          done()
        })
      })
      socket.write('abcdefg')
    })
    it('waits for enough data spread over several chunks', (done) => {
      const socket = new PassThrough()
      cap(socket, 4, (head) => {
        expect(head.toString()).to.equal('wxyz')
        done()
      })
      socket.write('w')
      socket.write('xy')
      setTimeout(() => socket.write('z'), 10)
    })
  })

  describe('protocol handshake', () => {
    it('exchanges resource name and machine id between client and server', async () => {
      const port = await freePort()
      const seenByServer = new Promise(resolve => {
        protocol.Server(port, 'SERVERID', (error, socket, name, id) => resolve({ error, name, id, socket }))
      })
      await new Promise(resolve => setTimeout(resolve, 50))
      const seenByClient = new Promise((resolve, reject) => {
        protocol.Client('localhost', port, 'articles', 'CLIENTID', (error, socket, id) => {
          if (error) return reject(error)
          resolve({ id, socket })
        })
      })
      const server = await seenByServer
      const client = await seenByClient
      expect(server.error).to.equal(null)
      expect(server.name).to.equal('articles')
      expect(server.id).to.equal('CLIENTID')
      expect(client.id).to.equal('SERVERID')
      server.socket.destroy()
      client.socket.destroy()
    })
    it('reports an error when nothing listens on the port', async () => {
      const port = await freePort()
      const error = await new Promise(resolve => protocol.Client('localhost', port, 'articles', 'CLIENTID', resolve))
      expect(error).to.be.ok
    })
  })

  describe('peerFetchOptions', () => {
    const resourceWith = (auth) => ({ options: { cms: { replication: { auth } } } })

    it('leaves requests anonymous when no credentials are configured', () => {
      expect(peerFetchOptions(resourceWith(undefined), { method: 'HEAD' })).to.deep.equal({ method: 'HEAD' })
      expect(peerFetchOptions({}, {})).to.deep.equal({})
    })
    it('adds a Basic Authorization header when credentials are configured', () => {
      const opts = peerFetchOptions(resourceWith({ username: 'user', password: 'pass' }), { method: 'HEAD' })
      expect(opts.method).to.equal('HEAD')
      expect(opts.headers.Authorization).to.equal(`Basic ${Buffer.from('user:pass').toString('base64')}`)
    })
    it('keeps other headers', () => {
      const opts = peerFetchOptions(resourceWith({ username: 'u', password: 'p' }), { headers: { Accept: 'x' } })
      expect(opts.headers).to.include({ Accept: 'x' })
      expect(opts.headers).to.have.property('Authorization')
    })
  })

  describe('manager', () => {
    let app, manager

    // default mode protects these routes with the login session, not with basic auth
    const loggedIn = async () => {
      const agent = request.agent(app.url)
      const res = await agent.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
      expect(res.status).to.equal(200)
      return agent
    }

    before(async () => {
      app = await startApp({
        replication: {
          peers: [{ url: 'http://localhost:1/', direction: 'normal' }],
          peersByResource: { authors: [] },
          auth: { username: ADMIN[0], password: ADMIN[1] }
        }
      })
      manager = app.cms.$replicator
    })
    after(async () => {
      await app.close()
    })

    it('directionIsValid follows the upstream/downstream rules', () => {
      const ok = manager.directionIsValid
      expect(ok('upstream', { direction: 'downstream' })).to.equal(true)
      expect(ok('downstream', { direction: 'upstream' })).to.equal(true)
      expect(ok('upstream', { direction: 'upstream' })).to.equal(false)
      expect(ok('downstream', { direction: 'downstream' })).to.equal(false)
      expect(ok('normal', { direction: 'upstream' })).to.equal(true)
      expect(ok('upstream', { direction: 'normal' })).to.equal(true)
    })
    it('getParams falls back to the global peers list', () => {
      const { peers } = manager.getParams('articles')
      expect(peers).to.have.length(1)
    })
    // The manager used to read `type` from the Resource object, where it does not exist: every resource counted as
    // 'normal' and the upstream/downstream rules never applied. Reading it from resource.options.type is behind
    // replication.strictTypes, because applying the rules stops the replication of the peers whose direction does not fit.
    it('reads the resource type from its options when replication.strictTypes is on, and keeps "normal" otherwise', async () => {
      expect(manager.getParams('articles').type).to.equal('normal')
      const strict = await startApp({ replication: { peers: [{ url: 'http://localhost:1/', direction: 'normal' }], peersByResource: {}, strictTypes: true } })
      try {
        expect(strict.cms.$replicator.getParams('articles').type).to.equal('downstream')
      } finally {
        await strict.close()
      }
    })
    it('getParams refuses unknown resources and resources without peers', () => {
      expect(() => manager.getParams('nothere')).to.throw(/not found/)
      expect(() => manager.getParams('authors')).to.throw(/No replication peers/)
    })
    it('lists resources with their peers through the API', async () => {
      const agent = await loggedIn()
      const res = await agent.get('/replicator/resources')
      expect(res.status).to.equal(200)
      const articles = res.body.find(r => r.name === 'articles')
      expect(articles).to.have.property('peers').that.has.length(1)
    })
    it('answers 500 with a message when syncing a resource without peers', async () => {
      const agent = await loggedIn()
      const res = await agent.post('/replicator/sync/authors')
      expect(res.status).to.equal(500)
      expect(res.body.error).to.match(/No replication peers/)
    })
    it('answers 401 for anonymous callers on every route', async () => {
      const list = await request(app.url).get('/replicator/resources')
      const sync = await request(app.url).post('/replicator/sync/articles')
      const record = await request(app.url).post('/replicator/sync/articles/abc')
      for (const res of [list, sync, record]) {
        expect(res.status).to.be.oneOf([401, 403])
      }
    })

    describe('attachment download from a protected peer', () => {
      let articleId, attachmentId

      before(async () => {
        const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'replicated' })
        articleId = created.body._id
        const att = await request(app.url)
          .post(`/api/articles/${articleId}/attachments`)
          .auth(...ADMIN)
          .field('_filename', 'man.jpg')
          .attach('image', path.join(__dirname, '..', 'fixtures', 'man.jpg'), { contentType: 'image/jpeg' })
        attachmentId = att.body._id
      })

      const url = () => `${app.url}/api/articles/file/${attachmentId}`

      it('is refused without credentials', async () => {
        const res = await fetch(url())
        expect(res.status).to.equal(401)
      })
      it('succeeds with the configured replication credentials', async () => {
        const resource = app.cms.resource('articles')
        const head = await fetch(url(), peerFetchOptions(resource, { method: 'HEAD' }))
        expect(head.status).to.equal(200)
        const res = await fetch(url(), peerFetchOptions(resource))
        expect(res.status).to.equal(200)
        const body = Buffer.from(await res.arrayBuffer())
        expect(body.length).to.equal(fs.statSync(path.join(__dirname, '..', 'fixtures', 'man.jpg')).size)
      })
    })
  })
})
