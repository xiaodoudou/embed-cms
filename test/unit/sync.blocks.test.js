const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const IMAGE = path.join(__dirname, '..', 'fixtures', 'man.jpg')
const md5 = (buffer) => crypto.createHash('md5').update(buffer).digest('hex')
const text = (content) => Readable.from([Buffer.from(content)])

// the blocks of a paragraph field are synced with their relations (which point to records, whose ids differ) and their files
describe('sync plugin: paragraph blocks (unit)', () => {
  let A, B

  const api = (app, resource) => app.cms.api()(resource)
  const page = async (app, slug) => (await api(app, 'pages').list()).find(item => item.slug === slug)
  const tag = async (app, name) => (await api(app, 'tags').list()).find(item => item.name === name)
  const files = async (app, slug) => (await page(app, slug))._attachments || []
  const clear = async (app) => {
    for (const resource of ['pages', 'tags']) {
      for (const item of await api(app, resource).list()) {
        await api(app, resource).remove(item._id)
      }
    }
  }
  // the same tags on both, which have different ids
  const tags = async (app, names) => {
    for (const name of names) {
      await api(app, 'tags').create({ name })
    }
  }
  const push = async (from = A) => {
    await from.cms.$sync.run('tags', 'push')
    return from.cms.$sync.run('pages', 'push')
  }

  before(async () => {
    const options = { resources: './test/fixtures/syncResources', sync: { resources: ['tags', 'pages'] }, disableJwtLogin: true }
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

  describe('relations in the blocks', () => {
    it('points a block to the same tag on the other CMS, though its id is not the same', async () => {
      // the tags are made in another order on B, so that no id is the same
      await tags(A, ['red', 'green', 'blue'])
      await tags(B, ['blue', 'red'])
      const [red, green, blue] = await Promise.all(['red', 'green', 'blue'].map(name => tag(A, name)))
      await api(A, 'pages').create({
        slug: 'home',
        topic: green._id,
        content: [
          { _type: 'block_rel', title: 'first', tag: red._id, tags: [green._id, blue._id] },
          { _type: 'block_group', label: 'group', children: [{ _type: 'block_rel', title: 'inside', tag: blue._id, tags: [red._id] }] }
        ]
      })
      const result = await push()
      expect(result).to.include({ status: 'done', created: 1 })
      const [bRed, bGreen, bBlue] = await Promise.all(['red', 'green', 'blue'].map(name => tag(B, name)))
      expect(bRed._id).to.not.equal(red._id)
      const copied = await page(B, 'home')
      expect(copied.topic).to.equal(bGreen._id)
      expect(copied.content[0]).to.include({ _type: 'block_rel', title: 'first', tag: bRed._id })
      expect(copied.content[0].tags).to.deep.equal([bGreen._id, bBlue._id])
      expect(copied.content[1].children[0]).to.include({ title: 'inside', tag: bBlue._id })
      expect(copied.content[1].children[0].tags).to.deep.equal([bRed._id])
    })

    it('pulls the relations of the blocks the other way', async () => {
      await tags(B, ['red', 'green'])
      await tags(A, ['green', 'red'])
      const [red, green] = await Promise.all(['red', 'green'].map(name => tag(B, name)))
      await api(B, 'pages').create({ slug: 'there', content: [{ _type: 'block_rel', title: 'b', tag: red._id, tags: [green._id] }] })
      const result = await A.cms.$sync.run('tags', 'pull').then(() => A.cms.$sync.run('pages', 'pull'))
      expect(result).to.include({ status: 'done', created: 1 })
      const [aRed, aGreen] = await Promise.all(['red', 'green'].map(name => tag(A, name)))
      const copied = await page(A, 'there')
      expect(copied.content[0].tag).to.equal(aRed._id)
      expect(copied.content[0].tags).to.deep.equal([aGreen._id])
    })

    it('changes nothing the second time, though the ids are not the same', async () => {
      await tags(A, ['red', 'green'])
      await tags(B, ['green', 'red'])
      const [red, green] = await Promise.all(['red', 'green'].map(name => tag(A, name)))
      await api(A, 'pages').create({ slug: 'home', content: [{ _type: 'block_rel', title: 'x', tag: red._id, tags: [green._id] }] })
      await push()
      const again = await push()
      expect(again).to.include({ status: 'done', created: 0, updated: 0, removed: 0 })
    })

    it('updates a page whose block points to another tag', async () => {
      await tags(A, ['red', 'green'])
      await tags(B, ['green', 'red'])
      const [red, green] = await Promise.all(['red', 'green'].map(name => tag(A, name)))
      const created = await api(A, 'pages').create({ slug: 'home', content: [{ _type: 'block_rel', title: 'x', tag: red._id }] })
      await push()
      await api(A, 'pages').update(created._id, { content: [{ _type: 'block_rel', title: 'x', tag: green._id }] })
      const result = await push()
      expect(result).to.include({ status: 'done', updated: 1 })
      expect((await page(B, 'home')).content[0].tag).to.equal((await tag(B, 'green'))._id)
    })
  })

  describe('files in the blocks', () => {
    const upload = (app, slug, name, content, filename, payload) => page(app, slug).then(found => api(app, 'pages').createAttachment(found._id, {
      name, stream: content, contentType: 'application/octet-stream', fields: { _filename: filename }, payload
    }))
    const bytes = async (app, slug, name) => {
      const found = await page(app, slug)
      const [attachment] = (found._attachments || []).filter(item => item._name === name)
      const chunks = []
      for await (const chunk of (await api(app, 'pages').findAttachment(found._id, attachment._id)).stream) {
        chunks.push(chunk)
      }
      return Buffer.concat(chunks)
    }

    beforeEach(async () => {
      await api(A, 'pages').create({ slug: 'home', content: [{ _type: 'block_rel', title: 'one' }, { _type: 'block_rel', title: 'two' }] })
    })

    it('pushes the files of the blocks, byte for byte, under the name of their block, and counts them', async () => {
      await upload(A, 'home', 'content.0.picture', fs.createReadStream(IMAGE), 'man.jpg', { index: '0' })
      await upload(A, 'home', 'content.1.download', text('a download'), 'note.txt', { index: '0' })
      const result = await push()
      expect(result).to.include({ status: 'done', attachmentsAdded: 2, attachmentsRemoved: 0, attachmentsFailed: 0 })
      const copied = await files(B, 'home')
      expect(copied.map(item => item._name).sort()).to.deep.equal(['content.0.picture', 'content.1.download'])
      expect(copied.find(item => item._name === 'content.0.picture')).to.include({ _md5sum: md5(fs.readFileSync(IMAGE)), _filename: 'man.jpg', _contentType: 'image/jpeg' })
      expect((await bytes(B, 'home', 'content.1.download')).toString()).to.equal('a download')
    })

    it('keeps the payload of a file, which says its place among the files of the block', async () => {
      await upload(A, 'home', 'content.1.download', text('first'), 'first.txt', { index: '0' })
      await upload(A, 'home', 'content.1.download', text('second'), 'second.txt', { index: '1' })
      await push()
      const copied = (await files(B, 'home')).filter(item => item._name === 'content.1.download')
      expect(copied.map(item => [item._filename, item._payload])).to.have.deep.members([['first.txt', { index: '0' }], ['second.txt', { index: '1' }]])
    })

    it('copies no file the second time', async () => {
      await upload(A, 'home', 'content.0.picture', fs.createReadStream(IMAGE), 'man.jpg', { index: '0' })
      await push()
      const before = (await files(B, 'home')).map(item => item._id)
      const again = await push()
      expect(again).to.include({ status: 'done', created: 0, updated: 0, attachmentsAdded: 0, attachmentsRemoved: 0 })
      expect((await files(B, 'home')).map(item => item._id)).to.deep.equal(before)
    })

    it('removes the file of a block that the source no longer has, and copies the new one', async () => {
      await upload(A, 'home', 'content.1.download', text('old'), 'old.txt', { index: '0' })
      await push()
      const found = await page(A, 'home')
      await api(A, 'pages').removeAttachment(found._id, found._attachments[0]._id)
      await upload(A, 'home', 'content.1.download', text('new content'), 'new.txt', { index: '0' })
      const result = await push()
      expect(result).to.include({ status: 'done', attachmentsAdded: 1, attachmentsRemoved: 1 })
      expect((await bytes(B, 'home', 'content.1.download')).toString()).to.equal('new content')
    })

    it('does not remove the files of the blocks of a page that is not changed on this side, when others are copied', async () => {
      await upload(A, 'home', 'content.0.picture', fs.createReadStream(IMAGE), 'man.jpg', { index: '0' })
      await push()
      // a page that the other CMS has too, with a file of its own, and no file here: the file goes, as it is not on the source
      await api(A, 'pages').create({ slug: 'other', content: [{ _type: 'block_rel', title: 'o' }] })
      await push()
      const found = await page(B, 'other')
      await api(B, 'pages').createAttachment(found._id, { name: 'content.0.picture', stream: text('only there'), contentType: 'text/plain', fields: { _filename: 'x.txt' } })
      const result = await push()
      expect(result).to.include({ status: 'done', attachmentsRemoved: 1 })
      expect(await files(B, 'other')).to.have.length(0)
      expect(await files(B, 'home')).to.have.length(1)
    })
  })
})
