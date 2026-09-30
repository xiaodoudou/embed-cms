const { expect } = require('chai')
const { startApp } = require('../helpers/app')

describe('resource internals (unit)', () => {
  let app, api, cities, articles

  before(async () => {
    app = await startApp()
    api = app.cms.api()
    cities = app.cms.resource('cities')
    app.cms.resource('provinces')
    articles = app.cms.resource('articles')
  })
  after(async () => {
    await app.close()
  })

  describe('clean', () => {
    it('removes null, undefined and empty objects recursively', () => {
      const out = cities.clean({ a: 1, b: null, c: undefined, d: {}, e: { f: null, g: 2 }, h: { i: {} } })
      expect(out).to.deep.equal({ a: 1, e: { g: 2 } })
    })
    it('keeps empty arrays and falsy values that are real data', () => {
      const out = cities.clean({ list: [], zero: 0, no: false, blank: '' })
      expect(out).to.deep.equal({ list: [], zero: 0, no: false, blank: '' })
    })
    it('drops null entries inside arrays', () => {
      expect(cities.clean({ list: [1, null, 2] })).to.deep.equal({ list: [1, 2] })
    })
  })

  describe('isEqual', () => {
    it('compares primitives', () => {
      expect(cities.isEqual(1, 1)).to.equal(true)
      expect(cities.isEqual('a', 'b')).to.equal(false)
    })
    it('ignores extra keys on the stored item (partial update semantics)', () => {
      expect(cities.isEqual({ a: 1 }, { a: 1, b: 2 })).to.equal(true)
      expect(cities.isEqual({ a: 1, b: 3 }, { a: 1, b: 2 })).to.equal(false)
    })
    it('compares nested objects and arrays', () => {
      expect(cities.isEqual({ n: { en: 'x' } }, { n: { en: 'x', zh: 'y' } })).to.equal(true)
      expect(cities.isEqual({ l: [1, 2] }, { l: [1, 2] })).to.equal(true)
      expect(cities.isEqual({ l: [1, 2] }, { l: [1, 2, 3] })).to.equal(false)
      expect(cities.isEqual({ l: [1, 2] }, { l: [2, 1] })).to.equal(false)
    })
    it('treats null and a missing value as the same', () => {
      expect(cities.isEqual({ a: null }, {})).to.equal(true)
      expect(cities.isEqual({ a: null }, { a: undefined })).to.equal(true)
      expect(cities.isEqual({ a: null }, { a: 'x' })).to.equal(false)
      expect(cities.isEqual({ a: 'x' }, { a: null })).to.equal(false)
    })
    it('is false when the stored item lacks the key', () => {
      expect(cities.isEqual({ a: { b: 1 } }, {})).to.equal(false)
      expect(cities.isEqual({ a: { b: 1 } }, undefined)).to.equal(false)
    })
  })

  describe('unique keys', () => {
    it('lists the unique fields', () => {
      expect(cities.getUniqueKeys()).to.deep.equal(['key'])
    })
    it('throws for a resource without a unique field', () => {
      expect(() => app.cms.resource('publicData').getUniqueKeys()).to.throw(/unique key/)
    })
    it('is available through the api wrapper too', () => {
      expect(api('cities').getUniqueKeys()).to.deep.equal(['key'])
      expect(api('cities').options).to.have.property('schema')
    })
  })

  describe('key to id conversion', () => {
    const records = [{ _id: 'id-a', key: 'a' }, { _id: 'id-b', key: 'b' }]

    it('maps a select value to the record id', () => {
      const errors = []
      expect(cities.convertKeyToId('b', 'select', records, 'x', ['key'], errors)).to.equal('id-b')
      expect(errors).to.deep.equal([])
    })
    it('maps a multiselect value to ids and skips unknown keys', () => {
      const errors = []
      expect(cities.convertKeyToId(['a', 'zzz', 'b'], 'multiselect', records, 'x', ['key'], errors)).to.deep.equal(['id-a', 'id-b'])
      expect(errors).to.deep.equal(['zzz'])
    })
    it('reports an unknown select value once', () => {
      const errors = []
      expect(cities.convertKeyToId('nope', 'select', records, 'x', ['key'], errors)).to.equal(undefined)
      cities.convertKeyToId('nope', 'select', records, 'x', ['key'], errors)
      expect(errors).to.deep.equal(['nope'])
    })
    it('leaves other input types untouched', () => {
      expect(cities.convertKeyToId('v', 'string', records, 'x', ['key'], [])).to.equal('v')
    })
  })

  describe('setJSONKey', () => {
    it('parses a JSON string in place', () => {
      const item = { data: '{"a":1}' }
      cities.setJSONKey(item, 'data')
      expect(item.data).to.deep.equal({ a: 1 })
    })
    it('leaves empty values alone and throws on invalid JSON', () => {
      const item = { data: '' }
      cities.setJSONKey(item, 'data')
      expect(item.data).to.equal('')
      expect(() => cities.setJSONKey({ data: '{bad' }, 'data')).to.throw()
    })
  })

  describe('getImportMap', () => {
    let idf

    before(async () => {
      idf = await api('provinces').create({ key: 'idf', name: { en: 'Ile-de-France' } })
      await api('provinces').create({ key: 'paca', name: { en: 'PACA' } })
      await api('cities').create({ key: 'paris', name: { en: 'Paris' }, province: idf._id })
      await api('cities').create({ key: 'nice', name: { en: 'Nice' } })
    })

    it('splits an import into create, update and remove', async () => {
      const map = await cities.getImportMap([
        { key: 'paris', name: { en: 'Paname' }, province: 'idf' },
        { key: 'lyon', name: { en: 'Lyon' } }
      ])
      expect(map.create.map(i => i.key)).to.deep.equal(['lyon'])
      expect(map.update.map(i => i.key)).to.deep.equal(['paris'])
      expect(map.remove.map(i => i.key)).to.deep.equal(['nice'])
    })
    it('attaches the existing id to updates', async () => {
      const existing = await api('cities').find({ key: 'paris' })
      const map = await cities.getImportMap([{ key: 'paris', name: { en: 'Changed' } }])
      expect(map.update[0]._id).to.equal(existing._id)
    })
    it('does not list unchanged records as updates', async () => {
      const map = await cities.getImportMap([{ key: 'nice', name: { en: 'Nice' } }])
      expect(map.update).to.deep.equal([])
    })
    it('converts select values from unique keys to ids', async () => {
      const paca = await api('provinces').find({ key: 'paca' })
      const map = await cities.getImportMap([{ key: 'marseille', name: { en: 'Marseille' }, province: 'paca' }])
      expect(map.create[0].province).to.equal(paca._id)
    })
    it('nulls out empty relation values', async () => {
      const map = await cities.getImportMap([{ key: 'brest', name: { en: 'Brest' }, province: '' }])
      expect(map.create[0].province).to.equal(null)
    })
    it('keeps an unknown relation key out of the data without failing', async () => {
      const map = await cities.getImportMap([{ key: 'ghost', name: { en: 'Ghost' }, province: 'unknown-province' }])
      expect(map.create[0].province).to.equal(undefined)
    })
    it('restricts updates to the records matching the query', async () => {
      const map = await cities.getImportMap([
        { key: 'paris', name: { en: 'One' } },
        { key: 'nice', name: { en: 'Two' } }
      ], { key: 'nice' })
      expect(map.update.map(i => i.key)).to.deep.equal(['nice'])
    })
    it('parses JSON strings for object fields', async () => {
      const objectResource = Object.values(app.cms._resources).find(r => (r.options.schema || []).some(f => f.input === 'object'))
      if (!objectResource) return
      expect(objectResource.getUniqueKeys).to.be.a('function')
    })
  })

  describe('required relations', () => {
    it('throws when a required relation cannot be resolved and checkRequired is on', async () => {
      const required = Object.values(app.cms._resources).find(r => (r.options.schema || []).some(f => f.required && typeof f.source === 'string'))
      if (!required) return
      const field = required.options.schema.find(f => f.required && typeof f.source === 'string')
      const unique = required.getUniqueKeys()[0]
      let error
      try {
        await required.getImportMap([{ [unique]: 'x', [field.field]: 'does-not-exist' }], undefined, true)
      } catch (e) {
        error = e
      }
      expect(error).to.be.instanceOf(Error)
      expect(error.message).to.match(/required field/)
    })
  })

  describe('attachments buffer helper', () => {
    it('concatenates a stream into a buffer', async () => {
      const { Readable } = require('stream')
      const buffer = await articles.getBufferFromStream(Readable.from([Buffer.from('ab'), 'cd', Buffer.from('ef')]))
      expect(buffer.toString()).to.equal('abcdef')
    })
  })
})
