const fs = require('fs')
const path = require('path')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const IMAGE = path.join(__dirname, '..', 'man.jpg')

describe('cleanAttachment (unit)', () => {
  let app, articles, article, attachment, folder

  before(async () => {
    app = await startApp()
    articles = app.cms.api()('articles')
    article = await articles.create({ string: { enUS: 'with a file' } })
    attachment = await articles.createAttachment(article._id, {
      name: 'file',
      stream: fs.createReadStream(IMAGE),
      fields: { _filename: 'man.jpg' }
    })
    folder = app.cms.resource('articles').file._dir
  })
  after(async () => { await app.close() })

  const backdate = (id, ms) => {
    const time = new Date(Date.now() - ms)
    fs.utimesSync(path.join(folder, id), time, time)
  }

  it('answers instead of waiting for ever, and removes the files no record refers to', async () => {
    fs.writeFileSync(path.join(folder, 'orphanoldfile'), 'x')
    backdate('orphanoldfile', 60 * 60 * 1000)
    await articles.cleanAttachment()
    expect(fs.existsSync(path.join(folder, 'orphanoldfile'))).to.equal(false)
    expect(fs.existsSync(path.join(folder, attachment._id))).to.equal(true)
  })

  it('keeps the resized copies of an attachment that a record refers to', async () => {
    const copy = `${attachment._id}-autox100`
    fs.writeFileSync(path.join(folder, copy), 'x')
    backdate(copy, 60 * 60 * 1000)
    await articles.cleanAttachment()
    expect(fs.existsSync(path.join(folder, copy))).to.equal(true)
  })

  it('keeps a file that was just written: its record may not be saved yet', async () => {
    fs.writeFileSync(path.join(folder, 'justuploaded'), 'x')
    await articles.cleanAttachment()
    expect(fs.existsSync(path.join(folder, 'justuploaded'))).to.equal(true)
  })

  it('removes the resized copies of an attachment that no record refers to any more', async () => {
    const copy = 'gonegonegonegone-autox100'
    fs.writeFileSync(path.join(folder, copy), 'x')
    backdate(copy, 60 * 60 * 1000)
    await articles.cleanAttachment()
    expect(fs.existsSync(path.join(folder, copy))).to.equal(false)
  })
})
