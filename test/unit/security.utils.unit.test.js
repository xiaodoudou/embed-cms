const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const { expect } = require('chai')
const { hash: hashPassword, verify, parse, needsRehash } = require('../../lib/util/passwords')
const LoginLimiter = require('../../lib/util/loginLimiter')
const TokenRevocation = require('../../lib/util/tokenRevocation')
const csrfGuard = require('../../lib/util/csrf')
const { resolveSecurity } = require('../../lib/util/securityOptions')
const { redactSecrets, restoreSecrets, publicConfig, REDACTED } = require('../../lib/util/redact')
const { isWeak } = require('../../lib/util/secrets')
const { randomSecret, withNodeEnv } = require('../helpers/app')

describe('security utilities (unit)', () => {
  describe('passwords', () => {
    it('hashes with scrypt into a versioned string and verifies it', async () => {
      const password = randomSecret(8)
      const { salt, hash } = await hashPassword(password, { scheme: 'scrypt' })
      expect(hash).to.match(/^\$scrypt\$v=1\$N=32768,r=8,p=1\$[A-Za-z0-9_-]{43}$/)
      expect((await verify(password, hash, salt)).ok).to.equal(true)
      expect((await verify(`${password}x`, hash, salt)).ok).to.equal(false)
    })

    it('uses a different salt every time', async () => {
      const a = await hashPassword('same', { scheme: 'scrypt' })
      const b = await hashPassword('same', { scheme: 'scrypt' })
      expect(a.salt).to.not.equal(b.salt)
      expect(a.hash).to.not.equal(b.hash)
    })

    it('still verifies the historic PBKDF2-SHA1 format and says it should be replaced', async () => {
      const { salt, hash } = await hashPassword('legacy password', { scheme: 'legacy' })
      expect(hash).to.match(/^[0-9a-f]{1024}$/)
      const verified = await verify('legacy password', hash, salt)
      expect(verified).to.include({ ok: true, scheme: 'legacy' })
      expect(needsRehash(verified, 'scrypt')).to.equal(true)
      expect(needsRehash(verified, 'legacy')).to.equal(false)
    })

    it('does not ask for a rehash of a hash that already has the wanted cost', async () => {
      const { salt, hash } = await hashPassword('x', { scheme: 'scrypt' })
      expect(needsRehash(await verify('x', hash, salt), 'scrypt')).to.equal(false)
    })

    it('asks for a rehash of a scrypt hash with a lower cost', async () => {
      const { salt, hash } = await hashPassword('x', { scheme: 'scrypt', params: { N: 1024 } })
      const verified = await verify('x', hash, salt)
      expect(verified.ok).to.equal(true)
      expect(needsRehash(verified, 'scrypt')).to.equal(true)
    })

    it('refuses stored values with unreasonable cost parameters instead of computing them', async () => {
      const digest = Buffer.alloc(32).toString('base64url')
      for (const stored of [
        `$scrypt$v=1$N=1073741824,r=8,p=1$${digest}`, // 2^30: memory bomb
        `$scrypt$v=1$N=16384,r=8,p=1000$${digest}`,
        `$scrypt$v=1$N=3,r=8,p=1$${digest}`, // not a power of two
        `$scrypt$v=2$N=16384,r=8,p=1$${digest}`,
        '$scrypt$v=1$N=16384,r=8,p=1$',
        '$other$v=1$N=16384,r=8,p=1$abc',
        ''
      ]) {
        expect(parse(stored), stored).to.equal(null)
        expect((await verify('x', stored, 'salt')).ok, stored).to.equal(false)
      }
    })

    it('refuses input that is not a string', async () => {
      const { salt, hash } = await hashPassword('x', { scheme: 'scrypt' })
      expect((await verify({ $ne: 1 }, hash, salt)).ok).to.equal(false)
      expect((await verify('x', hash, undefined)).ok).to.equal(false)
    })
  })

  describe('LoginLimiter', () => {
    const clock = () => {
      const state = { now: 1000000 }
      return { state, now: () => state.now }
    }

    it('locks an account and address after more than `retry` failures, and unlocks after the duration', () => {
      const { state, now } = clock()
      const limiter = new LoginLimiter({ retry: 2, duration: 1, now })
      for (let i = 0; i < 3; i++) {
        expect(limiter.check('alice', '1.1.1.1').blocked).to.equal(false)
        limiter.fail('alice', '1.1.1.1', `p${i}`)
      }
      const blocked = limiter.check('alice', '1.1.1.1')
      expect(blocked).to.include({ blocked: true })
      expect(blocked.retryAfter).to.be.within(1, 60)
      // another address is not locked by the account and address counter
      expect(limiter.check('alice', '2.2.2.2').blocked).to.equal(false)
      state.now += 61 * 1000
      expect(limiter.check('alice', '1.1.1.1').blocked).to.equal(false)
    })

    it('does not count the same wrong password twice for an account and address', () => {
      const limiter = new LoginLimiter({ retry: 3, duration: 1 })
      for (let i = 0; i < 10; i++) {
        limiter.fail('alice', '1.1.1.1', 'stale')
      }
      // the account and address counter saw one guess; the address counter (15 here) still counts every attempt
      expect(limiter.check('alice', '1.1.1.1').blocked).to.equal(false)
      expect(limiter.entries.get('ai\u0000alice\u00001.1.1.1').count).to.equal(1)
      expect(limiter.entries.get('ip\u00001.1.1.1').count).to.equal(10)
    })

    it('locks an address that tries many accounts', () => {
      const limiter = new LoginLimiter({ retry: 2, duration: 1 })
      for (let i = 0; i < 11; i++) {
        limiter.fail(`user-${i}`, '9.9.9.9', 'x')
      }
      expect(limiter.check('someone-else', '9.9.9.9').blocked).to.equal(true)
      expect(limiter.check('someone-else', '8.8.8.8').blocked).to.equal(false)
    })

    it('locks an account that is attacked from many addresses, at a higher threshold', () => {
      const limiter = new LoginLimiter({ retry: 1, duration: 1 })
      for (let i = 0; i < 21; i++) {
        limiter.fail('alice', `10.0.0.${i}`, `p${i}`)
      }
      expect(limiter.check('alice', '10.9.9.9').blocked).to.equal(true)
    })

    it('a success clears the counter of that account and address', () => {
      const limiter = new LoginLimiter({ retry: 2, duration: 1 })
      limiter.fail('alice', '1.1.1.1', 'a')
      limiter.fail('alice', '1.1.1.1', 'b')
      limiter.success('alice', '1.1.1.1')
      limiter.fail('alice', '1.1.1.1', 'c')
      limiter.fail('alice', '1.1.1.1', 'd')
      expect(limiter.check('alice', '1.1.1.1').blocked).to.equal(false)
    })

    it('forgets old failures and stays bounded', () => {
      const { state, now } = clock()
      const limiter = new LoginLimiter({ retry: 5, duration: 1, maxEntries: 50, now })
      for (let i = 0; i < 500; i++) {
        limiter.fail(`user-${i}`, `10.0.${i % 250}.${i % 7}`, 'x')
      }
      expect(limiter.entries.size).to.be.at.most(50)
      state.now += 2 * 60 * 1000
      limiter.fail('late', '1.2.3.4', 'x')
      limiter.prune()
      expect(limiter.entries.size).to.be.at.most(50)
    })
  })

  describe('TokenRevocation', () => {
    it('remembers a revoked token until it expires', () => {
      const state = { now: 1000 }
      const revocation = new TokenRevocation({ now: () => state.now })
      revocation.revoke('token-a', 5000)
      expect(revocation.isRevoked('token-a')).to.equal(true)
      expect(revocation.isRevoked('token-b')).to.equal(false)
      state.now = 6000
      expect(revocation.isRevoked('token-a')).to.equal(false)
    })

    it('persists hashes of the tokens (never the tokens) and reloads them', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'node-cms-revoked-'))
      try {
        const file = path.join(dir, 'revoked.json')
        const first = new TokenRevocation({ file })
        first.revoke('secret-token-value', Date.now() + 60000)
        await first.flush()
        const raw = await fs.readFile(file, 'utf8')
        expect(raw).to.not.include('secret-token-value')
        // Windows has no POSIX permission bits
        if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o077).to.equal(0)
        expect(new TokenRevocation({ file }).isRevoked('secret-token-value')).to.equal(true)
      } finally {
        await fs.remove(dir)
      }
    })

    it('starts empty when the file is damaged', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'node-cms-revoked-'))
      try {
        const file = path.join(dir, 'revoked.json')
        await fs.writeFile(file, '{ not json')
        expect(new TokenRevocation({ file }).isRevoked('x')).to.equal(false)
      } finally {
        await fs.remove(dir)
      }
    })
  })

  describe('csrf guard', () => {
    const security = { csrf: 'origin', allowedOrigins: ['https://admin.example'] }
    const run = (overrides) => {
      const middleware = csrfGuard(security)
      const req = { method: 'POST', path: '/api/articles', headers: { host: 'cms.local:9990', cookie: 'connect.sid=abc' }, ...overrides }
      const outcome = {}
      middleware(req, { status: (code) => ({ json: () => { outcome.status = code } }) }, () => { outcome.passed = true })
      return outcome
    }

    it('is not installed when the check is off', () => {
      expect(csrfGuard({ csrf: 'off', allowedOrigins: [] })).to.equal(null)
    })

    it('lets safe methods through', () => {
      expect(run({ method: 'GET', headers: { host: 'cms.local:9990', cookie: 'connect.sid=abc', origin: 'https://evil.example' } }).passed).to.equal(true)
    })

    it('rejects a foreign Origin, a null Origin and a foreign Referer', () => {
      const base = { host: 'cms.local:9990', cookie: 'nodeCmsJwt=abc' }
      expect(run({ headers: { ...base, origin: 'https://evil.example' } }).status).to.equal(403)
      expect(run({ headers: { ...base, origin: 'null' } }).status).to.equal(403)
      expect(run({ headers: { ...base, referer: 'https://evil.example/page' } }).status).to.equal(403)
    })

    it('accepts the own host, a listed origin and requests without origin information', () => {
      const base = { host: 'cms.local:9990', cookie: 'nodeCmsJwt=abc' }
      expect(run({ headers: { ...base, origin: 'http://cms.local:9990' } }).passed).to.equal(true)
      expect(run({ headers: { ...base, origin: 'https://admin.example' } }).passed).to.equal(true)
      expect(run({ headers: { ...base } }).passed).to.equal(true)
    })

    it('uses Fetch Metadata when the browser sent neither Origin nor Referer', () => {
      const base = { host: 'cms.local:9990', cookie: 'nodeCmsJwt=abc' }
      expect(run({ headers: { ...base, 'sec-fetch-site': 'cross-site' } }).status).to.equal(403)
      expect(run({ headers: { ...base, 'sec-fetch-site': 'same-site' } }).status).to.equal(403)
      expect(run({ headers: { ...base, 'sec-fetch-site': 'same-origin' } }).passed).to.equal(true)
    })

    it('ignores requests that carry no cookie of the CMS', () => {
      expect(run({ headers: { host: 'cms.local:9990', origin: 'https://evil.example', authorization: 'Basic abc' } }).passed).to.equal(true)
    })

    it('guards the GET routes that change state', () => {
      const headers = { host: 'cms.local:9990', cookie: 'connect.sid=abc', 'sec-fetch-site': 'cross-site' }
      for (const route of ['/importFromRemote/execute', '/import/execute', '/admin/changeTheme/dark']) {
        expect(run({ method: 'GET', path: route, headers }).status, route).to.equal(403)
      }
      expect(run({ method: 'GET', path: '/api/articles', headers }).passed).to.equal(true)
    })
  })

  describe('security settings', () => {
    it('follows NODE_ENV for the profile', async () => {
      expect(await withNodeEnv('production', () => resolveSecurity({}).profile)).to.equal('hardened')
      expect(await withNodeEnv(undefined, () => resolveSecurity({}).profile)).to.equal('legacy')
      expect(await withNodeEnv('development', () => resolveSecurity({}).profile)).to.equal('legacy')
    })

    it('lets the configuration pick a profile and override single settings', async () => {
      await withNodeEnv('production', () => {
        const legacy = resolveSecurity({ security: { profile: 'legacy' } })
        expect(legacy).to.include({ localAdmin: true, csrf: 'off', passwordHash: 'legacy', strongSecrets: false })
        const mixed = resolveSecurity({ security: { localAdmin: true, csrf: 'off' } })
        expect(mixed).to.include({ localAdmin: true, csrf: 'off', passwordHash: 'scrypt', strongSecrets: true })
      })
      const hardened = resolveSecurity({ security: { profile: 'hardened' } })
      expect(hardened).to.include({ localAdmin: false, csrf: 'origin', passwordHash: 'scrypt', hideCredentials: true })
      expect(hardened.blockRetry).to.deep.equal({ retry: 10, duration: 5 })
    })

    it('keeps the lockout as configured, and false turns it off', () => {
      expect(resolveSecurity({ blockRetry: { retry: 3, duration: 2 } }).blockRetry).to.deep.equal({ retry: 3, duration: 2 })
      expect(resolveSecurity({ security: { profile: 'hardened' }, blockRetry: false }).blockRetry).to.equal(undefined)
      expect(resolveSecurity({}).blockRetry).to.equal(undefined)
    })

    it('rejects unsupported values', () => {
      expect(() => resolveSecurity({ security: { csrf: 'token' } })).to.throw(/security\.csrf/)
      expect(() => resolveSecurity({ security: { passwordHash: 'md5' } })).to.throw(/security\.passwordHash/)
    })
  })

  describe('secrets', () => {
    it('treats missing, short and published values as weak', () => {
      expect(isWeak(undefined, 16)).to.equal(true)
      expect(isWeak('short', 16)).to.equal(true)
      expect(isWeak('MdjIwFRi9ezT1234567890abcdef', 16)).to.equal(true)
      expect(isWeak(['long enough secret 1', 'x'], 16)).to.equal(true)
      expect(isWeak(randomSecret(), 16)).to.equal(false)
      expect(isWeak([randomSecret(), randomSecret()], 16)).to.equal(false)
    })
  })

  describe('redaction', () => {
    it('masks secrets by key name, and the password of a url', () => {
      const out = redactSecrets({
        auth: { secret: 'a-secret' },
        session: { secret: 'b-secret', resave: false },
        replication: { auth: { username: 'u', password: 'p' }, peers: [{ host: 'h', token: 't' }] },
        dbEngine: { type: 'mongodb', url: 'mongodb://user:pw@db.local:27017/cms' },
        title: 'Site'
      })
      expect(out.auth.secret).to.equal(REDACTED)
      expect(out.session).to.deep.equal({ secret: REDACTED, resave: false })
      expect(out.replication.auth).to.deep.equal({ username: 'u', password: REDACTED })
      expect(out.replication.peers[0]).to.deep.equal({ host: 'h', token: REDACTED })
      expect(out.dbEngine.url).to.equal(`mongodb://user:${REDACTED}@db.local:27017/cms`)
      expect(out.title).to.equal('Site')
    })

    it('restores the stored value where the placeholder came back, and edits made around it survive', () => {
      const current = { auth: { secret: 'a-secret' }, dbEngine: { url: 'mongodb://user:pw@db.local/cms' }, title: 'Old' }
      const edited = redactSecrets(current)
      edited.title = 'New'
      edited.dbEngine.url = edited.dbEngine.url.replace('db.local', 'db2.local')
      const restored = restoreSecrets(edited, current)
      expect(restored).to.deep.equal({ auth: { secret: 'a-secret' }, dbEngine: { url: 'mongodb://user:pw@db2.local/cms' }, title: 'New' })
    })

    it('drops a placeholder that has no stored value behind it', () => {
      expect(restoreSecrets({ auth: { secret: REDACTED }, keep: 1 }, {})).to.deep.equal({ auth: {}, keep: 1 })
    })

    it('keeps the plugin visible to the interface but not its settings', () => {
      const out = publicConfig({
        import: { oauth: { keyFile: '/etc/key.json' } },
        importFromRemote: { remote: { password: 'p' } },
        sync: { disablePlugin: false, resources: [{ name: 'a' }], token: 't' },
        syslog: { method: 'command', command: 'tail -f /var/log/x' },
        wsRecordUpdates: true
      })
      expect(out).to.deep.equal({
        import: true,
        importFromRemote: true,
        sync: { disablePlugin: false, resources: [{ name: 'a' }] },
        syslog: { method: 'command' },
        wsRecordUpdates: true
      })
    })
  })
})
