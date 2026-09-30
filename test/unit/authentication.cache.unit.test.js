const request = require('supertest')
const { expect } = require('chai')
const { startApp, hardened, createUser, randomSecret } = require('../helpers/app')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

describe('verified passwords are remembered for a while (unit)', () => {
  let app, authentication, user
  const basic = (password = user.password) => request(app.url).get('/api/articles').auth(user.username, password)

  describe('by default', () => {
    before(async () => {
      app = await startApp(hardened())
      authentication = app.cms.$authentication
      user = await createUser(app)
    })
    after(async () => { await app.close() })

    it('runs the hash for the first request and not for the next ones', async () => {
      const before = { ...authentication.stats }
      expect((await basic()).status).to.equal(200)
      expect((await basic()).status).to.equal(200)
      expect((await basic()).status).to.equal(200)
      expect(authentication.stats.verifications - before.verifications).to.equal(1)
      expect(authentication.stats.cacheHits - before.cacheHits).to.equal(2)
    })

    it('never remembers a wrong password', async () => {
      const before = { ...authentication.stats }
      expect((await basic('wrong')).status).to.equal(401)
      expect((await basic('wrong')).status).to.equal(401)
      expect(authentication.stats.verifications - before.verifications).to.equal(2)
    })

    it('does not let a password verified for one account open another', async () => {
      const other = await createUser(app)
      const before = { ...authentication.stats }
      expect((await request(app.url).get('/api/articles').auth(other.username, user.password)).status).to.equal(401)
      expect(authentication.stats.cacheHits).to.equal(before.cacheHits)
    })

    it('stops trusting a password the moment it is changed', async () => {
      await basic()
      const changed = randomSecret(12)
      await authentication.users.update(user._id, { password: changed })
      expect((await basic()).status, 'the old password').to.equal(401)
      expect((await basic(changed)).status, 'the new password').to.equal(200)
      user.password = changed
    })

    it('stops trusting an account that was deleted', async () => {
      const gone = await createUser(app)
      const auth = () => request(app.url).get('/api/articles').auth(gone.username, gone.password)
      expect((await auth()).status).to.equal(200)
      await authentication.users.remove(gone._id)
      expect((await auth()).status).to.equal(401)
    })

    it('keeps nothing in memory that looks like the password', () => {
      const dump = JSON.stringify([...authentication.verified.keys()])
      expect(dump).to.not.include(user.password)
      expect(dump).to.not.include(user.username)
    })
  })

  describe('when it is short or off', () => {
    afterEach(async () => { await app.close() })

    it('forgets after security.authCacheTtl', async () => {
      app = await startApp(hardened({ security: { authCacheTtl: 50 } }))
      authentication = app.cms.$authentication
      user = await createUser(app)
      const before = authentication.stats.verifications
      await basic()
      await sleep(120)
      await basic()
      expect(authentication.stats.verifications - before).to.equal(2)
    })

    it('does not remember with security.authCacheTtl 0', async () => {
      app = await startApp(hardened({ security: { authCacheTtl: 0 } }))
      authentication = app.cms.$authentication
      user = await createUser(app)
      const before = authentication.stats.verifications
      await basic()
      await basic()
      expect(authentication.stats.verifications - before).to.equal(2)
      expect(authentication.stats.cacheHits).to.equal(0)
    })
  })
})
