const fs = require('fs')
const path = require('path')
const request = require('supertest')
const { expect } = require('chai')
const { resolveSecurity } = require('../../lib/util/securityOptions')
const { startApp, randomSecret, withNodeEnv } = require('../helpers/app')

// the block of SECURITY.md that documents the recommended production configuration
const example = () => {
  const text = fs.readFileSync(path.join(__dirname, '..', '..', 'SECURITY.md'), 'utf8')
  const block = /<!-- example-config:start -->\s*```json\n([\s\S]*?)```\s*<!-- example-config:end -->/.exec(text)
  expect(block, 'SECURITY.md has the example configuration block').to.be.ok
  // the placeholders stand for secrets: real values are generated here
  return JSON.parse(block[1].replace(/REPLACE_WITH_RANDOM_\w+/g, () => randomSecret()))
}

describe('recommended production configuration (SECURITY.md)', () => {
  it('only uses settings the code knows', () => {
    const config = example()
    const known = Object.keys(resolveSecurity({}))
    for (const key of Object.keys(config.security)) {
      expect(known, `security.${key}`).to.include(key)
    }
    const top = ['auth', 'session', 'trustProxy', 'blockRetry', 'attachmentCleanupGrace', 'replication', 'security']
    expect(Object.keys(config)).to.have.members(top)
  })

  it('resolves to the decided settings, in production and outside it', async () => {
    for (const env of ['production', undefined]) {
      const settings = await withNodeEnv(env, () => resolveSecurity(example()))
      expect(settings).to.deep.include({
        strongSecrets: true,
        localAdmin: true,
        passwordHash: 'scrypt',
        hideCredentials: true,
        genericLockout: true,
        csrf: 'origin',
        strictSessions: true,
        redactConfig: true,
        strictAdmin: true,
        headers: true,
        safeRegex: true,
        uniformErrors: true,
        safeAttachments: false,
        strictUploads: false,
        restrictRemoteUrls: true,
        strictReplication: true,
        wsAuth: true,
        wsMaxPayload: 16384,
        authCacheTtl: 60000
      })
      expect(settings.sseCors).to.deep.equal([])
      expect(settings.cookies).to.deep.equal({ httpOnly: true, sameSite: 'lax', secure: 'auto' })
      // strictUploads is off: no upload limits
      expect(settings.limits.upload).to.deep.equal({})
      expect(settings.limits.json).to.equal('100kb')
      expect(settings.blockRetry).to.deep.equal({ retry: 10, duration: 5 })
    }
  })

  it('boots the CMS and applies the protections it names', async () => {
    const config = example()
    const app = await startApp({ ...config, replication: { ...config.replication, peers: [], peersByResource: {} } })
    try {
      const res = await request(app.url).get('/admin/_groups')
      expect(res.status, 'strictAdmin: a login is needed').to.be.oneOf([401, 403])
      expect(res.headers['content-security-policy'], 'headers').to.be.a('string')
      expect(res.headers['x-powered-by']).to.equal(undefined)
      const login = await request(app.url).post('/admin/login').send({ username: 'localAdmin', password: 'localAdmin' })
      expect(login.status, 'localAdmin was kept, with its default password').to.equal(200)
      expect(JSON.stringify(login.body), 'hideCredentials').to.not.match(/salt/i)
    } finally {
      await app.close()
    }
  })
})
