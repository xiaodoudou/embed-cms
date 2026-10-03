const { expect } = require('chai')
const { startApp } = require('../helpers/app')

// api('x').bulk(work): the writes made in work do not wait for the disk one by one, the disk is waited for once at the end
describe('resource API: bulk writes (unit)', () => {
  let app, api, store, writes

  before(async () => {
    app = await startApp({ resources: './test/fixtures/syncResources', disableJwtLogin: true })
    api = app.cms.api()('tags')
    store = app.cms._resources.tags.json
    // what reaches the engine: the key and whether the write waits for the disk
    const put = store._db.put.bind(store._db)
    store._db.put = (key, value, options) => {
      writes.push({ key, sync: !!(options && options.sync) })
      return put(key, value, options)
    }
  })
  beforeEach(() => {
    writes = []
  })
  after(() => app.close())

  const records = (list) => list.filter(write => !write.key.startsWith('\xFF'))
  const flushes = (list) => list.filter(write => write.key === '\xFF flush')

  it('waits for the disk at every write outside bulk', async () => {
    const made = await api.create({ name: 'one' })
    await api.update(made._id, { name: 'one more' })
    expect(records(writes).map(write => write.sync)).to.deep.equal([true, true])
    expect(flushes(writes)).to.have.length(0)
  })

  it('waits for the disk once, at the end, for the writes inside bulk', async () => {
    const answer = await api.bulk(async () => {
      for (let i = 0; i < 20; i++) {
        await api.create({ name: `bulk ${i}` })
      }
      const [first] = await api.list({ name: 'bulk 0' })
      await api.update(first._id, { name: 'bulk 0 changed' })
      return 'done'
    })
    expect(answer).to.equal('done')
    expect(records(writes)).to.have.length(21)
    expect(records(writes).every(write => write.sync === false)).to.equal(true)
    expect(flushes(writes).map(write => write.sync)).to.deep.equal([true])
    // the flush comes last
    expect(writes[writes.length - 1].key).to.equal('\xFF flush')
    expect(await api.list({ name: 'bulk 0 changed' })).to.have.length(1)
    expect(await api.list({ name: { $regex: '^bulk' } })).to.have.length(20)
  })

  it('waits for the disk once when bulks are nested, when the outermost one ends', async () => {
    await api.bulk(async () => {
      await api.create({ name: 'outer' })
      await api.bulk(async () => {
        await api.create({ name: 'inner' })
      })
      expect(flushes(writes)).to.have.length(0)
      await api.create({ name: 'outer again' })
    })
    expect(records(writes).map(write => write.sync)).to.deep.equal([false, false, false])
    expect(flushes(writes)).to.have.length(1)
  })

  it('still waits for the disk when work throws, and throws the same', async () => {
    let caught
    try {
      await api.bulk(async () => {
        await api.create({ name: 'before the throw' })
        throw new Error('stop')
      })
    } catch (error) {
      caught = error
    }
    expect(caught.message).to.equal('stop')
    expect(flushes(writes)).to.have.length(1)
    expect(await api.list({ name: 'before the throw' })).to.have.length(1)
    // and the writes after it wait for the disk again
    await api.create({ name: 'after' })
    expect(records(writes).pop().sync).to.equal(true)
  })

  it('leaves the records alone: the flush is an internal key that neither list nor the record count see', async () => {
    const before = await api.list()
    await api.bulk(async () => {})
    expect(flushes(writes)).to.have.length(1)
    expect(await api.list()).to.deep.equal(before)
    expect(await store._db.recordCount()).to.equal(before.length)
  })
})
