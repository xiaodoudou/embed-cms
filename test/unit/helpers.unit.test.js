const { expect } = require('chai')
const h = require('../../lib/helpers')

describe('helpers (unit)', () => {
  describe('resizeOptionsValid', () => {
    it('accepts WxH, autoxH and Wxauto', () => {
      expect(h.resizeOptionsValid('100x200')).to.equal(true)
      expect(h.resizeOptionsValid('autox200')).to.equal(true)
      expect(h.resizeOptionsValid('100xauto')).to.equal(true)
    })
    it('rejects sizes above the maximum output dimension (memory DoS)', () => {
      expect(h.resizeOptionsValid('8192x8192')).to.equal(true)
      expect(h.resizeOptionsValid('8193x100')).to.equal(false)
      expect(h.resizeOptionsValid('100x8193')).to.equal(false)
      expect(h.resizeOptionsValid('autox99999')).to.equal(false)
      expect(h.resizeOptionsValid('99999xauto')).to.equal(false)
    })
    it('rejects autoxauto, zero, garbage and 6-digit sizes', () => {
      expect(h.resizeOptionsValid('autoxauto')).to.equal(false)
      expect(h.resizeOptionsValid('0x100')).to.equal(false)
      expect(h.resizeOptionsValid('abc')).to.equal(false)
      expect(h.resizeOptionsValid('100000x100')).to.equal(false)
    })
  })

  describe('merge', () => {
    afterEach(() => {
      // a successful pollution would otherwise leak into every later test
      delete Object.prototype.polluted
      delete Object.prototype.polluted2
    })
    it('deep merges objects and treats arrays as values', () => {
      const out = h.merge({ a: { b: 1, c: 2 }, l: [1] }, { a: { b: 3 }, l: [2, 3] })
      expect(out).to.deep.equal({ a: { b: 3, c: 2 }, l: [2, 3] })
    })
    it('does not pollute Object.prototype via __proto__', () => {
      h.merge({}, JSON.parse('{"__proto__":{"polluted":"yes"}}'))
      expect({}.polluted).to.equal(undefined)
    })
    it('does not pollute via constructor.prototype', () => {
      try {
        h.merge({}, JSON.parse('{"constructor":{"prototype":{"polluted2":"yes"}}}'))
      } catch { /* throwing is acceptable, polluting is not */ }
      expect({}.polluted2).to.equal(undefined)
    })
  })

  describe('filterResults', () => {
    const run = (query, records) => new Promise((resolve, reject) => {
      const context = {
        params: { query, options: {} },
        _result: records,
        // the filtered list is handed to the next after hook through context._result
        next: () => resolve(context._result),
        result: r => { context._result = r; resolve(r) },
        error: reject
      }
      h.filterResults(context)
    })
    const records = [{ _id: '1', title: 'Alpha' }, { _id: '2', title: 'Beta' }]

    it('filters with comparison operators', async () => {
      expect(await run({ title: 'Beta' }, records)).to.have.length(1)
    })
    it('supports $regex', async () => {
      expect(await run({ title: { $regex: '^Al' } }, records)).to.have.length(1)
    })
    it('$regex is case-sensitive unless $options contains i', async () => {
      expect(await run({ title: { $regex: '^al' } }, records)).to.have.length(0)
      expect(await run({ title: { $regex: '^al', $options: 'i' } }, records)).to.have.length(1)
    })
    it('rejects the $where operator (arbitrary code execution)', async () => {
      global.__whereExecuted = false
      let threw = false
      try {
        await run({ $where: 'global.__whereExecuted = true; return true' }, records)
      } catch {
        threw = true
      }
      expect(global.__whereExecuted, '$where must never execute').to.equal(false)
      expect(threw).to.equal(true)
    })
    it('rejects nested $where', async () => {
      global.__whereExecuted = false
      try {
        await run({ $or: [{ $where: 'global.__whereExecuted = true; return true' }] }, records)
      } catch { /* expected */ }
      expect(global.__whereExecuted).to.equal(false)
    })
  })
})
