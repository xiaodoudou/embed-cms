const fs = require('fs')
const http = require('http')
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
    const SECRET = 'a-shared-replication-secret-for-the-test'
    // an HTTP server, as the CMS has: the replication is an upgrade on it
    const httpServer = () => new Promise((resolve) => {
      const server = http.createServer((req, res) => res.writeHead(404).end())
      server.listen(0, () => resolve(server))
    })

    it('exchanges resource name and machine id between client and server, over the HTTP port', async () => {
      const server = await httpServer()
      const { port } = server.address()
      const seenByServer = new Promise(resolve => {
        protocol.Server(server, 'SERVERID', (error, socket, name, id) => resolve({ error, name, id, socket }), { secret: SECRET })
      })
      const seenByClient = new Promise((resolve, reject) => {
        protocol.Client(`ws://localhost:${port}/_replicator`, 'articles', 'CLIENTID', (error, socket, id) => {
          if (error) return reject(error)
          resolve({ id, socket })
        }, { secret: SECRET })
      })
      const seen = await seenByServer
      const client = await seenByClient
      expect(seen.error).to.equal(null)
      expect(seen.name).to.equal('articles')
      expect(seen.id).to.equal('CLIENTID')
      expect(client.id).to.equal('SERVERID')
      seen.socket.destroy()
      client.socket.destroy()
      server.close()
    })

    it('reports an error when nothing listens on the port', async () => {
      const port = await freePort()
      const error = await new Promise(resolve => protocol.Client(`ws://localhost:${port}/_replicator`, 'articles', 'CLIENTID', resolve, { secret: SECRET }))
      expect(error).to.be.ok
    })

    it('says what the peer answered when nothing replicates at that address', async () => {
      const server = await httpServer()
      const error = await new Promise(resolve => protocol.Client(`ws://localhost:${server.address().port}/_replicator`, 'articles', 'CLIENTID', resolve, { secret: SECRET }))
      expect(error.message).to.match(/answered 404/)
      server.close()
    })

    it('needs a secret on both sides', () => {
      expect(() => protocol.Server(http.createServer(), 'SERVERID', () => {}, {})).to.throw(/replication.secret/)
      let error
      protocol.Client('ws://localhost:1/_replicator', 'articles', 'CLIENTID', (e) => { error = e }, {})
      expect(error.message).to.match(/replication.secret/)
    })

    it('finds the websocket of a peer from the url of its REST API, under a mount path too', () => {
      expect(protocol.replicationUrl('http://site-1.internal:9990/api/')).to.equal('ws://site-1.internal:9990/_replicator')
      expect(protocol.replicationUrl('https://example.com/cms/api')).to.equal('wss://example.com/cms/_replicator')
      expect(() => protocol.replicationUrl('http://site/files/')).to.throw(/ending in \/api\//)
      expect(() => protocol.replicationUrl('ftp://site/api/')).to.throw(/http/)
      expect(() => protocol.replicationUrl(undefined)).to.throw(/not an address/)
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

    it('takes the peers of a resource from its own list, else from the global one', () => {
      expect(manager.peersOf('articles')).to.have.length(1)
      // authors has a list of its own, empty
      expect(manager.peersOf('authors')).to.deep.equal([])
      expect(manager.hasPeers('authors')).to.equal(false)
    })
    it('keeps the resources of the CMS itself out of the global peers list', async () => {
      // every node makes its own admins group and localAdmin: a node that took another node's could not update them
      for (const name of ['_users', '_groups', '_settings']) {
        expect(manager.peersOf(name), name).to.deep.equal([])
        expect(manager.hasPeers(name), name).to.equal(false)
      }
      const agent = await loggedIn()
      const { body } = await agent.get('/replicator/resources')
      expect(body.find((item) => item.name === '_users').peers).to.deep.equal([])
      expect(body.find((item) => item.name === 'articles').peers).to.have.length(1)
    })
    it('replicates a resource of the CMS when peersByResource names it', async () => {
      const named = await startApp({ replication: { peers: [], peersByResource: { _settings: [{ url: 'http://localhost:1/api/', direction: 'upstream' }] } } })
      try {
        expect(named.cms.$replicator.peersOf('_settings')).to.have.length(1)
        expect(named.cms.$replicator.peersOf('_users')).to.deep.equal([])
      } finally {
        await named.close()
      }
    })
    it('reads the type of a resource from its declaration', () => {
      expect(manager.typeOf(app.cms._resources.articles)).to.equal('downstream')
      expect(manager.typeOf(app.cms._resources.authors)).to.equal('normal')
    })
    it('lists each resource with its type, its peers and its links through the API', async () => {
      const agent = await loggedIn()
      const res = await agent.get('/replicator/resources')
      expect(res.status).to.equal(200)
      const articles = res.body.find(r => r.name === 'articles')
      expect(articles).to.include({ type: 'downstream' })
      expect(articles.peers).to.have.length(1)
      // no replication.secret here: no link is opened, and no peer pulls from this node
      expect(articles.receives).to.deep.equal([])
      expect(articles.sends).to.deep.equal([])
    })
    it('answers 500 with a message when asked to resync a resource it pulls from no peer', async () => {
      const agent = await loggedIn()
      const res = await agent.post('/replicator/sync/authors')
      expect(res.status).to.equal(500)
      expect(res.body.error).to.match(/no peer/)
    })
    it('answers 401 for anonymous callers on every route', async () => {
      const list = await request(app.url).get('/replicator/resources')
      const sync = await request(app.url).post('/replicator/sync/articles')
      for (const res of [list, sync]) {
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
