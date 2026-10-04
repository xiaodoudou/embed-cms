const fs = require('fs')
const path = require('path')
const request = require('supertest')
const sharp = require('sharp')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

// The crop tool of the admin stores a recipe with the image (`cropOptions`); the API cuts the image as the recipe says, keeps the
// cut next to the original, and says where smart cropping would put a crop.

const image = path.join(__dirname, '..', 'fixtures', 'man.jpg')

const binary = (res, callback) => {
  const chunks = []
  res.on('data', c => chunks.push(c))
  res.on('end', () => callback(null, Buffer.concat(chunks)))
}

describe('REST cropped images (unit)', () => {
  let app, articleId, aid, original

  before(async () => {
    app = await startApp({ anonymousRead: ['publicData'] })
    articleId = (await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'pic' })).body._id
    original = await sharp(image).metadata()
  })
  after(async () => {
    await app.close()
  })

  const folder = () => app.cms.resource('articles').file._dir
  const copies = () => fs.readdirSync(folder()).filter(file => file.startsWith(`${aid}-crop-`)).sort()
  const upload = async (cropOptions) => {
    const req = request(app.url).post(`/api/articles/${articleId}/attachments`).auth(...ADMIN)
    if (cropOptions) {
      req.field('cropOptions', JSON.stringify(cropOptions))
    }
    const res = await req.attach('image', image, { filename: 'man.jpg', contentType: 'image/jpeg' })
    expect(res.status).to.equal(200)
    return res.body._id
  }
  const cropped = (query = {}, id = aid) => request(app.url)
    .get(`/api/articles/${articleId}/attachments/${id}/cropped`)
    .auth(...ADMIN)
    .query(query)
    .buffer(true)
    .parse(binary)
  const size = async (res) => {
    const meta = await sharp(res.body).metadata()
    return [meta.width, meta.height]
  }

  describe('GET .../cropped', () => {
    it('sends the original when no crop is stored', async () => {
      aid = await upload()
      const res = await cropped()
      expect(res.status).to.equal(200)
      expect(res.body.length).to.equal(fs.statSync(image).size)
      expect(copies()).to.deep.equal([])
    })

    it('cuts the part kept', async () => {
      aid = await upload({ left: 10, top: 20, width: 100, height: 60 })
      const res = await cropped()
      expect(res.status).to.equal(200)
      expect(res.headers['content-type']).to.match(/image\/jpeg/)
      expect(await size(res)).to.deep.equal([100, 60])
    })

    it('still reads the coordinates of the first crop tool', async () => {
      aid = await upload({ data: { coordinates: { left: 0, top: 0, width: 50, height: 40 } }, updated: true })
      expect(await size(await cropped())).to.deep.equal([50, 40])
    })

    it('turns and flips before it cuts, and sizes and shapes the result', async () => {
      aid = await upload({ rotate: 90, flipX: true, left: 0, top: 0, width: 100, height: 100, output: { width: 40, height: 40, format: 'webp' }, shape: 'circle' })
      const res = await cropped()
      expect(res.headers['content-type']).to.match(/image\/webp/)
      expect(await size(res)).to.deep.equal([40, 40])
      const { data } = await sharp(res.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      expect(data[3]).to.equal(0)
    })

    it('turns the picture on its side with no crop at all', async () => {
      aid = await upload({ rotate: 90 })
      expect(await size(await cropped())).to.deep.equal([original.height, original.width])
    })

    it('gives the size asked for, whatever the crop', async () => {
      aid = await upload({ left: 0, top: 0, width: 200, height: 100 })
      expect(await size(await cropped({ resize: '50xauto' }))).to.deep.equal([50, 25])
      expect(await size(await cropped({ resize: 'autox10' }))).to.deep.equal([20, 10])
      // an invalid size is ignored
      expect(await size(await cropped({ resize: 'big' }))).to.deep.equal([200, 100])
    })

    it('keeps each cut next to the original, under a name of the recipe and the size, and serves it again', async () => {
      aid = await upload({ left: 0, top: 0, width: 80, height: 80 })
      const first = await cropped()
      expect(copies()).to.have.length(1)
      expect(copies()[0]).to.match(new RegExp(`^${aid}-crop-[0-9a-f]{16}$`))
      const second = await cropped()
      expect(second.body.equals(first.body)).to.equal(true)
      expect(second.headers['content-type']).to.equal(first.headers['content-type'])
      await cropped({ resize: '40x40' })
      expect(copies()).to.have.length(2)
      // what is kept is the cut itself
      expect(fs.readFileSync(path.join(folder(), copies()[0])).length).to.be.greaterThan(0)
    })

    it('forgets the cuts when the crop changes, and cuts the new one', async () => {
      aid = await upload({ left: 0, top: 0, width: 80, height: 80 })
      await cropped()
      expect(copies()).to.have.length(1)
      const update = await request(app.url).put(`/api/articles/${articleId}/attachments/${aid}`).auth(...ADMIN).send({ cropOptions: { left: 0, top: 0, width: 30, height: 20 } })
      expect(update.status).to.equal(200)
      expect(copies()).to.deep.equal([])
      expect(await size(await cropped())).to.deep.equal([30, 20])
    })

    it('forgets the cuts when the attachment is removed', async () => {
      aid = await upload({ left: 0, top: 0, width: 80, height: 80 })
      await cropped()
      await request(app.url).delete(`/api/articles/${articleId}/attachments/${aid}`).auth(...ADMIN)
      expect(copies()).to.deep.equal([])
    })

    it('keeps a crop that hangs over the picture inside it', async () => {
      aid = await upload({ left: original.width - 10, top: original.height - 10, width: 500, height: 500 })
      const res = await cropped()
      expect(res.status).to.equal(200)
      expect(await size(res)).to.deep.equal([10, 10])
    })

    it('sends a file that is not a picture as it is', async () => {
      const res = await request(app.url).post(`/api/articles/${articleId}/attachments`).auth(...ADMIN)
        .field('cropOptions', JSON.stringify({ left: 0, top: 0, width: 5, height: 5 }))
        .attach('file', 'package.json', { contentType: 'application/json' })
      const copy = await cropped({}, res.body._id)
      expect(copy.status).to.equal(200)
      expect(copy.body.length).to.equal(fs.statSync('package.json').size)
    })

    it('is a record link of the attachment: the record lists a crop url', async () => {
      aid = await upload({ left: 0, top: 0, width: 80, height: 80 })
      const record = await request(app.url).get(`/api/articles/${articleId}`).auth(...ADMIN)
      const stored = JSON.stringify(record.body)
      expect(stored).to.contain(`/api/articles/${articleId}/attachments/${aid}/cropped`)
    })

    it('answers 401 without credentials and an error for an unknown attachment', async () => {
      aid = await upload({ left: 0, top: 0, width: 80, height: 80 })
      expect((await request(app.url).get(`/api/articles/${articleId}/attachments/${aid}/cropped`)).status).to.equal(401)
      expect((await cropped({}, 'nothing')).status).to.be.at.least(400)
    })
  })

  describe('GET .../crop-suggestion', () => {
    const suggest = (query, id) => request(app.url).get(`/api/articles/${articleId}/attachments/${id || aid}/crop-suggestion`).auth(...ADMIN).query(query)

    before(async () => { aid = await upload() })

    it('says where smart cropping would put a crop of that shape', async () => {
      const res = await suggest({ aspect: '1' })
      expect(res.status).to.equal(200)
      const side = Math.min(original.width, original.height)
      expect(res.body).to.include({ width: side, height: side })
      expect(res.body.left).to.be.within(0, original.width - side)
    })

    it('takes the ratio as a number or as W:H', async () => {
      const wide = await suggest({ aspect: '2' })
      const ratio = await suggest({ aspect: '2:1' })
      expect(ratio.body).to.deep.equal(wide.body)
      expect(wide.body.width / wide.body.height).to.be.closeTo(2, 0.02)
    })

    it('answers in pixels of the picture once it is turned', async () => {
      const res = await suggest({ aspect: '1', rotate: 90 })
      expect(res.status).to.equal(200)
      expect(res.body.left + res.body.width).to.be.at.most(original.height)
      expect(res.body.top + res.body.height).to.be.at.most(original.width)
    })

    it('refuses a ratio that is not one', async () => {
      for (const aspect of [undefined, '', 'wide', '0', '-1', '1:0']) {
        const res = await suggest({ aspect })
        expect(res.status, String(aspect)).to.equal(400)
      }
    })

    it('refuses a file that is not a picture, and answers an error for an unknown attachment', async () => {
      const res = await request(app.url).post(`/api/articles/${articleId}/attachments`).auth(...ADMIN).attach('file', 'package.json', { contentType: 'application/json' })
      expect((await suggest({ aspect: '1' }, res.body._id)).status).to.equal(400)
      expect((await suggest({ aspect: '1' }, 'nothing')).status).to.be.at.least(400)
    })

    it('answers 401 without credentials', async () => {
      expect((await request(app.url).get(`/api/articles/${articleId}/attachments/${aid}/crop-suggestion`).query({ aspect: '1' })).status).to.equal(401)
    })
  })

  describe('POST .../attachments/crop-suggestion (a picture that is not stored yet)', () => {
    const post = (query = {}, name = 'image') => request(app.url).post('/api/articles/attachments/crop-suggestion').auth(...ADMIN).query(query).attach(name, image, { contentType: 'image/jpeg' })

    it('says the same for the picture it is sent', async () => {
      aid = await upload()
      const stored = await request(app.url).get(`/api/articles/${articleId}/attachments/${aid}/crop-suggestion`).auth(...ADMIN).query({ aspect: '16:9' })
      const sent = await post({ aspect: '16:9' })
      expect(sent.status).to.equal(200)
      expect(sent.body).to.deep.equal(stored.body)
    })

    it('takes the turn from the query', async () => {
      const res = await post({ aspect: '1', rotate: '90', flipX: 'true' })
      expect(res.status).to.equal(200)
      expect(res.body.width).to.equal(res.body.height)
    })

    it('refuses a request with no picture or no ratio', async () => {
      expect((await request(app.url).post('/api/articles/attachments/crop-suggestion').auth(...ADMIN).query({ aspect: '1' })).status).to.equal(400)
      expect((await post({})).status).to.equal(400)
    })

    it('refuses what is not a picture', async () => {
      const res = await request(app.url).post('/api/articles/attachments/crop-suggestion').auth(...ADMIN).query({ aspect: '1' }).attach('image', Buffer.from('not a picture'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      expect(res.status).to.be.at.least(400)
    })

    it('answers 401 without credentials', async () => {
      // (no body: the server answers before it reads one, and a body written after that is a broken pipe)
      expect((await request(app.url).post('/api/articles/attachments/crop-suggestion').query({ aspect: '1' })).status).to.equal(401)
    })
  })
})
