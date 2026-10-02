const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect } = require('chai')
const { createLocalEngine, LOCAL_ENGINES } = require('../../lib/db/local/localEngines')
const { migrateStore } = require('../../lib/util/migrateStore')
const createJsonStore = require('../../lib/db/jsonStore')

const OPTIONS = { keyEncoding: 'utf8', valueEncoding: 'json' }
const RECORDS = [
  ['a1', { n: 1, title: { enUS: 'Alpha' } }],
  ['a2', { n: 2, title: { enUS: 'Beta' } }],
  ['a3', { n: 3, title: { enUS: 'Gamma' } }],
  ['b1', { n: 4, title: { enUS: 'Alpha again' } }]
]
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-engine-'))
const remove = (folder) => fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })

describe('local storage engines', () => {
  Object.keys(LOCAL_ENGINES).forEach((type) => {
    describe(type, () => {
      let folder, db

      beforeEach(async () => {
        folder = tmp()
        db = createLocalEngine(type, folder, OPTIONS)
        await db.open()
        for (const [key, value] of RECORDS) {
          await db.put(key, value)
        }
        // the keys of the replication sort after every record
        await db.put('\xFF clock abc', 'ts-1')
        await db.put('\xFF index abc ts-1', 'a1')
      })
      afterEach(async () => {
        await db.close()
        remove(folder)
      })

      it('reads back what was written, and says when a key is missing', async () => {
        expect(await db.get('a2')).to.deep.equal({ n: 2, title: { enUS: 'Beta' } })
        let error
        try {
          await db.get('nope')
        } catch (e) {
          error = e
        }
        expect(error).to.be.an('error')
      })

      it('replaces a record and removes one', async () => {
        await db.put('a2', { n: 20 })
        await db.del('a3')
        expect(await db.get('a2')).to.deep.equal({ n: 20 })
        expect(await db.recordCount()).to.equal(3)
      })

      it('lists keys in order, within a range, in reverse and with a limit', async () => {
        const keys = (options) => db.keys(options).all()
        expect(await keys({ lt: '\xFF' })).to.deep.equal(['a1', 'a2', 'a3', 'b1'])
        expect(await keys({ gte: 'a2', lte: 'b1' })).to.deep.equal(['a2', 'a3', 'b1'])
        expect(await keys({ gt: 'a2', lt: 'b1' })).to.deep.equal(['a3'])
        expect(await keys({ lt: '\xFF', reverse: true, limit: 2 })).to.deep.equal(['b1', 'a3'])
      })

      it('pages a long range without losing or repeating a key', async () => {
        const batch = []
        for (let i = 0; i < 700; i++) {
          batch.push({ type: 'put', key: `k${String(i).padStart(4, '0')}`, value: { i } })
        }
        await db.batch(batch)
        const keys = await db.keys({ gte: 'k0000', lte: 'k9999' }).all()
        expect(keys).to.have.length(700)
        expect(keys[0]).to.equal('k0000')
        expect(keys[699]).to.equal('k0699')
        expect(await db.keys({ gte: 'k0000', lte: 'k9999', reverse: true, limit: 300 }).all()).to.have.length(300)
      })

      it('counts and scans the records, not the keys of the replication', async () => {
        expect(await db.recordCount()).to.equal(4)
        const all = await db.scan()
        expect(all).to.have.length(4)
        expect(all[0]).to.deep.equal({ n: 1, title: { enUS: 'Alpha' } })
      })

      it('narrows a scan by needles, a predicate and a limit', async () => {
        expect(await db.scan({ needles: [['"Alpha']] })).to.have.length(2)
        expect(await db.scan({ needles: [['"Alpha'], ['"n":4']] })).to.have.length(1)
        expect(await db.scan({ predicate: (record) => record.n > 1 })).to.have.length(3)
        expect(await db.scan({ limit: 2 })).to.have.length(2)
      })

      it('keeps the content when it is closed and opened again', async () => {
        await db.close()
        db = createLocalEngine(type, folder, OPTIONS)
        await db.open()
        expect(await db.recordCount()).to.equal(4)
        expect(await db.get('\xFF clock abc')).to.equal('ts-1')
      })

      it('runs the hooks the replication registers, and the writes they add', async () => {
        db.hooks.prewrite.add((change, batch) => {
          if (!change.key.startsWith('\xFF')) {
            batch.add({ type: 'put', key: `\xFF index x ${change.key}`, value: change.key })
          }
        })
        await db.put('c1', { n: 9 })
        expect(await db.get('\xFF index x c1')).to.equal('c1')
      })
    })
  })

  describe('the choice in the configuration', () => {
    const store = (type) => {
      const folder = tmp()
      const json = createJsonStore(folder, 'SERVER-1', { cms: { dbEngine: type ? { type } : undefined } }, 'items')
      return { folder, json }
    }

    it('opens each local engine, and defaults to LevelDB', async () => {
      for (const [type, artifact] of [[undefined, 'leveldb'], ['jsondown', 'db.json'], ['sqlite', 'db.sqlite'], ['leveldb', 'leveldb']]) {
        const { folder, json } = store(type)
        await json.open()
        await json.create('SERVER-1~1', { _id: 'SERVER-1~1', n: 1 })
        await json.close()
        expect(fs.readdirSync(folder), String(type)).to.include(artifact)
        remove(folder)
      }
    })

    it('keeps the db.json of content that was there before the default changed', async () => {
      const folder = tmp()
      const first = createJsonStore(folder, 'SERVER-1', { cms: { dbEngine: { type: 'jsondown' } } }, 'items')
      await first.open()
      await first.create('SERVER-1~1', { _id: 'SERVER-1~1', n: 1 })
      await first.close()
      // no engine configured: the folder holds a db.json and no LevelDB store, so the file is still the store
      const again = createJsonStore(folder, 'SERVER-1', { cms: {} }, 'items')
      await again.open()
      expect(await again.find('SERVER-1~1')).to.deep.equal({ _id: 'SERVER-1~1', n: 1 })
      await again.close()
      expect(fs.readdirSync(folder)).to.not.include('leveldb')
      remove(folder)
    })

    it('refuses a type it does not know, instead of starting an empty store', () => {
      expect(() => store('sqllite')).to.throw(/Unknown dbEngine.type "sqllite"/)
    })
  })

  describe('migrateStore', () => {
    let data

    // a store with records and the replication's own keys, written the way the CMS writes them
    const seed = async (type, resource = 'items') => {
      const folder = path.join(data, resource, 'json')
      fs.mkdirSync(folder, { recursive: true })
      const db = createLocalEngine(type, folder, { keyEncoding: 'utf8', valueEncoding: 'utf8' })
      await db.open()
      await db.batch([
        ...RECORDS.map(([key, value]) => ({ type: 'put', key, value: JSON.stringify(value) })),
        { type: 'put', key: '\xFF clock abc', value: JSON.stringify('ts-1') },
        { type: 'put', key: '\xFF index abc ts-1', value: JSON.stringify('a1') }
      ])
      await db.close()
      return folder
    }
    const dump = async (type, folder) => {
      const db = createLocalEngine(type, folder, { keyEncoding: 'utf8', valueEncoding: 'utf8' })
      await db.open()
      const entries = await db.iterator().all()
      await db.close()
      return entries
    }

    beforeEach(() => { data = tmp() })
    afterEach(() => remove(data))

    const types = Object.keys(LOCAL_ENGINES)
    types.flatMap(from => types.filter(to => to !== from).map(to => [from, to])).forEach(([from, to]) => {
      it(`moves every entry from ${from} to ${to}, the replication keys too`, async () => {
        const folder = await seed(from)
        const before = await dump(from, folder)
        const result = await migrateStore({ data, from, to })
        expect(result).to.deep.equal({ stores: 1, entries: 6, skipped: [] })
        expect(await dump(to, folder)).to.deep.equal(before)
        // the old files are left in place
        expect(fs.existsSync(path.join(folder, LOCAL_ENGINES[from].artifact))).to.equal(true)
      })
    })

    it('goes through every resource, namespaces included', async () => {
      await seed('jsondown', 'items')
      await seed('jsondown', path.join('shop', 'orders'))
      const result = await migrateStore({ data, from: 'jsondown', to: 'sqlite' })
      expect(result.stores).to.equal(2)
    })

    it('writes nothing in a dry run', async () => {
      const folder = await seed('jsondown')
      const result = await migrateStore({ data, from: 'jsondown', to: 'sqlite', dryRun: true })
      expect(result.entries).to.equal(6)
      expect(fs.existsSync(path.join(folder, 'db.sqlite'))).to.equal(false)
    })

    it('skips a resource that already has a store of the target engine', async () => {
      const folder = await seed('jsondown')
      await migrateStore({ data, from: 'jsondown', to: 'sqlite' })
      const again = await migrateStore({ data, from: 'jsondown', to: 'sqlite' })
      expect(again.stores).to.equal(0)
      expect(again.skipped).to.deep.equal([folder])
    })

    it('refuses engines it does not know and the same engine twice', async () => {
      let error
      try {
        await migrateStore({ data, from: 'jsondown', to: 'mongodb' })
      } catch (e) {
        error = e
      }
      expect(error.message).to.match(/Unknown engine "mongodb"/)
      try {
        await migrateStore({ data, from: 'sqlite', to: 'sqlite' })
      } catch (e) {
        error = e
      }
      expect(error.message).to.match(/same engine/)
    })
  })
})
