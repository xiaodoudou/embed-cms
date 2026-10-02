const fs = require('fs')
const os = require('os')
const path = require('path')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, hardened, createUser } = require('../helpers/app')

const IMAGE = path.join(__dirname, '..', 'fixtures', 'man.jpg')
const HTML = Buffer.from('<html><script>alert(document.domain)</script></html>')

const UPLOAD_DIR = path.join(os.tmpdir(), 'embed-cms', 'uploads')
// number of files in the folder of the uploads (files of other processes and tests in the temp folder do not count),
// once the cleanup that follows the response has run
const uploadsLeft = async (expected) => {
  const count = () => fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR).length : 0
  for (let waited = 0; count() !== expected && waited < 3000; waited += 50) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return count()
}

describe('uploads and attachments (security)', () => {
  let app, admin, auth, articleId
  const upload = (buffer, filename, fields = {}) => {
    let req = request(app.url).post(`/api/articles/${articleId}/attachments`).auth(...auth)
    for (const [key, value] of Object.entries(fields)) {
      req = req.field(key, value)
    }
    return req.attach('image', buffer, { filename })
  }

  before(async () => {
    app = await startApp(hardened())
    admin = await createUser(app)
    auth = [admin.username, admin.password]
    articleId = (await request(app.url).post('/api/articles').auth(...auth).send({ title: 'uploads' })).body._id
  })
  after(async () => { await app.close() })

  describe('temporary files', () => {
    it('are removed once the upload was handled', async () => {
      const before = await uploadsLeft(0)
      const res = await upload(fs.readFileSync(IMAGE), 'man.jpg', { _filename: 'man.jpg' })
      expect(res.status).to.equal(200)
      expect(await uploadsLeft(before)).to.equal(before)
    })

    it('are removed when the upload is refused', async () => {
      const before = await uploadsLeft(0)
      const res = await request(app.url).post('/api/articles/doesnotexist/attachments').auth(...auth).attach('image', fs.readFileSync(IMAGE), 'man.jpg')
      expect(res.status).to.not.equal(200)
      expect(await uploadsLeft(before)).to.equal(before)
    })
  })

  describe('limits', () => {
    it('refuse a file above security.limits.upload.fileSize with 413', async () => {
      const limited = await startApp(hardened({ security: { limits: { upload: { fileSize: 1000 } } } }))
      try {
        const user = await createUser(limited)
        const id = (await request(limited.url).post('/api/articles').auth(user.username, user.password).send({ title: 'x' })).body._id
        const before = await uploadsLeft(0)
        const res = await request(limited.url).post(`/api/articles/${id}/attachments`).auth(user.username, user.password)
          .attach('image', Buffer.alloc(5000, 1), 'big.bin')
        expect(res.status).to.equal(413)
        expect(res.type).to.equal('application/json')
        expect(await uploadsLeft(before), 'the partial file is removed').to.equal(before)
      } finally {
        await limited.close()
      }
    })

    it('refuse more files than security.limits.upload.files', async () => {
      const limited = await startApp(hardened({ security: { limits: { upload: { files: 1 } } } }))
      try {
        const user = await createUser(limited)
        const id = (await request(limited.url).post('/api/articles').auth(user.username, user.password).send({ title: 'x' })).body._id
        const res = await request(limited.url).post(`/api/articles/${id}/attachments`).auth(user.username, user.password)
          .attach('image', Buffer.from('a'), 'a.txt')
          .attach('image', Buffer.from('b'), 'b.txt')
        expect(res.status).to.equal(413)
      } finally {
        await limited.close()
      }
    })

  })

  describe('file names', () => {
    it('keep only the last path segment and no control characters', async () => {
      const res = await upload(fs.readFileSync(IMAGE), 'man.jpg', { _filename: '..\\..\\etc/../evil\u0000\r\n.jpg' })
      expect(res.status).to.equal(200)
      expect([...res.body._filename].filter(ch => ch === '/' || ch === '\\' || ch.charCodeAt(0) < 32)).to.deep.equal([])
      expect(res.body._filename).to.match(/evil.*\.jpg$/)
    })

    it('apply to the name of the uploaded file when there is no _filename field (#21)', async () => {
      const res = await upload(fs.readFileSync(IMAGE), `${'b'.repeat(400)}.jpg`)
      expect(res.status).to.equal(200)
      expect(res.body._filename.length).to.be.at.most(255)
      expect(res.body._filename).to.match(/^b+\.jpg$/)
    })

    it('are capped in length', async () => {
      const res = await upload(fs.readFileSync(IMAGE), 'man.jpg', { _filename: `${'a'.repeat(400)}.jpg` })
      expect(res.body._filename.length).to.be.at.most(255)
      expect(res.body._filename).to.match(/\.jpg$/)
    })
  })

  describe('content types', () => {
    it('are taken from the content of the file when it is recognisable', async () => {
      const res = await upload(fs.readFileSync(IMAGE), 'photo.html', { _filename: 'photo.html' })
      expect(res.status).to.equal(200)
      expect(res.body._contentType).to.equal('image/jpeg')
    })

    it('do not claim an image type for a file that is not an image', async () => {
      const res = await upload(HTML, 'holiday.png', { _filename: 'holiday.png' })
      expect(res.status).to.equal(200)
      expect(res.body._contentType).to.equal('application/octet-stream')
    })
  })

  describe('serving', () => {
    const attachmentUrl = (record) => `/api/articles/${articleId}/attachments/${record._id}`

    it('sends a script bearing document as a download with a sandbox policy', async () => {
      const record = (await upload(HTML, 'page.html', { _filename: 'page.html' })).body
      expect(record._contentType).to.equal('text/html')
      const res = await request(app.url).get(attachmentUrl(record)).auth(...auth)
      expect(res.status).to.equal(200)
      expect(res.headers['content-disposition']).to.match(/^attachment/)
      expect(res.headers['content-security-policy']).to.include('sandbox')
      expect(res.headers['x-content-type-options']).to.equal('nosniff')
    })

    it('does the same for svg, xml and javascript', async () => {
      for (const [name, body] of [['pic.svg', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], ['data.xml', '<a/>'], ['x.js', 'alert(1)']]) {
        const record = (await upload(Buffer.from(body), name, { _filename: name })).body
        const res = await request(app.url).get(attachmentUrl(record)).auth(...auth)
        expect(res.headers['content-disposition'], name).to.match(/^attachment/)
      }
    })

    it('keeps images inline', async () => {
      const record = (await upload(fs.readFileSync(IMAGE), 'man.jpg', { _filename: 'man.jpg' })).body
      const res = await request(app.url).get(attachmentUrl(record)).auth(...auth)
      expect(res.status).to.equal(200)
      expect(res.headers['content-type']).to.match(/^image\/jpeg/)
      expect(res.headers['content-disposition']).to.equal(undefined)
      expect(res.headers['x-content-type-options']).to.equal('nosniff')
    })

    it('answers the same for the download by id', async () => {
      const record = (await upload(HTML, 'page.html', { _filename: 'page.html' })).body
      const res = await request(app.url).get(`/api/articles/file/${record._id}`).auth(...auth)
      expect(res.status).to.equal(200)
      expect(res.headers['content-disposition']).to.match(/^attachment/)
    })

  })

  describe('attachment metadata', () => {
    it('cannot be rewritten through PUT: the content type, size, checksum and id stay', async () => {
      const record = (await upload(fs.readFileSync(IMAGE), 'man.jpg', { _filename: 'man.jpg' })).body
      const res = await request(app.url).put(`/api/articles/${articleId}/attachments/${record._id}`).auth(...auth)
        .send({ _contentType: 'text/html', _size: 1, _md5sum: 'x', _id: 'other', order: 3 })
      expect(res.status).to.equal(200)
      expect(res.body._contentType).to.equal('image/jpeg')
      expect(res.body._size).to.equal(record._size)
      expect(res.body._md5sum).to.equal(record._md5sum)
      expect(res.body._id).to.equal(record._id)
      expect(res.body.order).to.equal(3)
    })

  })

  describe('malformed input', () => {
    it('answers 400 for cropOptions that are not json', async () => {
      const res = await upload(fs.readFileSync(IMAGE), 'man.jpg', { _filename: 'man.jpg', cropOptions: '{not json' })
      expect(res.status).to.equal(400)
    })
  })
})
