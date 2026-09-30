const http = require('http')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN, hardened, createUser, withNodeEnv, randomSecret } = require('../helpers/app')

/**
 * Opens a request and resolves with the status and headers as soon as they arrive (for event streams).
 * @param {string} url
 * @param {object} headers
 * @returns {Promise<{status: number, headers: object}>}
 */
const headersOf = (url, headers = {}) => new Promise((resolve, reject) => {
  const req = http.get(url, { headers }, (res) => {
    resolve({ status: res.statusCode, headers: res.headers })
    res.destroy()
  })
  req.on('error', reject)
})

const cookiesOf = (res) => res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ')

describe('HTTP hardening (security)', () => {
  describe('security headers', () => {
    it('sends a Content-Security-Policy and the other protective headers on every response (hardened profile)', async () => {
      const app = await startApp(hardened())
      try {
        for (const route of ['/admin/config', '/api/articles', '/no/such/route']) {
          const res = await request(app.url).get(route)
          const csp = res.headers['content-security-policy']
          expect(csp, `${route} CSP`).to.be.a('string')
          // the error page of an unknown route carries the stricter policy of the router
          if (route !== '/no/such/route') {
            expect(csp).to.include('default-src \'self\'')
            expect(csp).to.include('frame-ancestors \'self\'')
            expect(csp).to.include('object-src \'none\'')
            expect(csp).to.include('base-uri \'self\'')
          }
          expect(csp).to.not.match(/unsafe-eval|script-src[^;]*unsafe-inline/)
          expect(res.headers['x-content-type-options'], `${route} nosniff`).to.equal('nosniff')
          expect(res.headers['x-frame-options'], `${route} frame options`).to.equal('SAMEORIGIN')
          expect(res.headers['referrer-policy']).to.equal('no-referrer')
          expect(res.headers['permissions-policy']).to.include('camera=()')
          expect(res.headers['cross-origin-opener-policy']).to.equal('same-origin')
          expect(res.headers['x-powered-by'], `${route} x-powered-by`).to.equal(undefined)
          expect(res.headers['expect-ct'], `${route} expect-ct`).to.equal(undefined)
        }
      } finally {
        await app.close()
      }
    })

    it('sends HSTS only over https (hardened profile)', async () => {
      const app = await startApp(hardened({ trustProxy: 1 }))
      try {
        const plain = await request(app.url).get('/admin/config')
        expect(plain.headers['strict-transport-security']).to.equal(undefined)
        const secure = await request(app.url).get('/admin/config').set('X-Forwarded-Proto', 'https')
        expect(secure.headers['strict-transport-security']).to.match(/max-age=\d+/)
      } finally {
        await app.close()
      }
    })

    it('lets the configuration replace or disable the policy', async () => {
      const custom = await startApp(hardened({ security: { contentSecurityPolicy: 'default-src \'none\'' } }))
      const off = await startApp(hardened({ security: { contentSecurityPolicy: false } }))
      try {
        expect((await request(custom.url).get('/admin/config')).headers['content-security-policy']).to.equal('default-src \'none\'')
        expect((await request(off.url).get('/admin/config')).headers['content-security-policy']).to.equal(undefined)
      } finally {
        await custom.close()
        await off.close()
      }
    })

    it('keeps the historic headers with the legacy profile', async () => {
      const app = await startApp()
      try {
        const res = await request(app.url).get('/admin/config')
        expect(res.headers['content-security-policy']).to.equal(undefined)
        expect(res.headers['x-content-type-options']).to.equal('nosniff')
      } finally {
        await app.close()
      }
    })
  })

  describe('cross origin access to the event streams', () => {
    const login = async (app) => {
      const user = await createUser(app)
      const res = await request(app.url).post('/admin/login').send({ username: user.username, password: user.password })
      return cookiesOf(res)
    }

    it('does not answer with a wildcard origin (hardened profile)', async () => {
      const app = await startApp(hardened())
      try {
        const cookie = await login(app)
        for (const route of ['/api/system', '/api/_syslog']) {
          const same = await headersOf(`${app.url}${route}`, { Cookie: cookie })
          expect(same.status).to.equal(200)
          expect(same.headers['access-control-allow-origin'], route).to.equal(undefined)
          const foreign = await headersOf(`${app.url}${route}`, { Cookie: cookie, Origin: 'https://evil.example' })
          expect(foreign.headers['access-control-allow-origin'], `${route} foreign origin`).to.equal(undefined)
        }
      } finally {
        await app.close()
      }
    })

    it('answers an origin of security.sseCors and only that one', async () => {
      const app = await startApp(hardened({ security: { sseCors: ['https://admin.example'] } }))
      try {
        const cookie = await login(app)
        const listed = await headersOf(`${app.url}/api/system`, { Cookie: cookie, Origin: 'https://admin.example' })
        expect(listed.headers['access-control-allow-origin']).to.equal('https://admin.example')
        expect(listed.headers.vary).to.match(/Origin/)
        const other = await headersOf(`${app.url}/api/system`, { Cookie: cookie, Origin: 'https://evil.example' })
        expect(other.headers['access-control-allow-origin']).to.equal(undefined)
      } finally {
        await app.close()
      }
    })

    it('keeps the wildcard with the legacy profile (existing behaviour)', async () => {
      const app = await startApp()
      try {
        const cookie = await login(app)
        const res = await headersOf(`${app.url}/api/system`, { Cookie: cookie })
        expect(res.headers['access-control-allow-origin']).to.equal('*')
      } finally {
        await app.close()
      }
    })
  })

  describe('error responses', () => {
    it('answers a rejected query with a 400 json body and no stack trace (hardened profile)', async () => {
      const app = await startApp(hardened())
      try {
        const admin = await createUser(app)
        const res = await request(app.url).get('/api/articles').auth(admin.username, admin.password)
          .query({ query: JSON.stringify({ $where: '1' }) })
        expect(res.status).to.equal(400)
        expect(res.type).to.equal('application/json')
        expect(res.body.code).to.equal(400)
        expect(res.text).to.not.match(/\bat .*\.js:\d+|node_modules|\/home\//)
      } finally {
        await app.close()
      }
    })

    it('answers malformed json with a 400 json body and no stack trace (hardened profile)', async () => {
      const app = await startApp(hardened())
      try {
        const admin = await createUser(app)
        const res = await request(app.url).post('/api/articles').auth(admin.username, admin.password)
          .set('Content-Type', 'application/json').send('{"title": ')
        expect(res.status).to.equal(400)
        expect(res.type).to.equal('application/json')
        expect(res.text).to.not.match(/\bat .*\.js:\d+|node_modules|\/home\//)
      } finally {
        await app.close()
      }
    })

    it('does not send internals in production', async () => {
      const app = await withNodeEnv('production', () => startApp({ auth: { secret: randomSecret() }, session: { secret: randomSecret() } }))
      try {
        const admin = await createUser(app)
        const res = await request(app.url).get('/api/articles').auth(admin.username, admin.password)
          .query({ query: '{not json' })
        expect(res.status).to.be.oneOf([400, 500])
        expect(res.text).to.not.match(/\bat .*\.js:\d+|node_modules|\/home\//)
      } finally {
        await app.close()
      }
    })

    it('still answers the historic html error page with the legacy profile', async () => {
      const app = await startApp()
      try {
        const res = await request(app.url).get('/api/articles').auth(...ADMIN).query({ query: JSON.stringify({ $where: '1' }) })
        expect(res.status).to.equal(500)
      } finally {
        await app.close()
      }
    })
  })

  describe('request size limits', () => {
    const body = (size) => ({ title: 'x'.repeat(size) })

    it('rejects a json body above security.limits.json with 413 and a json body', async () => {
      const app = await startApp(hardened({ security: { limits: { json: '50kb' } } }))
      try {
        const admin = await createUser(app)
        const small = await request(app.url).post('/api/articles').auth(admin.username, admin.password).send(body(1000))
        expect(small.status).to.equal(200)
        const big = await request(app.url).post('/api/articles').auth(admin.username, admin.password).send(body(60 * 1024))
        expect(big.status).to.equal(413)
        expect(big.type).to.equal('application/json')
      } finally {
        await app.close()
      }
    })

    it('accepts more when security.limits.json is raised', async () => {
      const app = await startApp(hardened({ security: { limits: { json: '2mb' } } }))
      try {
        const admin = await createUser(app)
        const res = await request(app.url).post('/api/articles').auth(admin.username, admin.password).send(body(500 * 1024))
        expect(res.status).to.equal(200)
      } finally {
        await app.close()
      }
    })
  })
})
