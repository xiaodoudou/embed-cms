const request = require('supertest')
const { expect } = require('chai')
const sanitizeQuery = require('../../lib/util/sanitizeQuery')
const { startApp, hardened, createUser } = require('../helpers/app')

// patterns known to backtrack catastrophically (nested quantifiers, overlapping alternatives, repeated groups)
const EVIL = [
  '^(a+)+$',
  '(a+)+$',
  '^(a*)*$',
  '(a|aa)+$',
  '(a|a?)+$',
  '(x+x+)+y',
  '^(([a-z])+.)+[A-Z]([a-z])+$',
  '(.*a){20}',
  '(a+){10}',
  '^(\\w+\\s?)*$',
  '(a+)\\1',
  '.*.*.*.*.*!',
  '(?:a+)+b'
]
const SAFE = ['^Al', 'foo.*bar', '^[a-z0-9-]+$', '\\d{4}-\\d{2}-\\d{2}', '(foo|bar)$', 'a.*b.*c', '^(?:https?)://', 'hello world']

describe('catastrophic regular expressions (security)', () => {
  describe('sanitizeQuery with safeRegex', () => {
    for (const pattern of EVIL) {
      it(`rejects ${pattern}`, () => {
        expect(() => sanitizeQuery({ title: { $regex: pattern } }, { safeRegex: true })).to.throw(/regular expression/i)
      })
    }
    for (const pattern of SAFE) {
      it(`accepts ${pattern}`, () => {
        expect(() => sanitizeQuery({ title: { $regex: pattern } }, { safeRegex: true })).to.not.throw()
      })
    }

    it('checks patterns nested in $and, $or, $not and $elemMatch', () => {
      const evil = { $regex: '^(a+)+$' }
      for (const query of [{ $and: [{ title: evil }] }, { $or: [{ x: 1 }, { title: evil }] }, { title: { $not: evil } }, { list: { $elemMatch: { title: evil } } }]) {
        expect(() => sanitizeQuery(query, { safeRegex: true }), JSON.stringify(query)).to.throw(/regular expression/i)
      }
    })

    it('rejects a pattern that is not valid', () => {
      expect(() => sanitizeQuery({ title: { $regex: '(' } }, { safeRegex: true })).to.throw(/regular expression/i)
    })

    it('rejects $options flags other than i, m, s', () => {
      expect(() => sanitizeQuery({ title: { $regex: 'a', $options: 'g' } }, { safeRegex: true })).to.throw(/\$options/)
      expect(() => sanitizeQuery({ title: { $regex: 'a', $options: 'ims' } }, { safeRegex: true })).to.not.throw()
    })

    it('leaves patterns alone without the option (existing behaviour)', () => {
      expect(() => sanitizeQuery({ title: { $regex: '^(a+)+$' } })).to.not.throw()
    })
  })

  describe('over REST', () => {
    it('answers 400 at once instead of blocking the server', async () => {
      const app = await startApp(hardened())
      try {
        const admin = await createUser(app)
        await request(app.url).post('/api/articles').auth(admin.username, admin.password).send({ title: `${'a'.repeat(30)}!` })
        const started = Date.now()
        const res = await request(app.url).get('/api/articles').auth(admin.username, admin.password)
          .query({ query: JSON.stringify({ title: { $regex: '^(a+)+$' } }) })
        expect(res.status).to.equal(400)
        expect(Date.now() - started, 'the request must not evaluate the pattern').to.be.below(2000)
        const ok = await request(app.url).get('/api/articles').auth(admin.username, admin.password)
          .query({ query: JSON.stringify({ title: { $regex: '^a+!$' } }) })
        expect(ok.status).to.equal(200)
        expect(ok.body).to.have.length(1)
      } finally {
        await app.close()
      }
    })

    it('can be switched off with security.safeRegex', async () => {
      const app = await startApp(hardened({ security: { safeRegex: false } }))
      try {
        const admin = await createUser(app)
        await request(app.url).post('/api/articles').auth(admin.username, admin.password).send({ title: 'plain' })
        const res = await request(app.url).get('/api/articles').auth(admin.username, admin.password)
          .query({ query: JSON.stringify({ title: { $regex: '(plain)+' } }) })
        expect(res.status).to.equal(200)
      } finally {
        await app.close()
      }
    })
  })
})
