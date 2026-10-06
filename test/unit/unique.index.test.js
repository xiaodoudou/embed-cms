const { expect } = require('chai')
const UUID = require('../../lib/util/uuid')
const { UniqueIndex } = require('../../lib/util/uniqueIndex')
const { startApp } = require('../helpers/app')

// the value of a unique field is checked against an index in memory, fed by every write that reaches the engine
describe('unique values (unit)', () => {
  describe('the index', () => {
    it('knows which record holds a value, forgets it when the record changes or goes', () => {
      const index = new UniqueIndex(['slug', 'title.enUS'])
      index.put('a', { slug: 'one', title: { enUS: 'One' } })
      index.put('b', { slug: 'two' })
      expect(index.idOf('slug', 'one')).to.equal('a')
      expect(index.idOf('title.enUS', 'One')).to.equal('a')
      expect(index.idOf('slug', 'two')).to.equal('b')
      expect(index.idOf('slug', 'three')).to.equal(undefined)
      index.put('a', { slug: 'three' })
      expect(index.idOf('slug', 'one')).to.equal(undefined)
      expect(index.idOf('slug', 'three')).to.equal('a')
      index.delete('b')
      expect(index.idOf('slug', 'two')).to.equal(undefined)
    })

    it('follows the writes of the engine, as objects or as the JSON text a peer sends, and not the keys of the replication', () => {
      const index = new UniqueIndex(['slug'])
      index.apply({ type: 'put', key: 'a', value: { slug: 'one' } })
      index.apply({ type: 'put', key: 'b', value: JSON.stringify({ slug: 'two' }) })
      index.apply({ type: 'put', key: '\xFF index x 1', value: 'a' })
      index.apply({ type: 'put', key: 'c', value: 'not json' })
      expect(index.idOf('slug', 'one')).to.equal('a')
      expect(index.idOf('slug', 'two')).to.equal('b')
      expect(index.idByKey.size).to.equal(2)
      index.apply({ type: 'del', key: 'a' })
      expect(index.idOf('slug', 'one')).to.equal(undefined)
    })

    it('keeps a value taken by two records as taken until both are gone', () => {
      const index = new UniqueIndex(['slug'])
      index.put('a', { slug: 'same' })
      index.put('b', { slug: 'same' })
      index.delete('a')
      expect(index.idOf('slug', 'same')).to.equal('b')
    })
  })

  describe('through the resource API', () => {
    let app, api, store
    const refused = async (promise) => {
      try {
        await promise
      } catch (error) {
        return error.message
      }
      return 'not refused'
    }

    before(async () => {
      app = await startApp({ disableJwtLogin: true })
      api = app.cms.api()('articles')
      store = app.cms._resources.articles.json
    })
    after(() => app.close())

    it('refuses a value another record holds, per language, and lets a record keep its own', async () => {
      const first = await api.create({ string: { enUS: 'alpha', zhCN: '甲' } })
      expect(await refused(api.create({ string: { enUS: 'alpha' } }))).to.match(/duplicated/)
      expect(await refused(api.create({ string: { enUS: 'beta', zhCN: '甲' } }))).to.match(/duplicated/)
      const second = await api.create({ string: { enUS: '甲', zhCN: 'alpha' } })
      expect(second._id).to.be.a('string')
      expect(await refused(api.update(second._id, { string: { enUS: 'alpha' } }))).to.match(/duplicated/)
      await api.update(first._id, { string: { enUS: 'alpha', zhCN: '甲' }, rate: 2 })
    })

    it('frees a value when its record is removed, or changes it', async () => {
      const made = await api.create({ string: { enUS: 'gamma' } })
      await api.remove(made._id)
      const again = await api.create({ string: { enUS: 'gamma' } })
      await api.update(again._id, { string: { enUS: 'delta' } })
      expect(await refused(api.create({ string: { enUS: 'delta' } }))).to.match(/duplicated/)
      const third = await api.create({ string: { enUS: 'gamma' } })
      expect(third._id).to.be.a('string')
    })

    it('sees a record written straight to the engine, as a peer writes one, and its removal', async () => {
      const id = UUID(store._id)()
      await store._db.put(id, { _id: id, string: { enUS: 'from a peer' } })
      expect(await refused(api.create({ string: { enUS: 'from a peer' } }))).to.match(/duplicated/)
      await store._db.del(id)
      const made = await api.create({ string: { enUS: 'from a peer' } })
      expect(made._id).to.be.a('string')
    })
  })
})
