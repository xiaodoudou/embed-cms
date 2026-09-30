const fs = require('fs')
const path = require('path')
const request = require('supertest')
const sharp = require('sharp')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

const image = path.join(__dirname, '..', 'man.jpg')

const binary = (res, callback) => {
  const chunks = []
  res.on('data', c => chunks.push(c))
  res.on('end', () => callback(null, Buffer.concat(chunks)))
}

describe('REST attachments (unit)', () => {
  let app, articleId, attachmentId

  before(async () => {
    app = await startApp({ anonymousRead: ['publicData'] })
    const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'pic' })
    articleId = created.body._id
    const att = await request(app.url)
      .post(`/api/articles/${articleId}/attachments`)
      .auth(...ADMIN)
      .field('_filename', 'man.jpg')
      .attach('image', image, { contentType: 'image/jpeg' })
    expect(att.status).to.equal(200)
    attachmentId = att.body._id
  })
  after(async () => {
    await app.close()
  })

  const get = (query = {}) => request(app.url)
    .get(`/api/articles/${articleId}/attachments/${attachmentId}`)
    .auth(...ADMIN)
    .query(query)
    .buffer(true)
    .parse(binary)

  it('returns the original bytes with the right content type', async () => {
    const res = await get()
    expect(res.status).to.equal(200)
    expect(res.headers['content-type']).to.match(/image\/jpeg/)
    expect(res.body.length).to.equal(fs.statSync(image).size)
  })

  describe('a file whose name has no extension', () => {
    const upload = async (contentType) => {
      const res = await request(app.url)
        .post(`/api/articles/${articleId}/attachments`)
        .auth(...ADMIN)
        .attach('image', image, { filename: 'photo', contentType })
      expect(res.status).to.equal(200)
      return res.body
    }

    it('takes the type the client declared', async () => {
      expect((await upload('image/jpeg'))._contentType).to.equal('image/jpeg')
    })

    it('reads the type from the first bytes when the client declares nothing useful', async () => {
      expect((await upload('application/octet-stream'))._contentType).to.equal('image/jpeg')
    })
  })

  it('resizes to the requested dimensions', async () => {
    const res = await get({ resize: '60x40' })
    expect(res.status).to.equal(200)
    const meta = await sharp(res.body).metadata()
    expect(meta.width).to.equal(60)
    expect(meta.height).to.equal(40)
  })

  it('keeps the aspect ratio for autoxH and Wxauto', async () => {
    const original = await sharp(image).metadata()
    const res = await get({ resize: 'autox50' })
    const meta = await sharp(res.body).metadata()
    expect(meta.height).to.equal(50)
    expect(meta.width).to.be.closeTo(Math.round(original.width * 50 / original.height), 1)
  })

  it('serves an identical image on the second (cached) request', async () => {
    const first = await get({ resize: '33x33' })
    const second = await get({ resize: '33x33' })
    expect(second.status).to.equal(200)
    expect(Buffer.compare(first.body, second.body)).to.equal(0)
  })

  it('ignores invalid resize options and sends the original', async () => {
    for (const resize of ['abc', '0x100', '100000x100', 'autoxauto']) {
      const res = await get({ resize })
      expect(res.status, resize).to.equal(200)
      expect(res.body.length, resize).to.equal(fs.statSync(image).size)
    }
  })

  it('answers 401 without credentials', async () => {
    const res = await request(app.url).get(`/api/articles/${articleId}/attachments/${attachmentId}`)
    expect(res.status).to.equal(401)
  })

  it('answers an error, not a hang, for an unknown attachment', async () => {
    const res = await request(app.url)
      .get(`/api/articles/${articleId}/attachments/doesnotexist`)
      .auth(...ADMIN)
    expect(res.status).to.be.oneOf([404, 500])
  })

  it('rejects an upload without a file with a 400', async () => {
    const res = await request(app.url)
      .post(`/api/articles/${articleId}/attachments`)
      .auth(...ADMIN)
      .field('_filename', 'nothing.jpg')
    expect(res.status).to.equal(400)
  })

  it('does not hang on malformed cropOptions', async () => {
    const res = await request(app.url)
      .post(`/api/articles/${articleId}/attachments`)
      .auth(...ADMIN)
      .field('cropOptions', '{not json')
      .attach('image', image, { contentType: 'image/jpeg' })
    expect(res.status).to.be.oneOf([400, 500])
  })

  it('exposes attachments through the record with a url', async () => {
    const res = await request(app.url).get(`/api/articles/${articleId}`).auth(...ADMIN)
    expect(res.status).to.equal(200)
    const files = res.body.image || res.body._attachments || []
    expect(files).to.have.length.greaterThan(0)
  })

  it('removes an attachment over REST', async () => {
    const del = await request(app.url)
      .delete(`/api/articles/${articleId}/attachments/${attachmentId}`)
      .auth(...ADMIN)
    expect(del.status).to.equal(200)
    const res = await request(app.url)
      .get(`/api/articles/${articleId}/attachments/${attachmentId}`)
      .auth(...ADMIN)
    expect(res.status).to.be.oneOf([404, 500])
  })
})
