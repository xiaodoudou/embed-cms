const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN, hardened, createUser } = require('../helpers/app')

// disableJwtLogin: false and disableAuthentication: false (the combination test/helpers/cmsInstance.js uses): the admin logs in
// with the JWT login and calls the REST API with the cookies of that login
describe('both login modes on (security)', () => {
  const profiles = {
    'development defaults': {},
    'production like': hardened({ security: { localAdmin: true } })
  }

  Object.entries(profiles).forEach(([profile, options]) => {
    describe(`${profile}`, () => {
      let app, editor
      before(async () => {
        app = await startApp(options)
        const editors = await app.cms.$authentication.groups.create({ name: 'editors', read: ['authors'], create: [], update: [], remove: [], attachments: [] })
        editor = await createUser(app, { group: editors._id })
      })
      after(async () => { await app.close() })

      const login = async (username, password) => {
        const agent = request.agent(app.url)
        const res = await agent.post('/admin/login').send({ username, password })
        expect(res.status).to.equal(200)
        return agent
      }

      it('refuses an anonymous REST call', async () => {
        expect((await request(app.url).get('/api/articles')).status).to.equal(401)
      })
      it('runs the REST calls of a logged in admin as that admin', async () => {
        const agent = await login(...ADMIN)
        expect((await agent.get('/api/articles')).status).to.equal(200)
        const created = await agent.post('/api/articles').send({ title: { enUS: 'from the admin' } })
        expect(created.status).to.equal(200)
        expect(created.body._updatedBy).to.equal('admins~localAdmin')
      })
      it('keeps the permissions of the logged in user', async () => {
        const agent = await login(editor.username, editor.password)
        expect((await agent.get('/api/authors')).status).to.equal(200)
        expect((await agent.get('/api/articles')).status).to.equal(401)
        expect((await agent.post('/api/authors').send({ name: 'x' })).status).to.equal(401)
      })
      it('stops authenticating the REST calls after the logout', async () => {
        const agent = await login(...ADMIN)
        expect((await agent.get('/admin/logout')).status).to.equal(200)
        expect((await agent.get('/api/articles')).status).to.be.oneOf([401, 403])
      })
      it('does not accept a forged token cookie', async () => {
        const res = await request(app.url).get('/api/articles').set('Cookie', `${app.cms.cookieNames.jwt}=forged.token.value`)
        expect(res.status).to.be.oneOf([401, 403])
      })
      it('still accepts Basic credentials from a client without cookies', async () => {
        expect((await request(app.url).get('/api/articles').auth(...ADMIN)).status).to.equal(200)
      })
      it('rejects a cross-site write that rides on the login cookies', async () => {
        const agent = await login(...ADMIN)
        const res = await agent.post('/api/articles').set('Origin', 'https://evil.example').send({ title: { enUS: 'forged' } })
        expect(res.status).to.equal(403)
      })
    })
  })
})
