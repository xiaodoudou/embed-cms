const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')
const request = require('supertest')
const sharp = require('sharp')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')
const OSSHelper = require('../../lib/util/OSSHelper')

const IMAGE = path.join(__dirname, '..', 'fixtures', 'man.jpg')
const TEXT = Buffer.from('a few lines of text\nfor the object store\n')

/**
 * A stand-in for the ali-oss client, with the methods OSSHelper calls: it keeps the objects in memory, records every call
 * (name of the method, key of the object) and fails every call with `failWith` once that is set. Nothing leaves the process.
 */
function fakeOSS () {
  const store = { objects: new Map(), calls: [], failWith: null }
  const call = (method, name) => {
    store.calls.push([method, name])
    if (store.failWith) {
      throw store.failWith
    }
  }
  const missing = (name) => Object.assign(new Error(`NoSuchKey: ${name}`), { code: 'NoSuchKey', status: 404 })
  store.putStream = async (name, stream) => {
    call('putStream', name)
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    store.objects.set(name, Buffer.concat(chunks))
    return { name, res: { status: 200 } }
  }
  store.put = async (name, content) => {
    call('put', name)
    store.objects.set(name, Buffer.isBuffer(content) ? content : fs.readFileSync(content))
    return { name, res: { status: 200 } }
  }
  store.getStream = async (name) => {
    call('getStream', name)
    if (!store.objects.has(name)) {
      throw missing(name)
    }
    const content = store.objects.get(name)
    return { stream: Readable.from([content]), res: { status: 200, headers: { 'content-length': String(content.length) } } }
  }
  store.get = async (name) => {
    call('get', name)
    if (!store.objects.has(name)) {
      throw missing(name)
    }
    return { content: store.objects.get(name), res: { status: 200 } }
  }
  store.delete = async (name) => {
    call('delete', name)
    store.objects.delete(name)
    return { res: { status: 204 } }
  }
  return store
}

const binary = (res, callback) => {
  const chunks = []
  res.on('data', chunk => chunks.push(chunk))
  res.on('end', () => callback(null, Buffer.concat(chunks)))
}

const readAll = async (stream) => {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const rejection = async (promise) => {
  try {
    await promise
  } catch (error) {
    return error
  }
  return undefined
}

/** A driver context as the hooks see it: the calls of error and next are recorded. */
const fakeContext = (overrides = {}) => {
  const context = { errors: [], nexts: 0, resource: { name: 'photos' }, params: { id: 'rec1', object: {} }, ...overrides }
  context.error = (error) => { context.errors.push(error); return context }
  context.next = () => { context.nexts++ }
  return context
}

const FIELD = { field: 'document', input: 'file', options: { method: 'oss', oss: { accessKeyId: 'test-key', path: 'uploads/%{resource}/%{_id}', filename: 'file-%{filename}' } } }

describe('OSSHelper (unit)', () => {
  describe('the helper alone, with the client stood in for', () => {
    let helper, store

    beforeEach(() => {
      helper = new OSSHelper()
      store = fakeOSS()
      helper.getStore = () => store
    })

    describe('getOSSFilepath', () => {
      it('puts the resource and the record into the path, and the file name into the file name', () => {
        const context = fakeContext({ params: { id: 'abc123', object: { fields: { _filename: 'report.pdf' } } } })
        expect(helper.getOSSFilepath(context, FIELD)).to.equal('uploads/photos/abc123/file-report.pdf')
      })

      it('prefers the name of the stored attachment, which a read or a delete has', () => {
        const context = fakeContext({ attachment: { _filename: 'stored.txt' }, params: { id: 'abc123', object: { fields: { _filename: 'other.txt' } } } })
        expect(helper.getOSSFilepath(context, FIELD)).to.equal('uploads/photos/abc123/file-stored.txt')
      })

      it('takes the name of the uploaded file when the upload carries no _filename field', () => {
        const context = fakeContext({ params: { id: 'abc123', object: { filename: 'portrait.jpg', fields: {} } } })
        expect(helper.getOSSFilepath(context, FIELD)).to.equal('uploads/photos/abc123/file-portrait.jpg')
      })

      it('keeps the key inside its folder whatever directories the client puts in the name', () => {
        for (const name of ['../../etc/passwd.txt', '..\\..\\evil.png', '/abs/olute.bin', 'C:\\Users\\x\\y.doc']) {
          const context = fakeContext({ params: { id: 'r', object: { fields: { _filename: name } } } })
          const key = helper.getOSSFilepath(context, FIELD)
          expect(key, name).to.match(/^uploads\/photos\/r\/file-[^/\\]+$/)
          expect(key, name).to.not.include('..')
        }
      })

      it('uses forward slashes only', () => {
        const field = { options: { oss: { path: 'a/%{resource}', filename: '%{filename}' } } }
        const context = fakeContext({ params: { id: 'r', object: { fields: { _filename: 'x.y.z.txt' } } } })
        expect(helper.getOSSFilepath(context, field)).to.equal('a/photos/x.txt')
      })
    })

    describe('getOSSConfig and getStore', () => {
      const key = `unit-${process.pid}-${Date.now().toString(36)}`
      const file = path.resolve(`./oss-config-${key}.json`)
      before(() => {
        fs.writeFileSync(file, JSON.stringify({ region: 'oss-cn-hangzhou', accessKeyId: key, accessKeySecret: 'not-a-real-secret', bucket: 'unit-bucket' }))
      })
      after(() => {
        fs.rmSync(file, { force: true })
      })

      it('reads oss-config-<accessKeyId>.json from the working directory', () => {
        const config = new OSSHelper().getOSSConfig(key)
        expect(config).to.include({ accessKeyId: key, bucket: 'unit-bucket' })
      })

      it('says which config file is missing', () => {
        expect(() => new OSSHelper().getOSSConfig('nobody')).to.throw(/oss-config|accessKeyId: nobody/)
      })

      it('refuses a field whose OSS options have no accessKeyId', () => {
        expect(() => new OSSHelper().getStore({ options: { oss: { path: 'p', filename: 'f' } } })).to.throw(/accessKeyId/)
      })

      it('builds an ali-oss client from the config file, without touching the network', () => {
        const client = new OSSHelper().getStore({ options: { oss: { accessKeyId: key } } })
        expect(client.options).to.include({ bucket: 'unit-bucket', accessKeyId: key })
        for (const method of ['putStream', 'getStream', 'put', 'get', 'delete']) {
          expect(client[method], method).to.be.a('function')
        }
      })
    })

    describe('uploadStream', () => {
      it('streams the file to the key of the field and counts its bytes', async () => {
        const context = fakeContext({ params: { id: 'r1', object: { stream: Readable.from([TEXT.subarray(0, 10), TEXT.subarray(10)]), fields: { _filename: 'notes.txt' } } } })
        const result = await helper.uploadStream(context, FIELD)
        expect(result).to.include({ name: 'uploads/photos/r1/file-notes.txt', size: TEXT.length })
        expect(store.objects.get('uploads/photos/r1/file-notes.txt').equals(TEXT)).to.equal(true)
      })

      it('rejects with the error of the client', async () => {
        store.failWith = new Error('RequestTimeout')
        const context = fakeContext({ params: { id: 'r1', object: { stream: Readable.from([TEXT]), fields: { _filename: 'notes.txt' } } } })
        const error = await rejection(helper.uploadStream(context, FIELD))
        expect(error).to.have.property('message', 'RequestTimeout')
      })
    })

    describe('getStream', () => {
      it('answers the stream of the object and its size as a number', async () => {
        store.objects.set('uploads/photos/r1/file-notes.txt', TEXT)
        const context = fakeContext({ attachment: { _filename: 'notes.txt' }, params: { id: 'r1' } })
        const result = await helper.getStream(context, FIELD)
        expect(result.size).to.equal(TEXT.length)
        expect((await readAll(result.stream)).equals(TEXT)).to.equal(true)
      })

      it('ends the context with the error of the client', async () => {
        const context = fakeContext({ attachment: { _filename: 'gone.txt' }, params: { id: 'r1' } })
        await helper.getStream(context, FIELD)
        expect(context.errors).to.have.length(1)
        expect(context.errors[0]).to.have.property('code', 'NoSuchKey')
      })
    })

    describe('uploadFile', () => {
      it('puts a buffer and goes on with the chain', async () => {
        const context = fakeContext({ params: { id: 'r2', object: { buffer: TEXT, fields: { _filename: 'buffer.txt' } } } })
        await helper.uploadFile(context, FIELD)
        await new Promise(resolve => setImmediate(resolve))
        expect(context.nexts).to.equal(1)
        expect(context.errors).to.have.length(0)
        expect(store.objects.get('uploads/photos/r2/file-buffer.txt').equals(TEXT)).to.equal(true)
      })

      it('puts a file by its path', async () => {
        const file = path.join(os.tmpdir(), `oss-unit-${process.pid}.txt`)
        fs.writeFileSync(file, TEXT)
        try {
          const context = fakeContext({ params: { id: 'r2', object: { path: file, fields: { _filename: 'path.txt' } } } })
          await helper.uploadFile(context, FIELD)
          await new Promise(resolve => setImmediate(resolve))
          expect(context.nexts).to.equal(1)
          expect(store.calls).to.deep.equal([['put', 'uploads/photos/r2/file-path.txt']])
        } finally {
          fs.rmSync(file, { force: true })
        }
      })

      it('ends the context with an error when there is neither a buffer nor a path', async () => {
        const context = fakeContext({ params: { id: 'r2', object: { fields: { _filename: 'nothing.txt' } } } })
        await helper.uploadFile(context, FIELD)
        expect(context.nexts).to.equal(0)
        expect(context.errors[0]).to.have.property('message').that.matches(/No file content/)
        expect(store.calls).to.have.length(0)
      })

      it('ends the context with the error of the client', async () => {
        store.failWith = new Error('AccessDenied')
        const context = fakeContext({ params: { id: 'r2', object: { buffer: TEXT, fields: { _filename: 'denied.txt' } } } })
        await helper.uploadFile(context, FIELD)
        await new Promise(resolve => setImmediate(resolve))
        expect(context.nexts).to.equal(0)
        expect(context.errors[0]).to.have.property('message', 'AccessDenied')
      })
    })

    describe('getFile', () => {
      it('puts the content of the object on the attachment', async () => {
        store.objects.set('uploads/photos/r3/file-whole.txt', TEXT)
        const context = fakeContext({ attachment: { _filename: 'whole.txt' }, params: { id: 'r3' } })
        await helper.getFile(context, FIELD)
        expect(context.attachment.buffer.equals(TEXT)).to.equal(true)
        expect(context.errors).to.have.length(0)
      })

      it('ends the context with the error of the client', async () => {
        const context = fakeContext({ attachment: { _filename: 'absent.txt' }, params: { id: 'r3' } })
        await helper.getFile(context, FIELD)
        expect(context.errors[0]).to.have.property('code', 'NoSuchKey')
      })
    })

    describe('deleteFile', () => {
      it('deletes the key of the attachment', async () => {
        store.objects.set('uploads/photos/r4/file-old.txt', TEXT)
        await helper.deleteFile(fakeContext({ attachment: { _filename: 'old.txt' }, params: { id: 'r4' } }), FIELD)
        expect(store.calls).to.deep.equal([['delete', 'uploads/photos/r4/file-old.txt']])
        expect(store.objects.size).to.equal(0)
      })

      it('rejects with the error of the client', async () => {
        store.failWith = new Error('AccessDenied')
        const error = await rejection(helper.deleteFile(fakeContext({ attachment: { _filename: 'old.txt' }, params: { id: 'r4' } }), FIELD))
        expect(error).to.have.property('message', 'AccessDenied')
      })
    })
  })

  describe('inside a resource', () => {
    let app, photos, store, folder

    before(async () => {
      app = await startApp({ resources: './test/fixtures/ossResources' })
      photos = app.cms.api()('photos')
      folder = app.cms.resource('photos').file
    })
    after(async () => {
      await app.close()
    })
    beforeEach(() => {
      // every test gets an empty object store and a clean record of the calls
      store = fakeOSS()
      app.cms.oss.getStore = () => store
    })

    const textStream = () => Readable.from([TEXT])
    const upload = (recordId, name, filename, stream = textStream()) => photos.createAttachment(recordId, { name, stream, fields: { _filename: filename } })

    describe('an attachment on an OSS field', () => {
      it('goes to the object store, not to the blob folder', async () => {
        const record = await photos.create({ title: 'with a document' })
        const attachment = await upload(record._id, 'document', 'notes.txt')
        const key = `uploads/photos/${record._id}/file-notes.txt`
        expect(store.calls).to.deep.equal([['putStream', key]])
        expect(store.objects.get(key).equals(TEXT)).to.equal(true)
        expect(folder.exists(attachment._id)).to.equal(false)
        expect(attachment).to.include({ _name: 'document', _filename: 'notes.txt', _contentType: 'text/plain', _size: TEXT.length })
        const found = await photos.find(record._id)
        expect(found._attachments.map(item => item._id)).to.deep.equal([attachment._id])
      })

      it('is read back from the object store, with its size', async () => {
        const record = await photos.create({ title: 'read back' })
        const attachment = await upload(record._id, 'document', 'notes.txt')
        const found = await photos.findAttachment(record._id, attachment._id)
        expect(found._oss).to.equal(true)
        expect(found._size).to.equal(TEXT.length)
        expect((await readAll(found.stream)).equals(TEXT)).to.equal(true)
        expect(store.calls.map(([method]) => method)).to.deep.equal(['putStream', 'getStream'])
        expect(fs.readdirSync(folder._dir).filter(file => file.startsWith(attachment._id))).to.deep.equal([])
      })

      it('is uploaded and downloaded over REST', async () => {
        const created = await request(app.url).post('/api/photos').auth(...ADMIN).send({ title: 'rest' })
        const posted = await request(app.url)
          .post(`/api/photos/${created.body._id}/attachments`)
          .auth(...ADMIN)
          .field('_filename', 'notes.txt')
          .attach('document', TEXT, { filename: 'notes.txt', contentType: 'text/plain' })
        expect(posted.status).to.equal(200)
        const key = `uploads/photos/${created.body._id}/file-notes.txt`
        expect(store.objects.has(key)).to.equal(true)
        const res = await request(app.url)
          .get(`/api/photos/${created.body._id}/attachments/${posted.body._id}`)
          .auth(...ADMIN)
          .buffer(true)
          .parse(binary)
        expect(res.status).to.equal(200)
        expect(res.headers['content-type']).to.match(/text\/plain/)
        expect(res.body.equals(TEXT)).to.equal(true)
      })

      it('is removed from the object store with the attachment', async () => {
        const record = await photos.create({ title: 'remove one' })
        const attachment = await upload(record._id, 'document', 'notes.txt')
        const key = `uploads/photos/${record._id}/file-notes.txt`
        await photos.removeAttachment(record._id, attachment._id)
        expect(store.calls).to.deep.include(['delete', key])
        expect(store.objects.has(key)).to.equal(false)
        expect((await photos.find(record._id))._attachments).to.have.length(0)
      })

      it('is removed from the object store with its record', async () => {
        const record = await photos.create({ title: 'remove record' })
        await upload(record._id, 'document', 'first.txt')
        await upload(record._id, 'document', 'second.txt')
        await photos.remove(record._id)
        const deleted = store.calls.filter(([method]) => method === 'delete').map(([, key]) => key).sort()
        expect(deleted).to.deep.equal([`uploads/photos/${record._id}/file-first.txt`, `uploads/photos/${record._id}/file-second.txt`])
        expect(store.objects.size).to.equal(0)
        expect(await photos.find(record._id)).to.not.be.ok
      })

      it('is deleted under the key it was uploaded to when the upload had no _filename field', async () => {
        const record = await photos.create({ title: 'no _filename field' })
        const attachment = await photos.createAttachment(record._id, { name: 'document', stream: textStream(), filename: 'given.txt' })
        expect(attachment._filename).to.equal('given.txt')
        const key = `uploads/photos/${record._id}/file-given.txt`
        expect(store.objects.has(key)).to.equal(true)
        await photos.removeAttachment(record._id, attachment._id)
        expect(store.calls).to.deep.include(['delete', key])
        expect(store.objects.size).to.equal(0)
      })

      it('an image goes through the object store too, and is resized on the way out', async () => {
        const record = await photos.create({ title: 'picture' })
        const attachment = await upload(record._id, 'picture', 'man.jpg', fs.createReadStream(IMAGE))
        expect(attachment._contentType).to.equal('image/jpeg')
        expect(store.objects.get('pictures/photos/man.jpg').equals(fs.readFileSync(IMAGE))).to.equal(true)
        expect(folder.exists(attachment._id)).to.equal(false)
        const res = await request(app.url)
          .get(`/api/photos/${record._id}/attachments/${attachment._id}`)
          .auth(...ADMIN)
          .query({ resize: '60x40' })
          .buffer(true)
          .parse(binary)
        expect(res.status).to.equal(200)
        const meta = await sharp(res.body).metadata()
        expect([meta.width, meta.height]).to.deep.equal([60, 40])
      })

      it('a field that takes one image deletes the picture it replaces from the object store', async () => {
        const record = await photos.create({ title: 'replace' })
        await upload(record._id, 'picture', 'first.jpg', fs.createReadStream(IMAGE))
        const second = await upload(record._id, 'picture', 'second.jpg', fs.createReadStream(IMAGE))
        expect(store.calls).to.deep.include(['delete', 'pictures/photos/first.jpg'])
        expect([...store.objects.keys()]).to.deep.equal(['pictures/photos/second.jpg'])
        expect((await photos.find(record._id))._attachments.map(item => item._id)).to.deep.equal([second._id])
      })
    })

    describe('a field that keeps its files on disk', () => {
      it('never calls the object store', async () => {
        const record = await photos.create({ title: 'local' })
        const attachment = await upload(record._id, 'local', 'notes.txt')
        expect(folder.exists(attachment._id)).to.equal(true)
        const found = await photos.findAttachment(record._id, attachment._id)
        expect(found._oss).to.equal(undefined)
        expect((await readAll(found.stream)).equals(TEXT)).to.equal(true)
        await photos.removeAttachment(record._id, attachment._id)
        expect(folder.exists(attachment._id)).to.equal(false)
        expect(store.calls).to.deep.equal([])
      })

      it('keeps its files on disk when it has OSS options but method is disk, for the upload and for the read', async () => {
        const record = await photos.create({ title: 'configured but disk' })
        const attachment = await upload(record._id, 'configured', 'notes.txt')
        expect(folder.exists(attachment._id)).to.equal(true)
        const found = await photos.findAttachment(record._id, attachment._id)
        expect(found._oss).to.equal(undefined)
        expect((await readAll(found.stream)).equals(TEXT)).to.equal(true)
        expect(store.calls).to.deep.equal([])
      })
    })

    describe('when the object store fails', () => {
      it('an upload is refused and nothing is kept', async () => {
        const record = await photos.create({ title: 'failed upload' })
        const filesBefore = fs.readdirSync(folder._dir)
        store.failWith = new Error('RequestTimeout')
        const error = await rejection(upload(record._id, 'document', 'notes.txt'))
        expect(error).to.be.ok
        expect(JSON.stringify(error)).to.match(/RequestTimeout|attachment/)
        expect((await photos.find(record._id))._attachments || []).to.have.length(0)
        // nothing landed in the blob folder either
        expect(fs.readdirSync(folder._dir)).to.deep.equal(filesBefore)
      })

      it('a read answers an error, and REST a status, instead of hanging', async () => {
        const record = await photos.create({ title: 'failed read' })
        const attachment = await upload(record._id, 'document', 'notes.txt')
        store.failWith = Object.assign(new Error('NoSuchKey'), { code: 'NoSuchKey', status: 404 })
        const error = await rejection(photos.findAttachment(record._id, attachment._id))
        expect(error).to.have.property('message', 'NoSuchKey')
        const res = await request(app.url).get(`/api/photos/${record._id}/attachments/${attachment._id}`).auth(...ADMIN)
        expect(res.status).to.be.oneOf([404, 500])
      })

      it('a delete that fails leaves the attachment on the record', async () => {
        const record = await photos.create({ title: 'failed delete' })
        const attachment = await upload(record._id, 'document', 'notes.txt')
        store.failWith = new Error('AccessDenied')
        const error = await rejection(photos.removeAttachment(record._id, attachment._id))
        expect(error).to.be.ok
        expect((await photos.find(record._id))._attachments.map(item => item._id)).to.deep.equal([attachment._id])
      })

      it('removing a record whose file cannot be deleted answers an error and keeps the record', async () => {
        const record = await photos.create({ title: 'failed record delete' })
        await upload(record._id, 'document', 'notes.txt')
        store.failWith = new Error('AccessDenied')
        const error = await rejection(photos.remove(record._id))
        expect(error).to.be.ok
        expect(await photos.find(record._id)).to.have.property('_id', record._id)
      })
    })
  })
})
