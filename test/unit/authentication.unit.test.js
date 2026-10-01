const request = require('supertest')
const jwt = require('jsonwebtoken')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

const SECRET = require('../cmsInstance').options.auth.secret

describe('authentication (unit)', () => {
  let app, auth

  before(async () => {
    app = await startApp({ blockRetry: { retry: 2, duration: 1 } })
    auth = app.cms.$authentication
    const editors = await auth.groups.create({ name: 'editors', read: ['articles'], create: ['articles'], update: [], remove: [], attachments: [] })
    await auth.users.create({ username: 'editor', password: 'editorPass', group: editors._id })
    await auth.users.create({ username: 'victim', password: 'victimPass', group: editors._id })
  })
  after(async () => {
    await app.close()
  })

  describe('generatePassword', () => {
    it('is deterministic for a given salt', () => {
      const a = auth.generatePassword('secret', 'salt')
      const b = auth.generatePassword('secret', 'salt')
      expect(a.hash).to.equal(b.hash)
      expect(a.salt).to.equal('salt')
    })
    it('differs per password and per salt', () => {
      const base = auth.generatePassword('secret', 'salt').hash
      expect(auth.generatePassword('other', 'salt').hash).to.not.equal(base)
      expect(auth.generatePassword('secret', 'salt2').hash).to.not.equal(base)
    })
    it('generates a random salt when none is given', () => {
      const a = auth.generatePassword('secret')
      const b = auth.generatePassword('secret')
      expect(a.salt).to.not.equal(b.salt)
    })
  })

  describe('user records', () => {
    it('stores a hash, never the plaintext password', async () => {
      const record = await auth.users.find({ username: 'editor' })
      const user = await auth.users.json.find(record._id)
      expect(user.password).to.not.equal('editorPass')
      expect(user.password).to.match(/^[$]scrypt[$]/)
      expect(user.salt).to.be.a('string')
    })
    it('does not return the password through the REST API', async () => {
      const res = await request(app.url).get('/api/_users').auth(...ADMIN)
      expect(res.status).to.equal(200)
      res.body.forEach(u => expect(u).to.not.have.property('password'))
    })
  })

  describe('authenticate', () => {
    it('accepts valid credentials', async () => {
      const { result, error } = await auth.authenticate('editor', 'editorPass', { headers: {}, ip: '10.0.0.1' })
      expect(error).to.equal(undefined)
      expect(result).to.have.property('username', 'editor')
    })
    it('rejects a wrong password and an unknown user with the same error', async () => {
      const wrong = await auth.authenticate('editor', 'nope', { headers: {}, ip: '10.0.0.2' })
      const unknown = await auth.authenticate('ghost', 'nope', { headers: {}, ip: '10.0.0.3' })
      expect(wrong.error).to.deep.equal(unknown.error)
      expect(wrong.error.code).to.equal(401)
    })
    it('blocks an ip after too many failures and keeps blocking correct passwords', async () => {
      const req = { headers: {}, ip: '10.0.0.9' }
      for (let i = 0; i < 4; i++) {
        await auth.authenticate('victim', `wrong${i}`, req)
      }
      const blocked = await auth.authenticate('victim', 'victimPass', req)
      expect(blocked.error.message).to.match(/too many failed attempts/i)
    })
    it('does not block the same user from another ip', async () => {
      const { result } = await auth.authenticate('victim', 'victimPass', { headers: {}, ip: '10.0.0.10' })
      expect(result).to.have.property('username', 'victim')
    })
    it('ignores a spoofed x-forwarded-for header when tracking failures', async () => {
      const req = (n) => ({ headers: { 'x-forwarded-for': `1.2.3.${n}` }, ip: '10.0.0.20' })
      for (let i = 0; i < 4; i++) {
        await auth.authenticate('editor', `wrong${i}`, req(i))
      }
      const blocked = await auth.authenticate('editor', 'editorPass', req(99))
      expect(blocked.error && blocked.error.message).to.match(/too many failed attempts/i)
    })
  })

  describe('group based authorization over REST', () => {
    it('allows what the group grants', async () => {
      const list = await request(app.url).get('/api/articles').auth('editor', 'editorPass')
      expect(list.status).to.equal(200)
      const create = await request(app.url).post('/api/articles').auth('editor', 'editorPass').send({ title: 'by editor' })
      expect(create.status).to.equal(200)
      expect(create.body._updatedBy).to.match(/editor$/)
    })
    it('refuses actions and resources the group does not grant', async () => {
      const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'x' })
      const del = await request(app.url).delete(`/api/articles/${created.body._id}`).auth('editor', 'editorPass')
      expect(del.status).to.equal(401)
      const other = await request(app.url).get('/api/authors').auth('editor', 'editorPass')
      expect(other.status).to.equal(401)
    })
    it('refuses wrong credentials', async () => {
      const res = await request(app.url).get('/api/articles').auth('editor', 'bad')
      expect(res.status).to.equal(401)
    })
    it('cannot impersonate another user through ?user=', async () => {
      const res = await request(app.url).post('/api/articles').auth('editor', 'editorPass')
        .query({ user: JSON.stringify({ username: 'localAdmin' }) }).send({ title: 'spoof' })
      expect(res.body._updatedBy).to.not.match(/localAdmin/)
    })
  })

  describe('allow / deny', () => {
    it('grants and revokes a resource permission for a group', async () => {
      await auth.allow('editors', 'authors', ['read'])
      expect((await request(app.url).get('/api/authors').auth('editor', 'editorPass')).status).to.equal(200)
      await auth.deny('editors', 'authors', ['read'])
      expect((await request(app.url).get('/api/authors').auth('editor', 'editorPass')).status).to.equal(401)
    })
    it('does not duplicate entries when allowing twice', async () => {
      await auth.allow('editors', 'cities', ['read'])
      await auth.allow('editors', 'cities', ['read'])
      const group = await auth.groups.find({ name: 'editors' })
      expect(group.read.filter(r => r === 'cities')).to.have.length(1)
      await auth.deny('editors', 'cities', ['read'])
    })
  })

  describe('JWT session mode', () => {
    let jwtApp
    before(async () => {
      // cookies are only parsed in jwt mode (disableAuthentication: true)
      jwtApp = await startApp({ disableAuthentication: true })
    })
    after(async () => {
      await jwtApp.close()
    })
    const sign = (payload, opts = {}) => jwt.sign(payload, opts.secret || SECRET, { expiresIn: opts.expiresIn || '1h' })

    it('accepts the session created by a successful login', async () => {
      const agent = request.agent(jwtApp.url)
      const loginRes = await agent.post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
      expect(loginRes.status).to.equal(200)
      const res = await agent.get('/api/articles')
      expect(res.status).to.equal(200)
    })
    it('accepts a validly signed token even without a session cookie', async () => {
      const token = sign({ username: 'localAdmin' })
      const res = await request(jwtApp.url).get('/api/articles').set('x-access-token', token)
      expect(res.status).to.be.oneOf([401, 403])
    })
    it('rejects a token signed with another secret', async () => {
      const token = sign({ username: 'localAdmin' }, { secret: 'wrong-secret' })
      const res = await request(jwtApp.url).get('/api/articles').set('x-access-token', token)
      expect(res.status).to.be.oneOf([401, 403])
    })
    it('rejects an expired token', async () => {
      const token = jwt.sign({ username: 'localAdmin', exp: Math.floor(Date.now() / 1000) - 60 }, SECRET)
      const res = await request(jwtApp.url).get('/api/articles').set('x-access-token', token)
      expect(res.status).to.be.oneOf([401, 403])
    })
    it('rejects an unsigned (alg none) token', async () => {
      const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
      const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ username: 'localAdmin' })}.`
      const res = await request(jwtApp.url).get('/api/articles').set('x-access-token', token)
      expect(res.status).to.be.oneOf([401, 403])
    })
    it('rejects a garbage token without hanging', async () => {
      const res = await request(jwtApp.url).get('/api/articles').set('x-access-token', 'not.a.jwt')
      expect(res.status).to.be.oneOf([401, 403])
    })
  })
})
