const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect } = require('chai')
const JsonDOWN = require('../../lib/db/leveldown/jsondown')

const create = (location) => new JsonDOWN(location, { keyEncoding: 'utf8', valueEncoding: 'json' })
const keysOf = async (db, options) => {
  const keys = []
  for await (const [key] of db.iterator(options)) {
    keys.push(key)
  }
  return keys
}

describe('json file store (unit)', () => {
  let dir
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-jsondown-')) })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  describe('durability', () => {
    // scan() and recordCount() read the map directly: right after the store is created (a CMS that starts on existing
    // data) they used to answer from the empty map, before the file was read
    it('answers a scan and a count made while it is still opening from the file, not from an empty map', async () => {
      const file = path.join(dir, 'db.json')
      const first = create(file)
      await first.open()
      await first.put('a', { n: 1 })
      await first.put('b', { n: 2 })
      await first.close()
      const db = create(file)
      const [records, count] = await Promise.all([db.scan(), db.recordCount()])
      expect(records.map(record => record.n)).to.deep.equal([1, 2])
      expect(count).to.equal(2)
      await db.close()
    })

    it('keeps a file it cannot read aside instead of overwriting it', async () => {
      const file = path.join(dir, 'db.json')
      fs.writeFileSync(file, '{"$a": "{\\"n\\":1}", "$b": "{\\"n\\"')
      const db = create(file)
      await db.open()
      await db.put('c', { n: 3 })
      await db.close()
      const kept = fs.readdirSync(dir).filter(name => name.startsWith('db.json.corrupt-'))
      expect(kept).to.have.length(1)
      expect(fs.readFileSync(path.join(dir, kept[0]), 'utf8')).to.include('"$b"')
      // the store itself started empty and works
      const reopened = create(file)
      await reopened.open()
      expect(await keysOf(reopened)).to.deep.equal(['c'])
      await reopened.close()
    })

    it('writes the file once per flush, through a temporary file that is renamed over it', async () => {
      const file = path.join(dir, 'db.json')
      const db = create(file)
      await db.open()
      const opened = []
      const original = fs.promises.open
      fs.promises.open = (target, ...rest) => { opened.push(String(target)); return original.call(fs.promises, target, ...rest) }
      try {
        await db.put('a', { n: 1 })
        await db.close()
      } finally {
        fs.promises.open = original
      }
      expect(opened).to.have.length(1)
      expect(opened[0]).to.not.equal(file)
      expect(opened[0].startsWith(file)).to.equal(true)
      expect(fs.readdirSync(dir)).to.deep.equal(['db.json'])
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).to.have.property('$a')
    })

    it('handles two flushes that overlap (they must not share the temporary file)', async () => {
      const file = path.join(dir, 'db.json')
      const db = create(file)
      await db.open()
      await db.put('a', { n: 1 })
      db._dirty = true
      await Promise.all([db._persist(), db._persist(), db._persist()])
      await db.close()
      expect(fs.readdirSync(dir)).to.deep.equal(['db.json'])
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).to.have.property('$a')
    })

    it('leaves no temporary file when the write fails', async () => {
      const file = path.join(dir, 'db.json')
      const db = create(file)
      await db.open()
      await db.put('a', { n: 1 })
      const original = fs.promises.rename
      fs.promises.rename = () => Promise.reject(new Error('disk full'))
      try {
        await db.close()
      } finally {
        fs.promises.rename = original
      }
      expect(fs.readdirSync(dir).filter(name => name.endsWith('.tmp'))).to.deep.equal([])
    })
  })

  describe('iterator ranges', () => {
    let db
    beforeEach(async () => {
      db = create(path.join(dir, 'db.json'))
      await db.open()
      for (const key of ['a', 'b', 'c', 'd']) {
        await db.put(key, { key })
      }
    })
    afterEach(async () => { await db.close() })

    it('honours gt, gte, lt and lte', async () => {
      expect(await keysOf(db, { gt: 'b' })).to.deep.equal(['c', 'd'])
      expect(await keysOf(db, { gte: 'b' })).to.deep.equal(['b', 'c', 'd'])
      expect(await keysOf(db, { lt: 'c' })).to.deep.equal(['a', 'b'])
      expect(await keysOf(db, { lte: 'c' })).to.deep.equal(['a', 'b', 'c'])
      expect(await keysOf(db, { gte: 'b', lt: 'd' })).to.deep.equal(['b', 'c'])
    })

    it('reverses inside the range, and limits after reversing', async () => {
      expect(await keysOf(db, { lt: 'd', reverse: true })).to.deep.equal(['c', 'b', 'a'])
      expect(await keysOf(db, { lt: 'd', reverse: true, limit: 2 })).to.deep.equal(['c', 'b'])
      expect(await keysOf(db, { limit: 0 })).to.deep.equal([])
    })
  })

  describe('prewrite hooks', () => {
    it('run once for a put, a del and each operation of a batch', async () => {
      const db = create(path.join(dir, 'db.json'))
      await db.open()
      const seen = []
      db.hooks.prewrite.add((op) => seen.push(`${op.type}:${op.key}`))
      await db.put('a', { n: 1 })
      await db.del('a')
      await db.batch([{ type: 'put', key: 'b', value: { n: 2 } }, { type: 'del', key: 'c' }])
      expect(seen).to.deep.equal(['put:a', 'del:a', 'put:b', 'del:c'])
      await db.close()
    })

    it('can add operations, which are stored and not hooked again', async () => {
      const db = create(path.join(dir, 'db.json'))
      await db.open()
      const seen = []
      db.hooks.prewrite.add((op, batch) => {
        seen.push(op.key)
        if (!op.key.startsWith('meta')) {
          batch.add({ type: 'put', key: `meta ${op.key}`, value: 'seen' })
        }
      })
      await db.put('a', { n: 1 })
      expect(await keysOf(db)).to.deep.equal(['a', 'meta a'])
      expect(seen).to.deep.equal(['a'])
      await db.close()
    })
  })

  describe('order and ranges', () => {
    // mulberry32
    const random = (seed) => () => {
      seed |= 0
      seed = seed + 0x6D2B79F5 | 0
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
      return ((t ^ t >>> 14) >>> 0) / 4294967296
    }

    it('keeps its keys in order through puts, deletes and batches of any size, and finds every range', async () => {
      const db = create(path.join(dir, 'db.json'))
      await db.open()
      const next = random(11)
      const reference = new Set()
      const key = () => `k${String(Math.floor(next() * 300)).padStart(3, '0')}`
      const check = async (label) => {
        const sorted = [...reference].sort()
        expect(await keysOf(db), label).to.deep.equal(sorted)
        for (let i = 0; i < 6; i++) {
          const [a, b] = [key(), key()].sort()
          const options = { ...(next() > 0.5 ? { gte: a } : { gt: a }), ...(next() > 0.5 ? { lte: b } : { lt: b }), reverse: next() > 0.5, limit: next() > 0.5 ? Math.floor(next() * 20) : -1 }
          let expected = sorted.filter(k => (options.gte === undefined || k >= options.gte) && (options.gt === undefined || k > options.gt) && (options.lte === undefined || k <= options.lte) && (options.lt === undefined || k < options.lt))
          if (options.reverse) expected = expected.reverse()
          if (options.limit > -1) expected = expected.slice(0, options.limit)
          expect(await keysOf(db, options), `${label} ${JSON.stringify(options)}`).to.deep.equal(expected)
        }
      }
      for (let round = 0; round < 30; round++) {
        const kind = next()
        if (kind < 0.4) {
          const k = key()
          await db.put(k, { k })
          reference.add(k)
        } else if (kind < 0.6) {
          const k = key()
          await db.del(k)
          reference.delete(k)
        } else {
          const operations = Array.from({ length: next() > 0.5 ? 10 : 150 }, () => ({ type: next() > 0.3 ? 'put' : 'del', key: key(), value: { n: 1 } }))
          await db.batch(operations)
          for (const op of operations) {
            op.type === 'put' ? reference.add(op.key) : reference.delete(op.key)
          }
        }
        await check(`round ${round}`)
      }
      await db.close()
    })

    it('does not return a key that was deleted while it was being iterated', async () => {
      const db = create(path.join(dir, 'db.json'))
      await db.open()
      for (const k of ['a', 'b', 'c']) {
        await db.put(k, { k })
      }
      const seen = []
      for await (const [k] of db.iterator({})) {
        seen.push(k)
        if (k === 'a') {
          await db.del('b')
        }
      }
      expect(seen).to.deep.equal(['a', 'c'])
      await db.close()
    })
  })

  describe('file format', () => {
    it('is the text JSON.stringify(data, null, 2) gives, so files written by earlier versions and by this one read the same', async () => {
      const file = path.join(dir, 'db.json')
      const db = create(file)
      await db.open()
      const records = { a: { text: 'quote " and \\ and \n', n: 1 }, b: { emoji: '😀', nested: { list: [1, 2] } }, c: { k: 'v' } }
      for (const [k, v] of Object.entries(records)) {
        await db.put(k, v)
      }
      await db.close()
      const expected = JSON.stringify(Object.fromEntries(Object.entries(records).map(([k, v]) => [`$${k}`, JSON.stringify(v)])), null, 2)
      expect(fs.readFileSync(file, 'utf8')).to.equal(expected)
    })

    it('writes an empty store as {}', async () => {
      const file = path.join(dir, 'db.json')
      const db = create(file)
      await db.open()
      await db.put('a', { n: 1 })
      await db.del('a')
      await db.close()
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).to.deep.equal({})
    })

    it('flushes in slices, so the event loop is not held for the whole file', async () => {
      const file = path.join(dir, 'db.json')
      const db = create(file)
      await db.open()
      const operations = Array.from({ length: 6000 }, (_, i) => ({ type: 'put', key: `key${i}`, value: { i, text: 'x'.repeat(200) } }))
      await db.batch(operations)
      let turns = 0
      const timer = setInterval(() => turns++, 0)
      await db._persist()
      clearInterval(timer)
      expect(turns, 'the event loop ran during the flush').to.be.above(0)
      expect(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')))).to.have.length(6000)
      await db.close()
    })

    it('waits longer between flushes once a flush has taken long', async () => {
      const db = create(path.join(dir, 'db.json'))
      await db.open()
      expect(db._persistDelay).to.equal(50)
      await db.batch(Array.from({ length: 50 }, (_, i) => ({ type: 'put', key: `k${i}`, value: { i } })))
      db._dirty = true
      const original = Date.now
      let calls = 0
      // the flush starts at t0 and ends 400 ms later
      Date.now = () => (calls++ === 0 ? 1000 : 1400)
      try {
        await db._persist()
      } finally {
        Date.now = original
      }
      expect(db._persistDelay).to.equal(800)
      await db.close()
    })
  })

  describe('scan and count', () => {
    it('parses the records that hold the needles, skips internal keys, and counts', async () => {
      const db = create(path.join(dir, 'db.json'))
      await db.open()
      await db.put('a', { name: 'alpha', n: 1 })
      await db.put('b', { name: 'beta', n: 2 })
      await db.put('c', { name: 'alpha', n: 3 })
      await db.put('\xFF index x 1', 'a')
      expect(await db.recordCount()).to.equal(3)
      expect((await db.scan()).map(r => r.n)).to.deep.equal([1, 2, 3])
      expect((await db.scan({ needles: [['"alpha"']] })).map(r => r.n)).to.deep.equal([1, 3])
      expect((await db.scan({ needles: [['"alpha"'], ['3']] })).map(r => r.n)).to.deep.equal([3])
      expect((await db.scan({ needles: [['"nothing"', '"beta"']] })).map(r => r.n)).to.deep.equal([2])
      expect((await db.scan({ predicate: r => r.n > 1, limit: 1 })).map(r => r.n)).to.deep.equal([2])
      await db.close()
    })
  })
})
