const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const IMAGE = path.join(__dirname, '..', 'fixtures', 'man.jpg')
const md5 = (buffer) => crypto.createHash('md5').update(buffer).digest('hex')
const text = (content) => Readable.from([Buffer.from(content)])

// the files (attachments) of the records are synced with them: copied, replaced, removed, and said in the report
describe('sync plugin: attachments (unit)', () => {
  let A, B

  const api = (app) => app.cms.api()('articles')
  const record = async (app, title) => (await api(app).list()).find(item => item.string && item.string.enUS === title)
  const files = async (app, title) => (await record(app, title))._attachments || []
  const upload = async (app, title, content, filename = 'note.txt') => {
    const found = await record(app, title) || await api(app).create({ string: { enUS: title } })
    return api(app).createAttachment(found._id, { name: 'file', stream: text(content), contentType: 'text/plain', fields: { _filename: filename } })
  }
  const bytes = async (app, title) => {
    const [attachment] = await files(app, title)
    const chunks = []
    for await (const chunk of (await api(app).findAttachment((await record(app, title))._id, attachment._id)).stream) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  const clear = async (app) => {
    for (const item of await api(app).list()) {
      await api(app).remove(item._id)
    }
  }

  before(async () => {
    const options = { sync: { resources: ['articles'] }, disableJwtLogin: true }
    A = await startApp(options)
    B = await startApp(options)
    for (const app of [A, B]) {
      app.cms.$sync.runner.pollMs = 20
    }
    await A.cms.api()('_sync').create({ allows: ['read', 'write'], local: { token: 'token-a', url: A.url }, remote: { token: 'token-b', url: B.url } })
    await B.cms.api()('_sync').create({ allows: ['read', 'write'], local: { token: 'token-b', url: B.url }, remote: { token: 'token-a', url: A.url } })
  })
  after(async () => {
    await A.close()
    await B.close()
  })
  beforeEach(async () => {
    await clear(A)
    await clear(B)
  })

  it('pushes the file of a new record, byte for byte, and counts it', async () => {
    const attachment = await upload(A, 'with a file', 'hello files')
    expect(attachment._md5sum).to.equal(md5(Buffer.from('hello files')))
    const result = await A.cms.$sync.run('articles', 'push')
    expect(result).to.include({ status: 'done', created: 1, updated: 0, removed: 0, attachmentsAdded: 1, attachmentsRemoved: 0, attachmentsFailed: 0 })
    const [copied] = await files(B, 'with a file')
    expect(copied).to.include({ _md5sum: md5(Buffer.from('hello files')), _name: 'file', _filename: 'note.txt', _contentType: 'text/plain' })
    expect((await bytes(B, 'with a file')).toString()).to.equal('hello files')
  })

  it('copies a real picture, and pulls a file the other way', async () => {
    const found = await api(B).create({ string: { enUS: 'a man' } })
    await api(B).createAttachment(found._id, { name: 'file', stream: fs.createReadStream(IMAGE), fields: { _filename: 'man.jpg' } })
    const result = await A.cms.$sync.run('articles', 'pull')
    expect(result).to.include({ status: 'done', created: 1, attachmentsAdded: 1 })
    expect((await files(A, 'a man'))[0]).to.include({ _md5sum: md5(fs.readFileSync(IMAGE)), _contentType: 'image/jpeg' })
  })

  it('carries the image map of a picture, and copies the picture again when its map has changed', async () => {
    const kitchen = { id: 'kitchen', shape: 'rect', coords: [0.1, 0.1, 0.4, 0.5], title: 'Kitchen', href: '/kitchen', target: '_self' }
    const lamp = { id: 'lamp', shape: 'circle', coords: [0.7, 0.3, 0.1], title: 'Lamp', ref: { resource: 'articles', id: 'abc' }, target: '_blank' }
    const found = await api(A).create({ string: { enUS: 'a plan' } })
    const created = await api(A).createAttachment(found._id, { name: 'file', stream: fs.createReadStream(IMAGE), fields: { _filename: 'plan.jpg' }, imageMap: { areas: [kitchen] } })
    await A.cms.$sync.run('articles', 'push')
    expect((await files(B, 'a plan'))[0].imageMap).to.deep.equal({ areas: [kitchen] })
    // nothing changed: nothing is copied
    expect(await A.cms.$sync.run('articles', 'push')).to.include({ attachmentsAdded: 0, attachmentsRemoved: 0 })
    // the map changed, the file did not: the picture is copied again with its new map
    await api(A).updateAttachment(found._id, created._id, { imageMap: { areas: [kitchen, lamp] } })
    const result = await A.cms.$sync.run('articles', 'push')
    expect(result).to.include({ status: 'done', attachmentsAdded: 1, attachmentsRemoved: 1 })
    expect((await files(B, 'a plan'))[0].imageMap).to.deep.equal({ areas: [kitchen, lamp] })
  })

  it('changes nothing, and copies no file, when both are alike', async () => {
    await upload(A, 'same', 'one file')
    await A.cms.$sync.run('articles', 'push')
    const again = await A.cms.$sync.run('articles', 'push')
    expect(again).to.include({ status: 'done', created: 0, updated: 0, removed: 0, attachmentsAdded: 0, attachmentsRemoved: 0 })
  })

  it('replaces a file that is not the same: the old one is removed, the new one copied', async () => {
    await upload(A, 'changing', 'version one')
    await A.cms.$sync.run('articles', 'push')
    const [old] = await files(A, 'changing')
    await api(A).removeAttachment((await record(A, 'changing'))._id, old._id)
    await upload(A, 'changing', 'version two, longer')
    const result = await A.cms.$sync.run('articles', 'push')
    expect(result).to.include({ status: 'done', updated: 1, attachmentsAdded: 1, attachmentsRemoved: 1 })
    expect((await files(B, 'changing'))).to.have.length(1)
    expect((await bytes(B, 'changing')).toString()).to.equal('version two, longer')
  })

  it('copies only the file that is new, and leaves the ones that are the same untouched', async () => {
    await upload(A, 'several', 'first file', 'one.txt')
    await upload(A, 'several', 'second file', 'two.txt')
    await A.cms.$sync.run('articles', 'push')
    const before = (await files(B, 'several')).map(item => item._id).sort()
    expect(before).to.have.length(2)
    await upload(A, 'several', 'third file', 'three.txt')
    const result = await A.cms.$sync.run('articles', 'push')
    expect(result).to.include({ status: 'done', attachmentsAdded: 1, attachmentsRemoved: 0 })
    const after = (await files(B, 'several')).map(item => item._id)
    expect(after).to.have.length(3)
    expect(before.every(id => after.includes(id))).to.equal(true)
  })

  it('removes the file the source no longer has', async () => {
    await upload(A, 'losing', 'a file to lose')
    await A.cms.$sync.run('articles', 'push')
    expect(await files(B, 'losing')).to.have.length(1)
    const [attachment] = await files(A, 'losing')
    await api(A).removeAttachment((await record(A, 'losing'))._id, attachment._id)
    const result = await A.cms.$sync.run('articles', 'push')
    expect(result).to.include({ status: 'done', updated: 1, attachmentsAdded: 0, attachmentsRemoved: 1 })
    expect(await files(B, 'losing')).to.have.length(0)
  })

  it('counts the files that go with a record that is removed', async () => {
    await upload(B, 'only on the other', 'will go with its record')
    await upload(A, 'kept', 'kept file')
    const result = await A.cms.$sync.run('articles', 'push')
    expect(result).to.include({ status: 'done', created: 1, removed: 1, attachmentsAdded: 1, attachmentsRemoved: 1 })
    expect(await record(B, 'only on the other')).to.equal(undefined)
  })

  it('says it failed, and why, when a file cannot be copied: not a sync that is done', async () => {
    await upload(A, 'unreachable', 'a file that will not come')
    await upload(A, 'fine', 'a file that comes')
    const original = global.fetch
    // the other CMS cannot read the files of this one
    global.fetch = (url, ...rest) => (String(url).includes('/attachments/') ? Promise.resolve(new Response('no', { status: 503, statusText: 'Service Unavailable' })) : original(url, ...rest))
    let result
    try {
      result = await A.cms.$sync.run('articles', 'push')
    } finally {
      global.fetch = original
    }
    expect(result.status).to.equal('error')
    expect(result.error).to.equal('2 attachments could not be copied')
    expect(result).to.include({ created: 2, attachmentsAdded: 0, attachmentsFailed: 2 })
    // the records are there, without the files, and a second run copies them
    expect(await files(B, 'unreachable')).to.have.length(0)
    const again = await A.cms.$sync.run('articles', 'push')
    expect(again).to.include({ status: 'done', attachmentsAdded: 2, attachmentsFailed: 0 })
    expect((await bytes(B, 'unreachable')).toString()).to.equal('a file that will not come')
  })

  it('does not save an error answer as the file', async () => {
    await upload(A, 'broken', 'real content')
    const original = global.fetch
    global.fetch = (url, ...rest) => (String(url).includes('/attachments/') ? Promise.resolve(new Response(JSON.stringify({ error: 'nope' }), { status: 500 })) : original(url, ...rest))
    try {
      await A.cms.$sync.run('articles', 'push')
    } finally {
      global.fetch = original
    }
    expect(await files(B, 'broken')).to.have.length(0)
  })

  it('reports the files in the report of a run, and in the report the other CMS keeps', async () => {
    await upload(A, 'reported', 'report me')
    const run = await A.cms.$sync.runAll('push')
    expect(run.results[0]).to.include({ attachmentsAdded: 1, attachmentsRemoved: 0, attachmentsFailed: 0 })
    expect(B.cms.$sync.syncReport.articles).to.include({ status: 'done', attachmentsAdded: 1 })
  })
})
