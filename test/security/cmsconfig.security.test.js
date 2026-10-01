const fs = require('fs-extra')
const path = require('path')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN, hardened, createUser } = require('../helpers/app')

// the Cms Config page reads and rewrites cms.json (secrets included) and restarts the server: admins only
describe('cms-config editor (security)', () => {
  const profiles = {
    legacy: { disableJwtLogin: true },
    hardened: hardened({ disableJwtLogin: true, security: { localAdmin: true } })
  }

  Object.entries(profiles).forEach(([profile, options]) => {
    describe(`Basic authentication mode (${profile} profile)`, () => {
      let app, admin, editor, configBefore
      before(async () => {
        app = await startApp(options)
        const auth = app.cms.$authentication
        const editors = await auth.groups.create({ name: 'editors', read: ['articles'], create: [], update: [], remove: [], attachments: [] })
        admin = await createUser(app)
        editor = await createUser(app, { group: editors._id })
        configBefore = await fs.readFile(path.join(app.dataDir, 'cms.json'), 'utf8')
      })
      after(async () => {
        // nothing refused may have rewritten the configuration
        expect(await fs.readFile(path.join(app.dataDir, 'cms.json'), 'utf8')).to.equal(configBefore)
        await app.close()
      })

      const get = (credentials) => {
        const req = request(app.url).get('/admin/cms-config').timeout({ response: 3000 })
        return credentials ? req.auth(credentials.username, credentials.password) : req
      }
      const post = (credentials, body) => {
        const req = request(app.url).post('/admin/cms-config').timeout({ response: 3000 })
        return (credentials ? req.auth(credentials.username, credentials.password) : req).send(body)
      }

      it('lets an admin read the configuration', async () => {
        const res = await get(admin)
        expect(res.status).to.equal(200)
        expect(res.body).to.have.property('disableJwtLogin', true)
      })
      it('lets the built-in admin read the configuration', async () => {
        const res = await get({ username: ADMIN[0], password: ADMIN[1] })
        expect(res.status).to.equal(200)
      })
      it('refuses a request without credentials', async () => {
        expect((await get()).status).to.equal(403)
        expect((await post(undefined, { port: 1 })).status).to.equal(403)
      })
      it('refuses an admin name with a wrong password', async () => {
        const wrong = { username: admin.username, password: `${admin.password}x` }
        expect((await get(wrong)).status).to.equal(403)
        expect((await post(wrong, { port: 1 })).status).to.equal(403)
      })
      it('refuses a user who is not in the admins group', async () => {
        const res = await get(editor)
        expect(res.status).to.equal(403)
        expect(res.text).to.not.include('secret')
        expect((await post(editor, { port: 1 })).status).to.equal(403)
      })
      it('refuses credentials that are not Basic', async () => {
        const res = await request(app.url).get('/admin/cms-config').set('Authorization', `Bearer ${admin.password}`)
        expect(res.status).to.equal(403)
      })
      if (profile === 'hardened') {
        it('lets an admin save (the weak secret check answers, after the admin check)', async () => {
          // a configuration without secrets is refused by security.strongSecrets: nothing is written, no restart
          const res = await post(admin, {})
          expect(res.status).to.equal(400)
          expect(res.body.error).to.include('auth.secret')
        })
      }
    })
  })

  describe('JWT login mode', () => {
    let app
    before(async () => { app = await startApp({ disableAuthentication: true }) })
    after(async () => { await app.close() })

    it('lets a logged in admin read the configuration', async () => {
      const agent = request.agent(app.url)
      expect((await agent.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })).status).to.equal(200)
      const res = await agent.get('/admin/cms-config')
      expect(res.status).to.equal(200)
    })
    it('does not accept Basic credentials instead of the login', async () => {
      const res = await request(app.url).get('/admin/cms-config').auth(...ADMIN)
      expect(res.status).to.equal(403)
    })
  })
})
