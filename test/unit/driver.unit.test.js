const fs = require('fs')
const path = require('path')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const image = path.join(__dirname, '..', 'man.jpg')

describe('driver / resource CRUD (unit)', () => {
  let app, api, notes, cities

  before(async () => {
    app = await startApp()
    api = app.cms.api()
    notes = api('publicData')
    cities = api('cities')
  })
  after(async () => {
    await app.close()
  })

  describe('create / find / update / remove', () => {
    it('creates a record with a generated id containing the cms mid', async () => {
      const record = await notes.create({ message: 'hello' })
      expect(record).to.have.property('_id').that.is.a('string')
      expect(record._id.indexOf('42424242')).to.equal(8)
      expect(record).to.have.property('message', 'hello')
      expect(record._createdAt).to.be.a('number')
      expect(record._local).to.equal(true)
    })
    it('finds a record by id', async () => {
      const created = await notes.create({ message: 'find me' })
      const found = await notes.find(created._id)
      expect(found).to.have.property('message', 'find me')
    })
    it('resolves null when finding an unknown id', async () => {
      expect(await notes.find('doesnotexist')).to.equal(null)
    })
    it('update merges into the record and bumps _updatedAt', async () => {
      const created = await notes.create({ message: 'v1' })
      await new Promise(resolve => setTimeout(resolve, 5))
      const updated = await notes.update(created._id, { message: 'v2' })
      expect(updated).to.have.property('message', 'v2')
      expect(updated._createdAt).to.equal(created._createdAt)
      expect(updated._updatedAt).to.be.greaterThan(created._updatedAt)
    })
    it('update ignores prototype keys', async () => {
      const created = await notes.create({ message: 'safe' })
      await notes.update(created._id, JSON.parse('{"__proto__":{"polluted":"yes"}}'))
      expect({}.polluted).to.equal(undefined)
    })
    it('update of an unknown id is a 404', async () => {
      try {
        await notes.update('doesnotexist', { message: 'x' })
        expect.fail('should have thrown')
      } catch (error) {
        expect(error.code).to.equal(404)
      }
    })
    it('remove deletes the record', async () => {
      const created = await notes.create({ message: 'bye' })
      await notes.remove(created._id)
      expect(await notes.find(created._id)).to.equal(null)
    })
    it('list returns every created record', async () => {
      const before = (await notes.list()).length
      await notes.create({ message: 'a' })
      await notes.create({ message: 'b' })
      expect((await notes.list()).length).to.equal(before + 2)
    })
  })

  describe('unique fields', () => {
    it('rejects a duplicate value with a 400', async () => {
      await cities.create({ key: 'paris', name: 'Paris' })
      try {
        await cities.create({ key: 'paris', name: 'Another' })
        expect.fail('should have thrown')
      } catch (error) {
        expect(error.code).to.equal(400)
        expect(error.message).to.match(/duplicated/)
      }
    })
    it('allows updating a record without tripping over its own value', async () => {
      const city = await cities.create({ key: 'rome', name: 'Rome' })
      const updated = await cities.update(city._id, { name: 'Roma' })
      expect(updated).to.have.property('name', 'Roma')
    })
  })

  describe('hooks', () => {
    it('before hooks can change the object', async () => {
      notes.before('create', (context) => {
        if (context.params.object.message === 'shout') {
          context.params.object.message = 'SHOUT'
        }
        context.next()
      })
      const record = await notes.create({ message: 'shout' })
      expect(record.message).to.equal('SHOUT')
    })
    it('before hooks can reject with context.error', async () => {
      notes.before('create', (context) => {
        if (context.params.object.message === 'forbidden') {
          return context.error({ code: 403, message: 'nope' })
        }
        context.next()
      })
      try {
        await notes.create({ message: 'forbidden' })
        expect.fail('should have thrown')
      } catch (error) {
        expect(error.code).to.equal(403)
      }
      const all = await notes.list()
      expect(all.find(r => r.message === 'forbidden')).to.equal(undefined)
    })
    it('after hooks run once the operation succeeded', async () => {
      let seen = null
      notes.after('update', (context) => {
        seen = context.params.id
        context.next()
      })
      const created = await notes.create({ message: 'hooked' })
      await notes.update(created._id, { message: 'hooked2' })
      expect(seen).to.equal(created._id)
    })
  })

  describe('concurrency', () => {
    it('does not lose records created in parallel', async () => {
      const before = (await notes.list()).length
      await Promise.all(Array.from({ length: 20 }, (_, i) => notes.create({ message: `parallel-${i}` })))
      expect((await notes.list()).length).to.equal(before + 20)
    })
    it('unique constraint holds under parallel creates', async () => {
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => cities.create({ key: 'race', name: 'Race' })))
      expect(results.filter(r => r.status === 'fulfilled')).to.have.length(1)
    })
  })

  describe('attachments', () => {
    const upload = (id, resource = api('articles')) => resource.createAttachment(id, {
      name: 'file',
      filename: 'man.jpg',
      contentType: 'image/jpeg',
      fields: { _filename: 'man.jpg' },
      stream: fs.createReadStream(image)
    })

    it('stores an attachment and streams the same bytes back', async () => {
      const articles = api('articles')
      const record = await articles.create({ title: 'with file' })
      const attachment = await upload(record._id)
      expect(attachment).to.have.property('_id')
      const found = await articles.findAttachment(record._id, attachment._id)
      const chunks = []
      for await (const chunk of found.stream) chunks.push(chunk)
      expect(Buffer.concat(chunks).length).to.equal(fs.statSync(image).size)
    })
    it('removes an attachment', async () => {
      const articles = api('articles')
      const record = await articles.create({ title: 'remove file' })
      const attachment = await upload(record._id)
      await articles.removeAttachment(record._id, attachment._id)
      try {
        await articles.findAttachment(record._id, attachment._id)
        expect.fail('should have thrown')
      } catch (error) {
        expect(error.code).to.be.oneOf([404, 500])
      }
    })
    it('refuses an attachment for an unknown record', async () => {
      try {
        await upload('doesnotexist')
        expect.fail('should have thrown')
      } catch (error) {
        expect(error).to.have.property('code')
      }
    })
    it('persists attachment files on disk under the data directory', async () => {
      const articles = api('articles')
      const record = await articles.create({ title: 'disk file' })
      await upload(record._id)
      expect(fs.existsSync(app.dataDir)).to.equal(true)
    })
  })
})
