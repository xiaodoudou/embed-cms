const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const sift = require('sift')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')
const { engines } = require('../helpers/engines')

const IMAGE = path.join(__dirname, '..', 'man.jpg')

// the records the queries run on
const FIXTURE = [
  { key: 'a', title: { enUS: 'Alpha', zhCN: '阿尔法' }, n: 1, flag: true, tags: ['x', 'y'], note: 'first', meta: { score: 10, list: [{ k: 1 }, { k: 2 }] } },
  { key: 'b', title: { enUS: 'Beta', zhCN: '贝塔' }, n: 2, flag: false, tags: ['y'], note: 'second line\nwith a break', meta: { score: 20, list: [{ k: 3 }] } },
  { key: 'c', title: { enUS: 'Gamma' }, n: 3, flag: true, tags: ['x', 'y', 'z'], note: 'quote " and \\ backslash', meta: { score: 30, list: [] } },
  { key: 'd', title: { enUS: 'Delta', zhCN: '德尔塔' }, n: 4.5, flag: false, tags: [], note: 'emoji 😀 and ünïcode', meta: { score: 40, list: [{ k: 1 }, { k: 5 }] } },
  { key: 'e', title: { enUS: 'alpha lower' }, n: -5, flag: true, tags: ['z'], note: 'Alpha inside', meta: { score: 5, list: [{ k: 2 }] } },
  { key: 'f', title: { enUS: 'Zeta' }, n: 0, flag: false, tags: ['x'], note: '', meta: { score: 15 } },
  { key: 'g', title: { enUS: 'Eta' }, n: 7, tags: ['x', 'z'], note: 'no flag' },
  { key: 'h', title: { enUS: 'Theta' }, n: 8, flag: true, note: 'no tags', meta: { score: 25, list: [{ k: 9 }] } },
  { key: 'i', title: { enUS: 'Iota', zhCN: '约塔' }, n: 9, flag: false, tags: ['y', 'z'], note: 'nine', meta: { score: 35, list: [{ k: 1 }] } },
  { key: 'j', title: { enUS: 'Kappa' }, n: 10, flag: true, tags: ['x', 'y'], note: 'ten', meta: { score: 45, list: [{ k: 2 }, { k: 3 }] } },
  { key: 'k', title: { enUS: 'Lambda' }, n: 11, flag: false, tags: ['z'], note: 'eleven', meta: { score: 55, list: [] } },
  { key: 'l', title: { enUS: 'Mu' }, n: 12, flag: true, tags: ['y'], note: 'twelve', meta: { score: 65, list: [{ k: 4 }] } }
]

// query -> what it is expected to find, in terms of the keys of the fixture (computed by sift on the plain objects)
const QUERIES = {
  'equality': { key: 'c' },
  'equality on a localised field': { 'title.enUS': 'Beta' },
  'equality on a boolean': { flag: true },
  'equality on a number': { n: 4.5 },
  'equality on a negative number': { n: -5 },
  'equality on an empty string': { note: '' },
  '$eq': { n: { $eq: 3 } },
  '$ne': { key: { $ne: 'a' } },
  '$gt': { n: { $gt: 8 } },
  '$gte': { n: { $gte: 9 } },
  '$lt': { n: { $lt: 1 } },
  '$lte': { n: { $lte: 1 } },
  '$gte and $lt together': { n: { $gte: 2, $lt: 8 } },
  '$in': { key: { $in: ['a', 'l', 'zz'] } },
  '$in on an array field': { tags: { $in: ['z'] } },
  '$nin': { key: { $nin: ['a', 'b', 'c', 'd', 'e', 'f'] } },
  '$all': { tags: { $all: ['x', 'y'] } },
  '$size': { tags: { $size: 2 } },
  '$mod': { n: { $mod: [5, 0] } },
  '$exists true': { flag: { $exists: true } },
  '$exists false': { meta: { $exists: false } },
  '$regex prefix': { 'title.enUS': { $regex: '^Al' } },
  '$regex is case sensitive': { note: { $regex: 'alpha' } },
  '$regex with $options i': { 'title.enUS': { $regex: '^alpha', $options: 'i' } },
  '$regex on text with a break': { note: { $regex: 'second line' } },
  '$regex with an escaped character': { note: { $regex: 'quote " and' } },
  'array element equality': { tags: 'x' },
  'nested path': { 'meta.score': { $gt: 40 } },
  '$elemMatch': { 'meta.list': { $elemMatch: { k: { $gte: 4 } } } },
  '$and': { $and: [{ flag: true }, { n: { $gt: 2 } }] },
  '$or': { $or: [{ key: 'a' }, { n: { $gt: 10 } }] },
  '$nor': { $nor: [{ flag: true }, { n: { $lt: 5 } }] },
  '$not': { n: { $not: { $gt: 3 } } },
  'several conditions': { flag: true, tags: 'x', n: { $gte: 1 } },
  'no match': { key: 'nothing' },
  'unicode equality': { 'title.zhCN': '贝塔' }
}

for (const engine of engines()) {
  describe(`driver contract: ${engine.name}`, function () {
    this.timeout(60000)
    let prepared, app, api, items

    before(async function () {
      prepared = await engine.prepare()
      if (!prepared) {
        if (process.env.REQUIRE_DATABASES) {
          throw new Error(`${engine.name} does not answer, and REQUIRE_DATABASES is set`)
        }
        // no server answered: the suite is skipped, not failed
        return this.skip()
      }
      app = await startApp({ resources: './test/helpers/contract-resources', ...prepared.options }, { keepData: true })
      api = app.cms.api()
      items = api('items')
      for (const record of FIXTURE) {
        await items.create(_.cloneDeep(record))
      }
    })
    after(async () => {
      if (app) {
        await app.close()
        fs.rmSync(app.dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
      }
      if (prepared) {
        await prepared.teardown()
      }
    })

    const keysOf = (records) => records.map(record => record.key)
    const expectedKeys = (query) => FIXTURE.filter(record => sift(query)(record)).map(record => record.key)

    describe('records', () => {
      it('creates a record with its id and timestamps, and reads it back', async () => {
        const created = await items.create({ key: 'read-back', title: { enUS: 'Read back' }, n: 42 })
        expect(created).to.include.keys('_id', '_createdAt', '_updatedAt')
        const found = await items.find(created._id)
        expect(found).to.deep.include({ key: 'read-back', n: 42 })
        expect(found.title).to.deep.equal({ enUS: 'Read back' })
        expect(found._id).to.equal(created._id)
        await items.remove(created._id)
      })

      it('lists every record once', async () => {
        const list = await items.list()
        expect(keysOf(list).filter(key => FIXTURE.some(record => record.key === key)).sort()).to.deep.equal(FIXTURE.map(record => record.key).sort())
        expect(_.uniq(list.map(record => record._id))).to.have.length(list.length)
      })

      it('updates the fields it is given and keeps the others', async () => {
        const created = await items.create({ key: 'to-update', title: { enUS: 'Before' }, n: 1, note: 'kept' })
        await new Promise(resolve => setTimeout(resolve, 5))
        const updated = await items.update(created._id, { n: 2, title: { enUS: 'After' } })
        expect(updated).to.deep.include({ key: 'to-update', n: 2, note: 'kept' })
        expect(updated._updatedAt).to.be.at.least(created._updatedAt)
        const found = await items.find(created._id)
        expect(found).to.deep.include({ key: 'to-update', n: 2, note: 'kept' })
        expect(found.title.enUS).to.equal('After')
        await items.remove(created._id)
      })

      it('removes a record, and finds nothing when it is not there', async () => {
        const created = await items.create({ key: 'to-remove', title: { enUS: 'Bye' } })
        await items.remove(created._id)
        let error
        try {
          await items.find(created._id)
        } catch (e) {
          error = e
        }
        // the store has always answered a missing id with nothing, not with an error (GET /api/:resource/:id answers it with a 404)
        expect(error, 'find after remove').to.equal(undefined)
        expect(await items.find(created._id)).to.not.be.ok
        expect(await items.exists(created._id)).to.equal(false)
        expect(await items.list({ key: 'to-remove' })).to.have.length(0)
      })

      it('finds a record by a query, or answers null', async () => {
        expect(await items.find({ key: 'c' })).to.have.property('key', 'c')
        expect(await items.find({ key: 'nothing' })).to.equal(null)
        expect(await items.exists({ key: 'c' })).to.equal(true)
        expect(await items.exists({ key: 'nothing' })).to.equal(false)
      })

      it('keeps text, numbers, booleans and nested data as they were', async () => {
        const big = 'x'.repeat(200 * 1024)
        const created = await items.create({ key: 'exotic', title: { enUS: 'tab\tand "quotes" and \\' }, n: -0.000123, flag: false, note: `line1\nline2 😀 日本語 ${big}`, tags: ['x'], meta: { deep: { deeper: [1, [2, [3]]] } } })
        const found = await items.find(created._id)
        expect(found.title.enUS).to.equal('tab\tand "quotes" and \\')
        expect(found.n).to.equal(-0.000123)
        expect(found.flag).to.equal(false)
        expect(found.note).to.equal(`line1\nline2 😀 日本語 ${big}`)
        expect(found.meta.deep.deeper).to.deep.equal([1, [2, [3]]])
        await items.remove(created._id)
      })

      it('refuses to change a record it does not have', async () => {
        let error
        try {
          await items.update('nosuchrecord0000000000000', { n: 1 })
        } catch (e) {
          error = e
        }
        expect(error).to.be.ok
      })
    })

    describe('unique keys', () => {
      it('refuses a second record with the same key', async () => {
        let error
        try {
          await items.create({ key: 'a', title: { enUS: 'Duplicate' } })
        } catch (e) {
          error = e
        }
        expect(error).to.include({ code: 400 })
        expect(error.message).to.match(/duplicated/)
        expect(await items.list({ key: 'a' })).to.have.length(1)
      })

      it('refuses to give a record the key of another', async () => {
        const created = await items.create({ key: 'unique-1' })
        let error
        try {
          await items.update(created._id, { key: 'a' })
        } catch (e) {
          error = e
        }
        expect(error).to.include({ code: 400 })
        // its own key is not a duplicate
        await items.update(created._id, { key: 'unique-1', n: 5 })
        await items.remove(created._id)
      })

      it('lets a key be used again once its record is gone', async () => {
        const first = await items.create({ key: 'reuse' })
        await items.remove(first._id)
        const second = await items.create({ key: 'reuse' })
        expect(second._id).to.not.equal(first._id)
        await items.remove(second._id)
      })
    })

    describe('queries', () => {
      for (const [name, query] of Object.entries(QUERIES)) {
        it(name, async () => {
          const found = keysOf(await items.list(_.cloneDeep(query))).filter(key => FIXTURE.some(record => record.key === key))
          expect(found.sort()).to.deep.equal(expectedKeys(query).sort())
        })
      }

      // sift wants a constructor for $type, which JSON cannot carry: the query used to end in a TypeError that left the
      // call pending forever
      it('answers an unsupported operator with an error instead of hanging', async () => {
        let error
        try {
          await items.list({ n: { $type: 'number' } })
        } catch (e) {
          error = e
        }
        expect(error, 'list with $type').to.have.property('code', 400)
      })

      it('gives the same answer through find and exists', async () => {
        const query = { n: { $gt: 8 } }
        expect(FIXTURE.map(record => record.key)).to.include(_.get(await items.find(query), 'key'))
        expect(await items.exists(query)).to.equal(true)
      })
    })

    describe('paging', () => {
      it('cuts pages that follow each other, without gaps or repeats', async () => {
        const all = keysOf(await items.list())
        const pages = []
        for (let page = 0; page < Math.ceil(all.length / 5); page++) {
          pages.push(keysOf(await items.list({}, { limit: 5, page })))
        }
        expect(_.flatten(pages)).to.deep.equal(all)
        expect(pages.slice(0, -1).every(page => page.length === 5)).to.equal(true)
        expect(await items.list({}, { limit: 5, page: 100 })).to.have.length(0)
      })

      it('pages what a query matches', async () => {
        const query = { flag: true }
        const all = keysOf(await items.list(query))
        expect(all.length).to.be.above(4)
        const first = keysOf(await items.list(query, { limit: 3, page: 0 }))
        const second = keysOf(await items.list(query, { limit: 3, page: 1 }))
        expect(first.concat(second)).to.deep.equal(all.slice(0, 6))
      })

      it('lists in the order the records were created', async () => {
        const list = keysOf(await items.list()).filter(key => FIXTURE.some(record => record.key === key))
        expect(list).to.deep.equal(FIXTURE.map(record => record.key))
      })
    })

    describe('concurrent writes', () => {
      it('let exactly one of several creates with the same key win', async () => {
        const results = await Promise.allSettled(_.times(12, i => items.create({ key: 'race', n: i })))
        expect(results.filter(result => result.status === 'fulfilled')).to.have.length(1)
        expect(results.filter(result => result.status === 'rejected').every(result => result.reason.code === 400)).to.equal(true)
        expect(await items.list({ key: 'race' })).to.have.length(1)
        await items.remove((await items.find({ key: 'race' }))._id)
      })

      it('store every one of many creates with different keys', async () => {
        const created = await Promise.all(_.times(40, i => items.create({ key: `parallel-${i}`, n: i })))
        expect(_.uniq(created.map(record => record._id))).to.have.length(40)
        expect((await items.list({ key: { $regex: '^parallel-' } }))).to.have.length(40)
        await Promise.all(created.map(record => items.remove(record._id)))
      })

      it('apply updates of different fields to one record one after the other', async () => {
        const created = await items.create({ key: 'merge' })
        await Promise.all(['a', 'b', 'c', 'd', 'e'].map((field, i) => items.update(created._id, { [`field_${field}`]: i })))
        const found = await items.find(created._id)
        expect(_.pick(found, ['field_a', 'field_b', 'field_c', 'field_d', 'field_e'])).to.deep.equal({ field_a: 0, field_b: 1, field_c: 2, field_d: 3, field_e: 4 })
        await items.remove(created._id)
      })
    })

    describe('attachments', () => {
      let record, attachment

      before(async () => {
        record = await items.create({ key: 'with-file', title: { enUS: 'With a file' } })
        attachment = await items.createAttachment(record._id, { name: 'photo', stream: fs.createReadStream(IMAGE), fields: { _filename: 'man.jpg' } })
      })
      after(async () => { await items.remove(record._id).catch(() => {}) })

      it('stores the file and the record that refers to it', async () => {
        expect(attachment).to.include({ _name: 'photo', _contentType: 'image/jpeg' })
        expect(attachment._size).to.equal(fs.statSync(IMAGE).size)
        const found = await items.find(record._id)
        expect(found._attachments.map(item => item._id)).to.deep.equal([attachment._id])
        const read = await items.findAttachment(record._id, attachment._id)
        const chunks = []
        for await (const chunk of read.stream) {
          chunks.push(chunk)
        }
        expect(Buffer.concat(chunks).equals(fs.readFileSync(IMAGE))).to.equal(true)
      })

      it('changes the order of an attachment', async () => {
        await items.updateAttachment(record._id, attachment._id, { order: 3 })
        expect((await items.find(record._id))._attachments[0].order).to.equal(3)
      })

      it('removes the file with the attachment', async () => {
        await items.removeAttachment(record._id, attachment._id)
        expect((await items.find(record._id))._attachments).to.have.length(0)
        expect(app.cms.resource('items').file.exists(attachment._id)).to.equal(false)
      })

      it('removes the files of a record with the record', async () => {
        const other = await items.create({ key: 'file-goes-with-record' })
        const file = await items.createAttachment(other._id, { name: 'photo', stream: fs.createReadStream(IMAGE), fields: { _filename: 'man.jpg' } })
        expect(app.cms.resource('items').file.exists(file._id)).to.equal(true)
        await items.remove(other._id)
        expect(app.cms.resource('items').file.exists(file._id)).to.equal(false)
      })
    })

    describe('import map', () => {
      it('tells what an import would create, update and remove', async () => {
        const map = await items.getImportMap([
          { key: 'a', n: 100, title: { enUS: 'Alpha' } },
          { key: 'brand-new', n: 1 }
        ], { key: { $in: ['a', 'b'] } })
        expect(keysOf(map.create)).to.deep.equal(['brand-new'])
        expect(keysOf(map.update)).to.deep.equal(['a'])
        expect(keysOf(map.remove)).to.include.members(['b', 'c'])
      })
    })

    describe('a restart', () => {
      it('finds the records again when the CMS is started on the same database', async function () {
        const before = keysOf(await items.list()).sort()
        await app.close()
        app = await startApp({ resources: './test/helpers/contract-resources', ...prepared.options }, { dataDir: app.dataDir, keepData: true })
        api = app.cms.api()
        items = api('items')
        expect(keysOf(await items.list()).sort()).to.deep.equal(before)
        expect(await items.find({ 'title.enUS': 'Beta' })).to.have.property('key', 'b')
      })
    })
  })
}
