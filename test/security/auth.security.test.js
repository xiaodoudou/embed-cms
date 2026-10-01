const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const { expect } = require('chai')
const { getCMSInstance, options: baseOptions } = require('../cmsInstance')
const { startApp, ADMIN, randomSecret, hardened, createUser, withNodeEnv } = require('../helpers/app')

// Published defaults of `defaultConfig()` in index.js: they must never be accepted in production.
const PUBLISHED_AUTH_SECRET = 'MdjIwFRi9ezT1234567890abcdef'
const PUBLISHED_SESSION_SECRET = 'MdjIwFRi9ezT'

/**
 * Builds a CMS without starting a server (enough to test the constructor checks).
 * @param {object} overrides
 * @param {string|undefined} nodeEnv
 * @returns {Promise<{cms: object, dataDir: string}>}
 */
async function buildCms (overrides, nodeEnv, dataDir) {
  dataDir = dataDir || await fs.mkdtemp(path.join(os.tmpdir(), 'embed-cms-test-'))
  return withNodeEnv(nodeEnv, () => {
    const cms = getCMSInstance({
      ...baseOptions,
      syslog: undefined,
      ...overrides,
      data: dataDir,
      config: path.join(dataDir, 'cms.json')
    })
    return { cms, dataDir }
  })
}

const cookieOf = (res, name) => (res.headers['set-cookie'] || []).find(c => c.startsWith(`${name}=`))
const valueOf = (cookie) => cookie && cookie.split(';')[0].split('=').slice(1).join('=')

describe('authentication hardening (security)', () => {
  describe('secrets', () => {
    const dirs = []
    after(async () => { await Promise.all(dirs.map(dir => fs.remove(dir))) })

    it('refuses to boot in production with the published default secrets', async () => {
      let error
      try {
        const built = await buildCms({ auth: { secret: PUBLISHED_AUTH_SECRET }, session: { secret: PUBLISHED_SESSION_SECRET } }, 'production')
        dirs.push(built.dataDir)
        await built.cms._closeDatabase()
      } catch (e) {
        error = e
      }
      expect(error, 'the constructor must throw').to.be.an('error')
      expect(error.message).to.match(/secret/i)
    })

    it('refuses a production session secret that is too short', async () => {
      let error
      try {
        const built = await buildCms({ auth: { secret: randomSecret() }, session: { secret: 'short' } }, 'production')
        dirs.push(built.dataDir)
        await built.cms._closeDatabase()
      } catch (e) {
        error = e
      }
      expect(error, 'the constructor must throw').to.be.an('error')
      expect(error.message).to.match(/session\.secret/)
    })

    it('boots in production with strong secrets', async () => {
      const built = await buildCms({ auth: { secret: randomSecret() }, session: { secret: randomSecret() } }, 'production')
      dirs.push(built.dataDir)
      await built.cms._closeDatabase()
    })

    it('keeps accepting the published defaults outside of production (existing behaviour)', async () => {
      const built = await buildCms({ auth: { secret: PUBLISHED_AUTH_SECRET }, session: { secret: PUBLISHED_SESSION_SECRET } }, undefined)
      dirs.push(built.dataDir)
      await built.cms._closeDatabase()
    })

    it('generates and persists strong secrets when security.generateSecrets is on', async () => {
      const first = await buildCms({
        auth: { secret: PUBLISHED_AUTH_SECRET },
        session: { secret: PUBLISHED_SESSION_SECRET },
        security: { generateSecrets: true }
      }, 'production')
      dirs.push(first.dataDir)
      const { auth, session } = first.cms.options
      expect(auth.secret).to.not.equal(PUBLISHED_AUTH_SECRET)
      expect(session.secret).to.not.equal(PUBLISHED_SESSION_SECRET)
      expect(auth.secret.length).to.be.at.least(32)
      const file = path.join(first.dataDir, '.secrets.json')
      expect(fs.existsSync(file), 'the secrets file exists').to.equal(true)
      // Windows has no POSIX permission bits
      if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o077, 'only the owner can read it').to.equal(0)
      await first.cms._closeDatabase()
      // second boot on the same data: same secrets, so sessions and tokens survive a restart
      const second = await buildCms({
        auth: { secret: PUBLISHED_AUTH_SECRET },
        session: { secret: PUBLISHED_SESSION_SECRET },
        security: { generateSecrets: true }
      }, 'production', first.dataDir)
      expect(second.cms.options.auth.secret).to.equal(auth.secret)
      expect(second.cms.options.session.secret).to.equal(session.secret)
      await second.cms._closeDatabase()
    })
  })

  describe('built-in localAdmin account', () => {
    it('is not created', async () => {
      const app = await startApp(hardened())
      try {
        const found = await app.cms.$authentication.users.json.find({ username: 'localAdmin' })
        expect(found).to.equal(undefined)
        const res = await request(app.url).post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
        expect(res.status).to.be.oneOf([400, 401, 403])
      } finally {
        await app.close()
      }
    })

    it('is created when security.localAdmin is true', async () => {
      const app = await startApp(hardened({ security: { localAdmin: true } }))
      try {
        const res = await request(app.url).post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
        expect(res.status).to.equal(200)
      } finally {
        await app.close()
      }
    })

    it('is created by default outside of production (existing behaviour)', async () => {
      const app = await startApp()
      try {
        const res = await request(app.url).post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
        expect(res.status).to.equal(200)
      } finally {
        await app.close()
      }
    })

    it('an existing localAdmin record cannot log in with the default password once the account is disabled', async () => {
      const legacy = await startApp({}, { keepData: true })
      const dataDir = legacy.dataDir
      await legacy.close()
      const app = await startApp(hardened(), { dataDir })
      try {
        const res = await request(app.url).post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
        expect(res.status).to.be.oneOf([401, 403])
        const basic = await request(app.url).get('/api/articles').auth(...ADMIN)
        expect(basic.status).to.equal(401)
      } finally {
        await app.close()
      }
    })
  })

  describe('password hashing', () => {
    it('stores new passwords with scrypt in a versioned format', async () => {
      const app = await startApp(hardened())
      try {
        const user = await createUser(app)
        const record = await app.cms.$authentication.users.json.find({ username: user.username })
        expect(record.password).to.match(/^\$scrypt\$v=1\$N=\d+,r=\d+,p=\d+\$/)
        const res = await request(app.url).post('/admin/login').send({ username: user.username, password: user.password })
        expect(res.status).to.equal(200)
        const bad = await request(app.url).post('/admin/login').send({ username: user.username, password: `${user.password}x` })
        expect(bad.status).to.be.oneOf([401, 403])
      } finally {
        await app.close()
      }
    })

    it('writes scrypt outside of production too', async () => {
      const app = await startApp()
      try {
        const user = await createUser(app)
        const record = await app.cms.$authentication.users.json.find({ username: user.username })
        expect(record.password).to.match(/^[$]scrypt[$]/)
      } finally {
        await app.close()
      }
    })

    it('rehashes a historic hash on a successful login', async () => {
      const app = await startApp(hardened())
      try {
        const authentication = app.cms.$authentication
        const password = randomSecret(12)
        const { salt, hash } = authentication.generatePassword(password, null)
        const id = app.cms.options.uuid()
        const now = Date.now()
        await authentication.users.json.create(id, {
          _id: id,
          _createdAt: now,
          _updatedAt: now,
          _publishedAt: null,
          username: 'legacy-user',
          password: hash,
          salt,
          group: authentication.adminsGroup._id
        })
        const res = await request(app.url).post('/admin/login').send({ username: 'legacy-user', password })
        expect(res.status).to.equal(200)
        const record = await authentication.users.json.find({ username: 'legacy-user' })
        expect(record.password).to.match(/^\$scrypt\$/)
        const again = await request(app.url).post('/admin/login').send({ username: 'legacy-user', password })
        expect(again.status).to.equal(200)
      } finally {
        await app.close()
      }
    })

    it('does not hash a password that is the record\'s own stored hash again (theme change locked users out)', async () => {
      const app = await startApp()
      try {
        const agent = request.agent(app.url)
        expect((await agent.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })).status).to.equal(200)
        expect((await agent.get('/admin/changeTheme/light')).status).to.equal(200)
        const again = await request(app.url).post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
        expect(again.status).to.equal(200)
      } finally {
        await app.close()
      }
    })
  })

  describe('password hashes and salts never leave the server', () => {
    it('hides password and salt for a filtered read of _users', async () => {
      const app = await startApp()
      try {
        const res = await request(app.url).get('/api/_users').auth(...ADMIN)
          .query({ query: JSON.stringify({ username: 'localAdmin' }) })
        expect(res.status).to.equal(200)
        expect(res.body[0]).to.not.have.any.keys('password', 'salt')
      } finally {
        await app.close()
      }
    })

    it('hides password and salt from GET /api/_users/:id', async () => {
      const app = await startApp(hardened())
      try {
        const admin = await createUser(app)
        const res = await request(app.url).get(`/api/_users/${admin._id}`).auth(admin.username, admin.password)
        expect(res.status).to.equal(200)
        expect(res.body).to.not.have.any.keys('password', 'salt')
      } finally {
        await app.close()
      }
    })

    it('puts neither the hash nor the salt in the JWT or in the login response', async () => {
      const app = await startApp(hardened())
      try {
        const admin = await createUser(app)
        const res = await request(app.url).post('/admin/login').send({ username: admin.username, password: admin.password })
        expect(res.status).to.equal(200)
        expect(res.body).to.not.have.any.keys('password', 'salt')
        expect(res.body.token).to.be.a('string')
        const payload = jwt.decode(res.body.token)
        expect(payload).to.not.have.property('password')
        expect(JSON.stringify(payload)).to.not.match(/[0-9a-f]{128,}|\$scrypt\$/)
        const cookie = valueOf(cookieOf(res, app.cms.cookieNames.jwt))
        expect(jwt.decode(cookie)).to.not.have.property('password')
      } finally {
        await app.close()
      }
    })

    it('invalidates a session token when the password changes', async () => {
      const app = await startApp(hardened())
      try {
        const admin = await createUser(app)
        const login = await request(app.url).post('/admin/login').send({ username: admin.username, password: admin.password })
        const token = login.body.token
        const before = await request(app.url).get('/admin/login').set('x-access-token', token)
        expect(before.body.username).to.equal(admin.username)
        await app.cms.$authentication.users.update(admin._id, { password: randomSecret(12) })
        const after = await request(app.url).get('/admin/login').set('x-access-token', token)
        expect(after.body.username).to.equal(undefined)
      } finally {
        await app.close()
      }
    })
  })

  describe('login rate limiting', () => {
    it('rejects a user name that is not a string instead of using it as a query', async () => {
      const app = await startApp()
      try {
        const res = await request(app.url).post('/admin/login').send({ username: { $regex: '^localAdmin$' }, password: ADMIN[1] })
        expect(res.status).to.equal(400)
        expect(res.body).to.not.have.property('token')
      } finally {
        await app.close()
      }
    })

    it('cannot be bypassed with an object as user name once the account is locked', async () => {
      const app = await startApp({ blockRetry: { retry: 2, duration: 1 } })
      try {
        for (let i = 0; i < 4; i++) {
          await request(app.url).post('/admin/login').send({ username: ADMIN[0], password: `wrong-${i}` })
        }
        const locked = await request(app.url).post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
        expect(locked.status).to.not.equal(200)
        const bypass = await request(app.url).post('/admin/login').send({ username: { $regex: '^localAdmin$' }, password: ADMIN[1] })
        expect(bypass.status).to.not.equal(200)
      } finally {
        await app.close()
      }
    })

    it('answers 429 with Retry-After and the same message for an existing and an unknown account', async () => {
      const app = await startApp(hardened({ blockRetry: { retry: 2, duration: 1 } }))
      try {
        const admin = await createUser(app)
        const answers = {}
        for (const username of [admin.username, 'nobody-here']) {
          let last
          for (let i = 0; i < 4; i++) {
            last = await request(app.url).post('/admin/login').send({ username, password: `wrong-${i}` })
          }
          answers[username] = last
        }
        expect(answers[admin.username].status).to.equal(429)
        expect(answers['nobody-here'].status).to.equal(429)
        expect(answers[admin.username].headers['retry-after']).to.match(/^\d+$/)
        const strip = (res) => JSON.stringify(res.body).replace(new RegExp(`${admin.username}|nobody-here`, 'g'), 'X')
        expect(strip(answers[admin.username])).to.equal(strip(answers['nobody-here']))
      } finally {
        await app.close()
      }
    })

    it('blocks an address that tries many different accounts', async () => {
      const app = await startApp(hardened({ blockRetry: { retry: 2, duration: 1 } }))
      try {
        let last
        for (let i = 0; i < 14; i++) {
          last = await request(app.url).post('/admin/login').send({ username: `ghost-${i}`, password: 'x' })
        }
        expect(last.status).to.equal(429)
      } finally {
        await app.close()
      }
    })

    it('is not bypassed by a spoofed X-Forwarded-For when no proxy is trusted', async () => {
      const app = await startApp(hardened({ blockRetry: { retry: 2, duration: 1 } }))
      try {
        const admin = await createUser(app)
        let last
        for (let i = 0; i < 5; i++) {
          last = await request(app.url).post('/admin/login').set('X-Forwarded-For', `10.0.0.${i}`)
            .send({ username: admin.username, password: `wrong-${i}` })
        }
        expect(last.status).to.equal(429)
        const good = await request(app.url).post('/admin/login').set('X-Forwarded-For', '10.9.9.9')
          .send({ username: admin.username, password: admin.password })
        expect(good.status).to.equal(429)
      } finally {
        await app.close()
      }
    })

    it('uses the address the trusted proxy saw, not the ones the client wrote in the header (trustProxy)', async () => {
      const app = await startApp(hardened({ blockRetry: { retry: 2, duration: 1 }, trustProxy: 1 }))
      try {
        const admin = await createUser(app)
        let last
        for (let i = 0; i < 5; i++) {
          // the client controls the left part of the header, the proxy appends the real address on the right
          last = await request(app.url).post('/admin/login').set('X-Forwarded-For', `10.0.0.${i}, 203.0.113.7`)
            .send({ username: admin.username, password: `wrong-${i}` })
        }
        expect(last.status).to.equal(429)
      } finally {
        await app.close()
      }
    })

  })

  describe('cookies and sessions', () => {
    it('sets HttpOnly and SameSite on the JWT and session cookies, and Secure over https', async () => {
      const app = await startApp(hardened({ trustProxy: 1 }))
      try {
        const admin = await createUser(app)
        const res = await request(app.url).post('/admin/login').set('X-Forwarded-Proto', 'https')
          .send({ username: admin.username, password: admin.password })
        const jwtCookie = cookieOf(res, app.cms.cookieNames.jwt)
        const sessionCookie = cookieOf(res, app.cms.cookieNames.session)
        expect(jwtCookie, 'JWT cookie').to.match(/HttpOnly/i)
        expect(jwtCookie).to.match(/SameSite=Lax/i)
        expect(jwtCookie).to.match(/Secure/i)
        expect(sessionCookie, 'session cookie').to.match(/HttpOnly/i)
        expect(sessionCookie).to.match(/SameSite=Lax/i)
        expect(sessionCookie).to.match(/Secure/i)
      } finally {
        await app.close()
      }
    })

    it('does not create a session for an anonymous request', async () => {
      const app = await startApp(hardened())
      try {
        const a = await request(app.url).get('/admin/config')
        const b = await request(app.url).get('/api/articles')
        expect(a.headers['set-cookie']).to.equal(undefined)
        expect(b.headers['set-cookie']).to.equal(undefined)
      } finally {
        await app.close()
      }
    })

    it('does not create a session for a Basic authenticated API call', async () => {
      const app = await startApp(hardened())
      try {
        const admin = await createUser(app)
        const res = await request(app.url).get('/api/articles').auth(admin.username, admin.password)
        expect(res.status).to.equal(200)
        expect(res.headers['set-cookie']).to.equal(undefined)
      } finally {
        await app.close()
      }
    })

    it('issues a new session id on login and the old one no longer identifies anyone', async () => {
      const app = await startApp()
      try {
        const first = await request(app.url).post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
        const before = valueOf(cookieOf(first, app.cms.cookieNames.session))
        expect(before, 'a login gets a session').to.be.a('string')
        const login = await request(app.url).post('/admin/login').set('Cookie', `${app.cms.cookieNames.session}=${before}`)
          .send({ username: ADMIN[0], password: ADMIN[1] })
        expect(login.status).to.equal(200)
        const after = valueOf(cookieOf(login, app.cms.cookieNames.session))
        expect(after, 'a new session cookie is issued').to.be.a('string').and.not.equal(before)
        const stale = await request(app.url).get('/admin/login').set('Cookie', `${app.cms.cookieNames.session}=${before}`)
        expect(stale.body.username).to.equal(undefined)
      } finally {
        await app.close()
      }
    })

    it('rejects the token after logout, even when it is presented again (session mode)', async () => {
      const app = await startApp()
      try {
        const agent = request.agent(app.url)
        const login = await agent.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
        const token = login.body.token
        expect((await request(app.url).get('/admin/login').set('x-access-token', token)).body.username, 'valid before logout').to.equal(ADMIN[0])
        const out = await agent.get('/admin/logout')
        expect(out.status).to.equal(200)
        const replay = await request(app.url).get('/admin/login').set('x-access-token', token)
        expect(replay.body.username, 'header replay').to.equal(undefined)
      } finally {
        await app.close()
      }
    })

    it('rejects the token after logout, even when it is presented again (JWT cookie mode)', async () => {
      const app = await startApp({ disableAuthentication: true })
      try {
        const agent = request.agent(app.url)
        const login = await agent.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
        const token = login.body.token
        expect((await request(app.url).get('/admin/login').set('Cookie', `${app.cms.cookieNames.jwt}=${token}`)).body.username, 'valid before logout').to.equal(ADMIN[0])
        await agent.get('/admin/logout')
        const replay = await request(app.url).get('/admin/login').set('Cookie', `${app.cms.cookieNames.jwt}=${token}`)
        expect(replay.body.username, 'cookie replay').to.equal(undefined)
      } finally {
        await app.close()
      }
    })

    it('destroys the session on logout', async () => {
      const app = await startApp()
      try {
        const agent = request.agent(app.url)
        await agent.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
        expect((await agent.get('/admin/login')).body.username).to.equal(ADMIN[0])
        await agent.get('/admin/logout')
        expect((await agent.get('/admin/login')).body.username).to.equal(undefined)
      } finally {
        await app.close()
      }
    })
  })

  describe('csrf', () => {
    const cookiesOf = (res) => res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ')

    describe('session cookie routes (default authentication mode)', () => {
      let app, cookie
      before(async () => {
        app = await startApp(hardened())
        const admin = await createUser(app)
        const login = await request(app.url).post('/admin/login').send({ username: admin.username, password: admin.password })
        cookie = cookiesOf(login)
      })
      after(async () => { await app.close() })

      it('rejects a state changing GET that a foreign site triggered', async () => {
        const res = await request(app.url).get('/admin/changeTheme/light').set('Cookie', cookie).set('Sec-Fetch-Site', 'cross-site')
        expect(res.status).to.equal(403)
        const imp = await request(app.url).get('/importFromRemote/execute').set('Cookie', cookie).set('Sec-Fetch-Site', 'cross-site')
        expect(imp.status).to.equal(403)
      })

      it('rejects a POST with a foreign Origin or Referer', async () => {
        const origin = await request(app.url).post('/_users').set('Cookie', cookie).set('Origin', 'https://evil.example').send({})
        expect(origin.status).to.equal(403)
        const referer = await request(app.url).post('/_users').set('Cookie', cookie).set('Referer', 'https://evil.example/x').send({})
        expect(referer.status).to.equal(403)
      })

      it('accepts the same origin and requests without any origin information', async () => {
        const same = await request(app.url).get('/admin/changeTheme/light').set('Cookie', cookie).set('Sec-Fetch-Site', 'same-origin')
        expect(same.status).to.equal(200)
        const none = await request(app.url).get('/admin/changeTheme/dark').set('Cookie', cookie)
        expect(none.status).to.equal(200)
        const sameOrigin = await request(app.url).get('/admin/changeTheme/dark').set('Cookie', cookie).set('Origin', app.url)
        expect(sameOrigin.status).to.equal(200)
      })
    })

    describe('cookie authenticated REST (JWT cookie mode)', () => {
      let app, admin, cookie
      before(async () => {
        app = await startApp(hardened({ disableAuthentication: true }))
        admin = await createUser(app)
        const login = await request(app.url).post('/admin/login').send({ username: admin.username, password: admin.password })
        cookie = cookiesOf(login)
      })
      after(async () => { await app.close() })

      it('accepts a write without origin information (the cookie authenticates)', async () => {
        const res = await request(app.url).post('/api/articles').set('Cookie', cookie).send({ title: 'script' })
        expect(res.status).to.equal(200)
      })

      it('rejects a cookie authenticated write from a foreign origin', async () => {
        const res = await request(app.url).post('/api/articles').set('Cookie', cookie)
          .set('Origin', 'https://evil.example').send({ title: 'csrf' })
        expect(res.status).to.equal(403)
      })

      it('accepts the same origin', async () => {
        const res = await request(app.url).post('/api/articles').set('Cookie', cookie).set('Origin', app.url).send({ title: 'same origin' })
        expect(res.status).to.equal(200)
      })

      it('accepts an origin listed in security.allowedOrigins', async () => {
        const other = await startApp(hardened({ disableAuthentication: true, security: { allowedOrigins: ['https://admin.example'] } }))
        try {
          const user = await createUser(other)
          const login = await request(other.url).post('/admin/login').send({ username: user.username, password: user.password })
          const res = await request(other.url).post('/api/articles').set('Cookie', cookiesOf(login))
            .set('Origin', 'https://admin.example').send({ title: 'allowed' })
          expect(res.status).to.equal(200)
        } finally {
          await other.close()
        }
      })

      it('does not touch a request that carries no cookie of the CMS', async () => {
        const res = await request(app.url).post('/api/articles').set('Authorization', `Bearer ${randomSecret()}`)
          .set('Origin', 'https://evil.example').send({ title: 'no cookie' })
        expect(res.status).to.not.equal(403)
      })
    })

  })

  describe('a production boot (NODE_ENV=production)', () => {
    it('logs in, keeps the session in the file store and logs out with the hardened defaults', async () => {
      const app = await withNodeEnv('production', () => startApp({
        auth: { secret: randomSecret() },
        session: { secret: randomSecret() }
      }))
      try {
        expect(app.cms.security).to.include({ localAdmin: false, strongSecrets: true })
        const user = await createUser(app)
        const agent = request.agent(app.url)
        const login = await agent.post('/admin/login').send({ username: user.username, password: user.password })
        expect(login.status).to.equal(200)
        expect((await agent.get('/admin/login')).body.username).to.equal(user.username)
        expect(fs.existsSync(path.join(app.dataDir, '.sessions.json'))).to.equal(true)
        await agent.get('/admin/logout')
        expect((await agent.get('/admin/login')).body.username).to.equal(undefined)
        // the built-in account does not exist and the default password is refused
        const local = await request(app.url).post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
        expect(local.status).to.be.oneOf([401, 403])
      } finally {
        await app.close()
      }
    })
  })

  describe('configuration exposed to the browser', () => {
    const remote = { remote: { host: 'cms.example.com', username: 'importer', password: randomSecret(8) } }

    it('does not send credentials from the import options through /admin/config', async () => {
      const app = await startApp(hardened({ importFromRemote: remote }))
      try {
        const res = await request(app.url).get('/admin/config')
        expect(res.status).to.equal(200)
        expect(JSON.stringify(res.body)).to.not.include(remote.remote.password)
        expect(res.body.importFromRemote, 'the plugin stays visible to the UI').to.be.ok
      } finally {
        await app.close()
      }
    })

    it('requires a login for /admin/_groups', async () => {
      const app = await startApp(hardened())
      try {
        const anonymous = await request(app.url).get('/admin/_groups')
        expect(anonymous.status).to.be.oneOf([401, 403])
        const admin = await createUser(app)
        const login = await request(app.url).post('/admin/login').send({ username: admin.username, password: admin.password })
        const cookie = login.headers['set-cookie'].map(c => c.split(';')[0]).join('; ')
        const res = await request(app.url).get('/admin/_groups').set('Cookie', cookie)
        expect(res.status).to.equal(200)
      } finally {
        await app.close()
      }
    })
  })
})
