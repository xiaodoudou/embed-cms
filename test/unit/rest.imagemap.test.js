const fs = require('fs')
const path = require('path')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

// The areas of an image map are kept with the picture (its `imageMap`): sent with the file or in an update, checked on the way in,
// replaced as a whole by an update, and given back with the record.

const image = path.join(__dirname, '..', 'fixtures', 'man.jpg')
const KITCHEN = { id: 'kitchen', shape: 'rect', coords: [0.1, 0.1, 0.4, 0.5], title: 'Kitchen', href: '/kitchen' }
const LAMP = { id: 'lamp', shape: 'circle', coords: [0.7, 0.3, 0.1], title: 'Lamp', ref: { resource: 'articles', id: 'abc' }, target: '_blank' }
const DOOR = { id: 'door', shape: 'poly', coords: [0.6, 0.6, 0.9, 0.6, 0.75, 0.95], title: 'Door', href: 'https://example.com/door' }
const withDefaults = (area) => ({ target: '_self', ...area })

describe('REST image maps (unit)', () => {
  let app, articleId

  before(async () => {
    app = await startApp({ anonymousRead: ['publicData'] })
    articleId = (await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'plan' })).body._id
  })
  after(async () => {
    await app.close()
  })

  const upload = (imageMap) => {
    const req = request(app.url).post(`/api/articles/${articleId}/attachments`).auth(...ADMIN)
    if (imageMap !== undefined) {
      req.field('imageMap', typeof imageMap === 'string' ? imageMap : JSON.stringify(imageMap))
    }
    return req.attach('image', image, { filename: 'plan.jpg', contentType: 'image/jpeg' })
  }
  const put = (aid, body) => request(app.url).put(`/api/articles/${articleId}/attachments/${aid}`).auth(...ADMIN).send(body)
  const stored = async (aid) => {
    const record = await request(app.url).get(`/api/articles/${articleId}`).auth(...ADMIN)
    const found = [].concat(...Object.values(record.body).filter(Array.isArray)).find(item => item && item._id === aid)
    return found
  }
  const count = async () => (await request(app.url).get(`/api/articles/${articleId}`).auth(...ADMIN)).body.image.length

  describe('sent with the file', () => {
    it('is kept with the attachment and comes back with the record', async () => {
      const res = await upload({ areas: [KITCHEN, LAMP, DOOR], updated: true })
      expect(res.status).to.equal(200)
      expect(res.body.imageMap.areas).to.deep.equal([KITCHEN, LAMP, DOOR].map(withDefaults))
      const found = await stored(res.body._id)
      expect(found.imageMap.areas.map(area => area.id)).to.deep.equal(['kitchen', 'lamp', 'door'])
      expect(found.imageMap).to.not.have.property('updated')
    })

    it('is checked: a link that runs a script is refused, and the file is not kept', async () => {
      const before = await count()
      const res = await upload({ areas: [{ ...KITCHEN, href: 'javascript:alert(1)' }] })
      expect(res.status).to.equal(400)
      expect(res.body.message).to.match(/link starts with/)
      expect(await count()).to.equal(before)
    })

    it('is refused when it is not json, or not a map', async () => {
      const before = await count()
      expect((await upload('{not json')).status).to.equal(400)
      expect((await upload({ areas: 'all' })).status).to.equal(400)
      expect((await upload({ areas: [{ shape: 'star', coords: [0, 0, 1, 1] }] })).status).to.equal(400)
      expect(await count()).to.equal(before)
    })

    it('gives an id to an area that has none', async () => {
      const { id: _id, ...withoutId } = KITCHEN
      const res = await upload({ areas: [withoutId] })
      expect(res.body.imageMap.areas[0].id).to.match(/^[0-9a-f]{8}$/)
    })

    it('is not there when none is sent', async () => {
      const res = await upload()
      expect(res.status).to.equal(200)
      expect(res.body).to.not.have.property('imageMap')
    })
  })

  describe('changed by an update', () => {
    let aid
    beforeEach(async () => {
      aid = (await upload({ areas: [KITCHEN, LAMP, DOOR] })).body._id
    })

    it('replaces the areas as a whole: one that is left out is gone, not merged back', async () => {
      const res = await put(aid, { imageMap: { areas: [LAMP] } })
      expect(res.status).to.equal(200)
      expect(res.body.imageMap.areas.map(area => area.id)).to.deep.equal(['lamp'])
      expect((await stored(aid)).imageMap.areas.map(area => area.id)).to.deep.equal(['lamp'])
    })

    it('keeps the order it is sent in, and the changes of an area', async () => {
      await put(aid, { imageMap: { areas: [DOOR, { ...KITCHEN, title: 'Big kitchen', coords: [0, 0, 0.5, 0.5] }] } })
      const { areas } = (await stored(aid)).imageMap
      expect(areas.map(area => area.id)).to.deep.equal(['door', 'kitchen'])
      expect(areas[1]).to.include({ title: 'Big kitchen' })
      expect(areas[1].coords).to.deep.equal([0, 0, 0.5, 0.5])
    })

    it('takes the map away with null, and with an empty map keeps no area', async () => {
      await put(aid, { imageMap: { areas: [] } })
      expect((await stored(aid)).imageMap).to.deep.equal({ areas: [] })
      await put(aid, { imageMap: { areas: [KITCHEN] } })
      const res = await put(aid, { imageMap: null })
      expect(res.status).to.equal(200)
      expect(await stored(aid)).to.not.have.property('imageMap')
    })

    it('leaves the other things of the attachment alone', async () => {
      await put(aid, { imageMap: { areas: [KITCHEN] }, order: 3 })
      const found = await stored(aid)
      expect(found).to.include({ order: 3, _filename: 'plan.jpg' })
      await put(aid, { order: 4 })
      expect((await stored(aid)).imageMap.areas).to.have.length(1)
    })

    it('is checked, and a refused update changes nothing', async () => {
      const res = await put(aid, { imageMap: { areas: [{ ...KITCHEN, href: 'data:text/html,<script>1</script>' }] } })
      expect(res.status).to.equal(400)
      expect((await stored(aid)).imageMap.areas.map(area => area.id)).to.deep.equal(['kitchen', 'lamp', 'door'])
    })

    it('can be sent for several attachments at once', async () => {
      const other = (await upload()).body._id
      const res = await request(app.url).put(`/api/articles/${articleId}/attachments`).auth(...ADMIN).send([{ _id: aid, imageMap: { areas: [DOOR] } }, { _id: other, imageMap: { areas: [LAMP] } }])
      expect(res.status).to.equal(200)
      expect((await stored(aid)).imageMap.areas[0].id).to.equal('door')
      expect((await stored(other)).imageMap.areas[0].id).to.equal('lamp')
    })

    it('needs the rights to change an attachment', async () => {
      expect((await request(app.url).put(`/api/articles/${articleId}/attachments/${aid}`).send({ imageMap: { areas: [] } })).status).to.equal(401)
    })
  })

  describe('from code (the way a sync or an import writes)', () => {
    const api = () => app.cms.api()('articles')

    it('is checked before anything is written', async () => {
      const files = () => fs.readdirSync(app.cms.resource('articles').file._dir).length
      const before = files()
      let error
      try {
        await api().createAttachment(articleId, { name: 'image', stream: fs.createReadStream(image), fields: { _filename: 'a.jpg' }, imageMap: { areas: [{ ...KITCHEN, href: 'javascript:x' }] } })
      } catch (thrown) {
        error = thrown
      }
      expect(error, 'refused').to.be.an('object')
      expect(files()).to.equal(before)
    })

    it('keeps a map given with the file, and one given to an update', async () => {
      const created = await api().createAttachment(articleId, { name: 'image', stream: fs.createReadStream(image), fields: { _filename: 'a.jpg' }, imageMap: { areas: [KITCHEN] } })
      expect(created.imageMap.areas).to.deep.equal([withDefaults(KITCHEN)])
      const updated = await api().updateAttachment(articleId, created._id, { imageMap: { areas: [LAMP, DOOR] } })
      expect(updated.imageMap.areas.map(area => area.id)).to.deep.equal(['lamp', 'door'])
    })

    it('refuses a bad map in an update', async () => {
      const created = await api().createAttachment(articleId, { name: 'image', stream: fs.createReadStream(image), fields: { _filename: 'a.jpg' }, imageMap: { areas: [KITCHEN] } })
      let error
      try {
        await api().updateAttachment(articleId, created._id, { imageMap: { areas: [{ shape: 'rect', coords: [0, 0, 0, 0] }] } })
      } catch (thrown) {
        error = thrown
      }
      expect(error, 'refused').to.be.an('object')
      expect((await stored(created._id)).imageMap.areas.map(area => area.id)).to.deep.equal(['kitchen'])
    })
  })
})

describe('REST image maps with the safe attachments setting (unit)', () => {
  let app, articleId, aid
  before(async () => {
    app = await startApp({ security: { safeAttachments: true } })
    articleId = (await request(app.url).post('/api/articles').auth(...ADMIN).send({ title: 'safe' })).body._id
    aid = (await request(app.url).post(`/api/articles/${articleId}/attachments`).auth(...ADMIN).attach('image', image, { filename: 'plan.jpg', contentType: 'image/jpeg' })).body._id
  })
  after(async () => {
    await app.close()
  })

  it('still lets the map of an attachment be changed, like its crop and its order, and checks it', async () => {
    const ok = await request(app.url).put(`/api/articles/${articleId}/attachments/${aid}`).auth(...ADMIN).send({ imageMap: { areas: [KITCHEN] }, _contentType: 'text/html' })
    expect(ok.status).to.equal(200)
    expect(ok.body.imageMap.areas).to.have.length(1)
    expect(ok.body._contentType).to.equal('image/jpeg')
    const bad = await request(app.url).put(`/api/articles/${articleId}/attachments/${aid}`).auth(...ADMIN).send({ imageMap: { areas: [{ ...KITCHEN, href: 'javascript:1' }] } })
    expect(bad.status).to.equal(400)
  })
})
