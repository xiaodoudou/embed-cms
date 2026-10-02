const os = require('os')
const fs = require('fs-extra')
const path = require('path')
const { expect } = require('chai')
const createJsonStore = require('../../lib/db/jsonStore')
const FileStore = require('../../lib/db/FileStore')

const MID = '42424242'
const id = (n) => `abcdefgh${MID}${String(n).padStart(4, '0')}`

const readAll = async (stream) => {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString()
}

describe('JsonStore (unit)', () => {
  let dir, store

  const open = async () => {
    store = createJsonStore(dir, MID, { cms: {} }, 'things')
    await store.open()
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'json-store-'))
    await open()
  })
  afterEach(async () => {
    await store.close()
    await fs.remove(dir)
  })

  it('creates and finds a record by id', async () => {
    await store.create(id(1), { _id: id(1), name: 'one' })
    expect(await store.find(id(1))).to.deep.equal({ _id: id(1), name: 'one' })
  })
  it('find returns undefined for an unknown id', async () => {
    expect(await store.find('missing')).to.equal(undefined)
  })
  it('finds by query on a record that is not the first one', async () => {
    await store.create(id(1), { _id: id(1), name: 'one' })
    await store.create(id(2), { _id: id(2), name: 'two' })
    await store.create(id(3), { _id: id(3), name: 'three' })
    expect(await store.find({ name: 'three' })).to.have.property('_id', id(3))
  })
  it('finds by nested query paths', async () => {
    await store.create(id(1), { _id: id(1), name: { en: 'a' } })
    await store.create(id(2), { _id: id(2), name: { en: 'b' } })
    expect(await store.find({ 'name.en': 'b' })).to.have.property('_id', id(2))
  })
  it('find by query returns undefined when nothing matches', async () => {
    await store.create(id(1), { _id: id(1), name: 'one' })
    expect(await store.find({ name: 'nope' })).to.equal(undefined)
  })
  it('updates an existing record', async () => {
    await store.create(id(1), { _id: id(1), name: 'one' })
    await store.update(id(1), { _id: id(1), name: 'uno' })
    expect(await store.find(id(1))).to.have.property('name', 'uno')
  })
  it('refuses to update a record created by another node', async () => {
    const foreign = 'abcdefghOTHERMID0001'
    const error = await store.update(foreign, { name: 'x' }).then(() => null, (e) => e)
    expect(error, 'an update of a foreign record throws').to.be.instanceOf(Error)
    expect(error.code).to.equal('EFOREIGN')
    expect(error.message).to.equal('Can\'t modify foreign records')
  })
  it('rejects updating a record that does not exist', async () => {
    let failed = false
    try {
      await store.update(id(9), { name: 'x' })
    } catch {
      failed = true
    }
    expect(failed).to.equal(true)
  })
  it('removes a record and throws for foreign records', async () => {
    await store.create(id(1), { _id: id(1) })
    expect(await store.remove(id(1))).to.equal(true)
    expect(await store.find(id(1))).to.equal(undefined)
    const error = await store.remove('abcdefghOTHERMID0001').then(() => null, (e) => e)
    expect(error, 'a remove of a foreign record throws').to.be.instanceOf(Error)
    expect(error.code).to.equal('EFOREIGN')
  })
  it('read returns every record, or at most `limit`', async () => {
    for (let i = 1; i <= 5; i++) await store.create(id(i), { _id: id(i), n: i })
    expect(await store.read({})).to.have.length(5)
    expect(await store.read({}, { limit: 2 })).to.have.length(2)
  })
  it('read skips internal bookkeeping keys', async () => {
    await store.create(id(1), { _id: id(1) })
    await store.create('ÿ clock', { hidden: true })
    const records = await store.read({})
    expect(records.every(r => r._id)).to.equal(true)
  })
  it('keeps records after closing and reopening the database', async () => {
    await store.create(id(1), { _id: id(1), name: 'persisted' })
    await store.close()
    await open()
    expect(await store.find(id(1))).to.have.property('name', 'persisted')
  })
  it('stores values that are not plain ASCII', async () => {
    await store.create(id(1), { _id: id(1), name: '巴黎 – Paris ✓' })
    expect(await store.find(id(1))).to.have.property('name', '巴黎 – Paris ✓')
  })
})

describe('FileStore (unit)', () => {
  let dir, store

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-store-'))
    store = new FileStore(path.join(dir, 'files'), MID, {})
  })
  afterEach(async () => {
    await fs.remove(dir)
  })

  const write = (name, content) => new Promise((resolve, reject) => {
    const w = store.write(name)
    w.on('finish', resolve)
    w.on('error', reject)
    w.end(content)
  })

  it('writes and reads a file back', async () => {
    await write('a.txt', 'hello')
    expect(await readAll(store.read('a.txt'))).to.equal('hello')
  })
  it('reports existence and lists files', async () => {
    await write('a.txt', 'x')
    expect(store.exists('a.txt')).to.equal(true)
    expect(store.exists('b.txt')).to.equal(false)
    expect(await store.list()).to.deep.equal(['a.txt'])
  })
  it('removes files and answers whether they existed', async () => {
    await write('a.txt', 'x')
    expect(await store.remove('a.txt')).to.equal(true)
    expect(await store.remove('a.txt')).to.equal(false)
    expect(store.exists('a.txt')).to.equal(false)
  })
  describe('path traversal', () => {
    const outside = () => path.join(dir, 'secret.txt')
    beforeEach(async () => {
      await fs.writeFile(outside(), 'top secret')
    })
    it('does not read outside its directory', () => {
      expect(() => store.read('../secret.txt')).to.throw(/invalid/i)
    })
    it('does not write outside its directory', async () => {
      expect(() => store.write('../evil.txt')).to.throw(/invalid/i)
      expect(fs.existsSync(path.join(dir, 'evil.txt'))).to.equal(false)
    })
    it('does not delete outside its directory', async () => {
      let failed = false
      try {
        await store.remove('../secret.txt')
      } catch {
        failed = true
      }
      expect(failed).to.equal(true)
      expect(fs.existsSync(outside())).to.equal(true)
    })
    it('does not report existence of files outside its directory', () => {
      expect(() => store.exists('../secret.txt')).to.throw(/invalid/i)
    })
    it('rejects absolute paths and nested separators', () => {
      expect(() => store.read(outside())).to.throw(/invalid/i)
      expect(() => store.read('sub/file')).to.throw(/invalid/i)
      expect(() => store.read('sub\\file')).to.throw(/invalid/i)
    })
  })
})
