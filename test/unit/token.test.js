const { expect } = require('chai')
const { tokenOptions, generateToken, fillTokens } = require('../../lib/util/token')
const { startApp } = require('../helpers/app')

// the token field: a random value the server makes when a record is created without one
describe('token field (unit)', () => {
  describe('the options', () => {
    it('keeps the length between 8 and 128 random bytes, 32 by default, a short prefix, and base64url unless it says hex', () => {
      expect(tokenOptions({})).to.deep.equal({ length: 32, prefix: '', format: 'base64url' })
      expect(tokenOptions({ options: { length: 2 } }).length).to.equal(8)
      expect(tokenOptions({ options: { length: 1000 } }).length).to.equal(128)
      expect(tokenOptions({ options: { length: 'long' } }).length).to.equal(32)
      expect(tokenOptions({ options: { prefix: 'x'.repeat(40) } }).prefix).to.have.length(32)
      expect(tokenOptions({ options: { format: 'hex' } }).format).to.equal('hex')
      expect(tokenOptions({ options: { format: 'base32' } }).format).to.equal('base64url')
    })
  })

  describe('a token', () => {
    it('is the prefix, then the random bytes in the format of the field', () => {
      expect(generateToken({ options: { length: 16, format: 'hex', prefix: 'rpl_' } })).to.match(/^rpl_[0-9a-f]{32}$/)
      // 32 bytes are 43 characters of base64url, with no padding and no + or /
      expect(generateToken({})).to.match(/^[A-Za-z0-9_-]{43}$/)
    })

    it('is new every time', () => {
      const field = { options: { length: 16 } }
      expect(generateToken(field)).to.not.equal(generateToken(field))
    })
  })

  describe('a record about to be created', () => {
    const schema = [
      { field: 'title', input: 'string' },
      { field: 'key', input: 'token', options: { prefix: 'k_' } },
      { field: 'access.secret', input: 'token', options: { format: 'hex', length: 8 } }
    ]

    it('gets a token in every token field it leaves empty, nested ones too', () => {
      const record = fillTokens(schema, { title: 'A', key: '' })
      expect(record.key).to.match(/^k_[A-Za-z0-9_-]{43}$/)
      expect(record.access.secret).to.match(/^[0-9a-f]{16}$/)
      expect(record.title).to.equal('A')
    })

    it('keeps a token it was given, and leaves a value per language alone', () => {
      const record = fillTokens(schema, { key: 'chosen', access: { secret: { enUS: 'one' } } })
      expect(record.key).to.equal('chosen')
      expect(record.access.secret).to.deep.equal({ enUS: 'one' })
    })
  })

  describe('a create', () => {
    let app
    before(async () => {
      app = await startApp({ disableJwtLogin: true })
      app.cms.resource('keys', { schema: [{ field: 'name', input: 'string' }, { field: 'token', input: 'token', localised: false, options: { prefix: 'key_' } }] })
    })
    after(() => app.close())

    it('gives the record a token when it has none, and keeps the one it sends', async () => {
      const api = app.cms.api()('keys')
      const made = await api.create({ name: 'first' })
      expect(made.token).to.match(/^key_[A-Za-z0-9_-]{43}$/)
      const given = await api.create({ name: 'second', token: 'key_mine' })
      expect(given.token).to.equal('key_mine')
      // an update does not make a new one
      const updated = await api.update(made._id, { name: 'renamed' })
      expect(updated.token).to.equal(made.token)
    })
  })
})
