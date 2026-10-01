const { expect } = require('chai')
const cookieNames = require('../../lib/util/cookieNames')
const csrfGuard = require('../../lib/util/csrf')

// Two CMS on the same host (other ports) share their cookies in a browser: each one names its own after its mid.
describe('cookieNames (unit)', () => {
  it('names the login and the session cookies after the mid of the server', () => {
    expect(cookieNames({ mid: 'dev00001' })).to.deep.equal({ jwt: 'embedCmsJwt-dev00001', session: 'embedCmsSid-dev00001' })
    expect(cookieNames({ mid: 'dev00002' }).jwt).to.not.equal(cookieNames({ mid: 'dev00001' }).jwt)
  })

  it('keeps only characters a cookie name allows', () => {
    expect(cookieNames({ mid: 'a b;c=d' }).jwt).to.equal('embedCmsJwt-abcd')
  })

  it('lets a configured session name win, and falls back to the plain names without a mid', () => {
    expect(cookieNames({ mid: 'dev00001', session: { name: 'my.sid' } }).session).to.equal('my.sid')
    expect(cookieNames({})).to.deep.equal({ jwt: 'embedCmsJwt', session: 'connect.sid' })
  })

  describe('and the cross-site check', () => {
    const names = cookieNames({ mid: 'dev00001' })
    const guard = csrfGuard({ csrf: 'origin', allowedOrigins: [] }, names)
    const passes = (cookie) => {
      let passed = false
      const res = { status: () => ({ json: () => {} }) }
      guard({ method: 'POST', path: '/api/articles', headers: { host: 'cms.local:9990', origin: 'https://evil.example', cookie } }, res, () => { passed = true })
      return passed
    }

    it('guards the cookies of this server', () => {
      expect(passes(`${names.jwt}=abc`)).to.equal(false)
      expect(passes(`a=1; ${names.session}=abc`)).to.equal(false)
    })

    it('has nothing to say about the cookies of another server', () => {
      expect(passes(`${cookieNames({ mid: 'dev00002' }).jwt}=abc`)).to.equal(true)
      expect(passes('')).to.equal(true)
    })
  })
})
