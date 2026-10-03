const { Readable } = require('stream')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

// A file is stored under the name of its field at upload time (photo.enUS, doc). When the field changes afterwards (it becomes
// localised or stops being so, its maxCount is lowered), the files that no longer fit are still answered, under the field as it
// is now, with `dirty` saying why, so that the admin shows them as abnormal instead of hiding them.
describe('REST attachments: files that no longer fit their field (unit)', () => {
  let app, api

  const text = (content) => Readable.from([Buffer.from(content)])
  const upload = (id, name, filename) => api.createAttachment(id, { name, stream: text(`content of ${filename}`), contentType: 'text/plain', fields: { _filename: filename } })
  const read = async (id) => {
    const res = await request(app.url).get(`/api/media/${id}`).auth(...ADMIN)
    expect(res.status).to.equal(200)
    return res.body
  }

  before(async () => {
    app = await startApp({ resources: './test/fixtures/attachmentResources' })
    api = app.cms.api()('media')
  })
  after(() => app.close())

  it('answers the files under their field, with the url to download them, and no flag when they fit', async () => {
    const record = await api.create({ name: 'fits' })
    await upload(record._id, 'photo.enUS', 'en.png')
    await upload(record._id, 'photo.zhCN', 'zh.png')
    await upload(record._id, 'doc', 'notes.txt')
    const body = await read(record._id)
    expect(body).to.not.have.property('_attachments')
    expect(body.photo.enUS.map(file => file._filename)).to.deep.equal(['en.png'])
    expect(body.photo.zhCN.map(file => file._filename)).to.deep.equal(['zh.png'])
    expect(body.doc.map(file => file._filename)).to.deep.equal(['notes.txt'])
    expect(body.doc[0].url).to.equal(`/api/media/${record._id}/attachments/${body.doc[0]._id}`)
    expect(body.doc[0]).to.not.have.property('dirty')
    expect(body.photo.enUS[0]).to.not.have.property('dirty')
  })

  it('shows a file uploaded without a language, on a field that is now localised, under the first language as abnormal', async () => {
    const record = await api.create({ name: 'became localised' })
    await upload(record._id, 'photo', 'old.png')
    const body = await read(record._id)
    expect(body.photo.enUS).to.have.length(1)
    expect(body.photo.enUS[0]).to.include({ _filename: 'old.png', dirty: 'forced-localised' })
  })

  it('shows a file uploaded with a language, on a field that is no longer localised, under the field as abnormal', async () => {
    const record = await api.create({ name: 'became unlocalised' })
    await upload(record._id, 'doc.zhCN', 'old.txt')
    const body = await read(record._id)
    expect(body.doc).to.have.length(1)
    expect(body.doc[0]).to.include({ _filename: 'old.txt', dirty: 'forced-unlocalised' })
  })

  it('shows the files past the maxCount of the field as abnormal, and the ones within it as fine', async () => {
    const record = await api.create({ name: 'too many' })
    await upload(record._id, 'single', 'first.txt')
    await upload(record._id, 'single', 'second.txt')
    const body = await read(record._id)
    expect(body.single.map(file => [file._filename, file.dirty])).to.deep.equal([['first.txt', undefined], ['second.txt', 'max-count-overpassed']])
  })

  it('keeps a file of a field the resource no longer has, under its own name', async () => {
    const record = await api.create({ name: 'orphan' })
    await upload(record._id, 'gone', 'orphan.txt')
    const body = await read(record._id)
    expect(body.gone.map(file => file._filename)).to.deep.equal(['orphan.txt'])
  })

  it('flags the files of every record of a list the same way', async () => {
    const record = await api.create({ name: 'listed' })
    await upload(record._id, 'photo', 'old.png')
    const res = await request(app.url).get('/api/media').auth(...ADMIN).query({ query: JSON.stringify({ name: 'listed' }) })
    expect(res.status).to.equal(200)
    expect(res.body).to.have.length(1)
    expect(res.body[0].photo.enUS[0]).to.include({ dirty: 'forced-localised' })
  })
})
