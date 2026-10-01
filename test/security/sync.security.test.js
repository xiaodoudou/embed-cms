const express = require('express')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

const LOCAL_TOKEN = 'local-token'
const REMOTE_TOKEN = 'remote-token'

/**
 * Stands in for the other CMS: answers the token routes and records what it received.
 */
async function startRemote () {
  const calls = []
  const app = express()
  app.use(express.json())
  app.all('/*', (req, res) => {
    calls.push({ method: req.method, path: req.path, token: req.query.token, body: req.body })
    if (req.query.token !== REMOTE_TOKEN) {
      return res.status(401).json({ error: 'token is not match' })
    }
    if (req.method === 'GET' && req.path === '/sync/cities') {
      return res.json([{ key: 'remote-city', name: { en: 'Remote' } }])
    }
    if (req.method === 'GET' && req.path === '/sync/cities/status') {
      return res.json({ status: 'done', allows: ['read', 'write'] })
    }
    res.json({ message: 'done' })
  })
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s))
  })
  return {
    calls,
    url: `http://localhost:${server.address().port}`,
    close: async () => {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  }
}

const login = async (app) => {
  const res = await request(app.url).post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
  expect(res.status).to.equal(200)
  return (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ')
}

const configure = async (app, remote) => {
  await app.cms.api()('_sync').create({
    allows: ['read', 'write'],
    local: { token: LOCAL_TOKEN, url: app.url },
    remote: { token: REMOTE_TOKEN, url: remote.url }
  })
}

describe('sync routes (security)', () => {
  let app, remote, cookie

  before(async () => {
    remote = await startRemote()
    app = await startApp({ sync: { resources: ['cities'] } })
    await configure(app, remote)
    await app.cms.api()('cities').create({ key: 'local-city', name: { en: 'Local' } })
    cookie = await login(app)
  })
  after(async () => {
    await app.close()
    await remote.close()
  })
  beforeEach(() => {
    remote.calls.length = 0
  })

  describe('proxy routes (/sync/local|remote/:resource)', () => {
    const routes = ['/sync/remote/cities', '/sync/remote/cities/status', '/sync/local/cities', '/sync/local/cities/status']

    it('refuse an anonymous visitor, without calling the other CMS', async () => {
      for (const route of routes) {
        const res = await request(app.url).get(route)
        expect(res.status, route).to.be.oneOf([401, 403])
      }
      expect(remote.calls).to.have.length(0)
    })

    it('refuse a visitor who only knows a sync token', async () => {
      const res = await request(app.url).get('/sync/remote/cities').query({ token: LOCAL_TOKEN })
      expect(res.status).to.be.oneOf([401, 403])
      expect(remote.calls).to.have.length(0)
    })

    it('answer a logged-in admin user', async () => {
      const remoteList = await request(app.url).get('/sync/remote/cities').set('Cookie', cookie)
      expect(remoteList.status).to.equal(200)
      expect(remoteList.body.map(r => r.key)).to.deep.equal(['remote-city'])
      const remoteStatus = await request(app.url).get('/sync/remote/cities/status').set('Cookie', cookie)
      expect(remoteStatus.status).to.equal(200)
      expect(remoteStatus.body).to.have.property('status', 'done')
      const localList = await request(app.url).get('/sync/local/cities').set('Cookie', cookie)
      expect(localList.status).to.equal(200)
      expect(localList.body.map(r => r.key)).to.deep.equal(['local-city'])
    })
  })

  describe('server-to-server routes keep working with the token alone', () => {
    it('GET /sync/:resource and its status', async () => {
      const list = await request(app.url).get('/sync/cities').query({ token: LOCAL_TOKEN })
      expect(list.status).to.equal(200)
      const status = await request(app.url).get('/sync/cities/status').query({ token: LOCAL_TOKEN })
      expect(status.status).to.equal(200)
    })

    it('GET and POST /sync/:resource/from/:from/to/:to', async () => {
      const get = await request(app.url).get('/sync/cities/from/local/to/remote').query({ token: LOCAL_TOKEN })
      expect(get.status).to.equal(200)
      const post = await request(app.url).post('/sync/cities/from/local/to/remote').query({ token: LOCAL_TOKEN })
      expect(post.status).to.equal(200)
    })

    it('a session does not replace a wrong token', async () => {
      const res = await request(app.url).post('/sync/cities/from/local/to/remote').query({ token: 'nope' }).set('Cookie', cookie)
      expect(res.status).to.equal(401)
    })
  })

  describe('deploy from the admin (POST /sync/:resource/from/:from/to/:to)', () => {
    it('works for a logged-in admin user without the token', async () => {
      const res = await request(app.url).post('/sync/cities/from/local/to/remote').set('Cookie', cookie)
      expect(res.status).to.equal(200)
      expect(res.body).to.deep.equal({ message: 'done' })
      const put = remote.calls.find(call => call.method === 'PUT')
      expect(put, 'the other CMS received no data').to.not.equal(undefined)
      expect(put.path).to.equal('/sync/cities')
      expect(put.body.map(r => r.key)).to.deep.equal(['local-city'])
    })

    it('is refused to an anonymous visitor', async () => {
      const res = await request(app.url).post('/sync/cities/from/local/to/remote')
      expect(res.status).to.be.oneOf([401, 403])
      expect(remote.calls).to.have.length(0)
    })

    it('the GET form still needs the token: a link must not deploy', async () => {
      const res = await request(app.url).get('/sync/cities/from/local/to/remote').set('Cookie', cookie)
      expect(res.status).to.equal(401)
      expect(remote.calls).to.have.length(0)
    })
  })

  describe('refusals', () => {
    it('a refused write says that writing is not allowed', async () => {
      const config = await app.cms.api()('_sync').find({})
      await app.cms.api()('_sync').update(config._id, { allows: ['read'] })
      try {
        const res = await request(app.url).put('/sync/cities').query({ token: LOCAL_TOKEN }).send([])
        expect(res.status).to.equal(403)
        expect(res.body.error).to.equal('write data is not allowed')
      } finally {
        await app.cms.api()('_sync').update(config._id, { allows: ['read', 'write'] })
      }
    })
  })
})

describe('sync routes with Basic authentication (security)', () => {
  let app, remote

  before(async () => {
    remote = await startRemote()
    app = await startApp({ sync: { resources: ['cities'] }, disableJwtLogin: true })
    await configure(app, remote)
  })
  after(async () => {
    await app.close()
    await remote.close()
  })

  it('the proxy routes need the Basic credentials of a user', async () => {
    const anon = await request(app.url).get('/sync/remote/cities')
    expect(anon.status).to.equal(401)
    const wrong = await request(app.url).get('/sync/remote/cities').auth(ADMIN[0], 'wrong-password')
    expect(wrong.status).to.equal(401)
    const res = await request(app.url).get('/sync/remote/cities').auth(ADMIN[0], ADMIN[1])
    expect(res.status).to.equal(200)
  })

  it('deploy works with the Basic credentials of a user', async () => {
    const res = await request(app.url).post('/sync/cities/from/remote/to/local').auth(ADMIN[0], ADMIN[1])
    expect(res.status).to.equal(200)
  })
})
