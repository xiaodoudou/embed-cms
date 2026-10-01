const request = require('supertest')
const { expect } = require('chai')
const sendError = require('../../lib/plugins/rest/sendError')
const { startApp, ADMIN } = require('../helpers/app')

describe('REST error responses (unit)', () => {
  let app

  before(async () => {
    app = await startApp()
  })
  after(async () => {
    await app.close()
  })

  const failWith = (error) => {
    const api = app.cms.api()('publicData')
    api.before('create', (context) => context.error(error))
  }

  it('answers with the http status and message of a known error', async () => {
    const res = await request(app.url).get('/api/articles/doesnotexist/attachments/x').auth(...ADMIN).timeout({ response: 3000 })
    expect(res.status).to.be.oneOf([404, 500])
    expect(res.body).to.have.property('message')
  })

  it('does not hang when an error carries a code that is not an http status (e.g. a database error code)', async () => {
    failWith({ code: 11000, message: 'E11000 duplicate key error' })
    const res = await request(app.url).post('/api/publicData').auth(...ADMIN).send({ message: 'x' }).timeout({ response: 3000 })
    expect(res.status).to.equal(500)
    expect(res.body).to.include({ code: 500 })
  })

  it('does not leak the message of an unexpected Error instance', async () => {
    const other = await startApp()
    try {
      other.cms.api()('publicData').before('create', (context) => context.error(new Error('connection string mongodb://user:secret@db/prod')))
      const res = await request(other.url).post('/api/publicData').auth(...ADMIN).send({ message: 'x' }).timeout({ response: 3000 })
      expect(res.status).to.equal(500)
      expect(JSON.stringify(res.body)).to.not.include('secret')
      expect(res.body).to.deep.equal({ code: 500, message: 'Internal Server Error' })
    } finally {
      await other.close()
    }
  })

  it('keeps the status and message of the errors the CMS itself raises', async () => {
    const other = await startApp()
    try {
      await other.cms.api()('cities').create({ key: 'dup', name: { en: 'x' } })
      const res = await request(other.url).post('/api/cities').auth(...ADMIN).send({ key: 'dup', name: { en: 'y' } })
      expect(res.status).to.equal(400)
      expect(res.body.message).to.match(/duplicated/)
    } finally {
      await other.close()
    }
  })
})

describe('sendError (unit)', () => {
  const fakeRes = (headersSent = false) => {
    const res = { headersSent, statusCode: null, body: null, ended: false }
    res.status = (code) => { res.statusCode = code; return res }
    res.json = (body) => { res.body = body; return res }
    res.end = () => { res.ended = true; return res }
    return res
  }

  describe('statusFor', () => {
    it('uses a code or status that is a real error status', () => {
      expect(sendError.statusFor({ code: 404 })).to.equal(404)
      expect(sendError.statusFor({ status: 403 })).to.equal(403)
      expect(sendError.statusFor({ code: 599 })).to.equal(599)
    })
    it('falls back to 500 for anything else', () => {
      for (const error of [undefined, null, 'text', {}, { code: 200 }, { code: 399 }, { code: 600 }, { code: 11000 }, { code: 'ENOENT' }, { code: 404.5 }, new Error('x')]) {
        expect(sendError.statusFor(error), JSON.stringify(error)).to.equal(500)
      }
    })
    it('prefers code over status', () => {
      expect(sendError.statusFor({ code: 400, status: 500 })).to.equal(400)
      expect(sendError.statusFor({ code: 11000, status: 409 })).to.equal(409)
    })
  })

  it('answers a CMS error with its status and message', () => {
    const res = fakeRes()
    sendError(res, { code: 404, message: 'not here' })
    expect([res.statusCode, res.body]).to.deep.equal([404, { code: 404, message: 'not here' }])
  })
  it('answers a CMS error without a message with the generic one', () => {
    const res = fakeRes()
    sendError(res, { code: 400 })
    expect(res.body).to.deep.equal({ code: 400, message: 'Internal Server Error' })
  })
  it('hides the message of an Error instance behind a generic 500', () => {
    const res = fakeRes()
    sendError(res, new Error('secret path C:/x'))
    expect([res.statusCode, res.body]).to.deep.equal([500, { code: 500, message: 'Internal Server Error' }])
  })
  it('keeps the message of an Error that explicitly carries a client error status', () => {
    const res = fakeRes()
    sendError(res, Object.assign(new Error('bad input'), { status: 400 }))
    expect([res.statusCode, res.body]).to.deep.equal([400, { code: 400, message: 'bad input' }])
  })
  it('handles strings, null and undefined', () => {
    for (const error of ['boom', null, undefined]) {
      const res = fakeRes()
      sendError(res, error)
      expect(res.statusCode).to.equal(500)
    }
  })
  it('just ends the response when headers were already sent', () => {
    const res = fakeRes(true)
    sendError(res, { code: 400, message: 'late' })
    expect(res.ended).to.equal(true)
    expect(res.statusCode).to.equal(null)
  })
})
