const sift = require('sift')
const { expect } = require('chai')
const queryNeedles = require('../../lib/util/queryNeedles')

// mulberry32
const random = (seed) => () => {
  seed |= 0
  seed = seed + 0x6D2B79F5 | 0
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

const holdsNeedles = (text, groups) => groups.every(group => group.some(needle => text.includes(needle)))

describe('query needles (unit)', () => {
  describe('what is looked for', () => {
    it('is the json token of an equality, of $eq and of the values of $in', () => {
      expect(queryNeedles({ sku: 'A-1' })).to.deep.equal([['"A-1"']])
      expect(queryNeedles({ price: 12.5, active: true })).to.deep.equal([['12.5'], ['true']])
      expect(queryNeedles({ sku: { $eq: 'x' } })).to.deep.equal([['"x"']])
      expect(queryNeedles({ category: { $in: ['a', 'b'] } })).to.deep.equal([['"a"', '"b"']])
    })

    it('escapes what json escapes', () => {
      expect(queryNeedles({ title: 'say "hi"\n' })).to.deep.equal([[JSON.stringify('say "hi"\n')]])
    })

    it('is the literal of a case sensitive regular expression made of plain characters', () => {
      expect(queryNeedles({ name: { $regex: '^Alpha' } })).to.deep.equal([['Alpha']])
      expect(queryNeedles({ name: { $regex: 'Alpha Bravo' } })).to.deep.equal([['Alpha Bravo']])
    })

    it('is nothing for what text cannot tell', () => {
      for (const query of [
        {}, null, 'x', [],
        { price: { $gt: 1 } },
        { name: { $regex: '^Alpha', $options: 'i' } },
        { name: { $regex: 'a.*b' } },
        { name: { $regex: 'ab' } },
        { x: null },
        { x: { $in: ['a', null] } },
        { x: { $in: [] } },
        { $or: [{ a: 1 }, { b: 2 }] },
        { x: { $ne: 'a' } },
        { x: { a: 1 } }
      ]) {
        expect(queryNeedles(query), JSON.stringify(query)).to.deep.equal([])
      }
    })

    it('goes into $and', () => {
      expect(queryNeedles({ $and: [{ a: 'x' }, { $and: [{ b: 2 }] }], c: 'z' })).to.deep.equal([['"x"'], ['2'], ['"z"']])
    })
  })

  describe('as a necessary condition', () => {
    const words = ['alpha', 'beta', 'gamma', 'Alpha 12', 'a"b', 'back\\slash', 'ünï', '日本', 'x']
    const pick = (next, list) => list[Math.floor(next() * list.length)]

    const record = (next) => ({
      _id: `id${Math.floor(next() * 1e9)}`,
      s: pick(next, words),
      n: Math.floor(next() * 5),
      b: next() > 0.5,
      nested: { s: pick(next, words), list: [pick(next, words), pick(next, words)], deep: { n: Math.floor(next() * 5) } },
      loc: { enUS: pick(next, words), zhCN: pick(next, words) },
      tags: [pick(next, words), pick(next, words)],
      nothing: null
    })
    const condition = (next) => {
      const path = pick(next, ['s', 'n', 'b', 'nested.s', 'nested.list', 'nested.deep.n', 'loc.enUS', 'tags', 'nothing', 'missing'])
      const value = pick(next, [pick(next, words), Math.floor(next() * 5), next() > 0.5, null])
      switch (Math.floor(next() * 6)) {
        case 0: return { [path]: value }
        case 1: return { [path]: { $eq: value } }
        case 2: return { [path]: { $in: [value, pick(next, words), Math.floor(next() * 5)] } }
        case 3: return { [path]: { $regex: pick(next, ['^alp', 'bet', 'gamma', 'Alpha 1', 'x']) } }
        case 4: return { [path]: { $regex: pick(next, ['^alp', 'ALPHA']), $options: 'i' } }
        default: return { [path]: { $ne: value } }
      }
    }

    it('never rules out a record that the query matches', () => {
      const next = random(2024)
      let matched = 0
      let skipped = 0
      for (let round = 0; round < 400; round++) {
        const records = Array.from({ length: 40 }, () => record(next))
        const query = next() > 0.6 ? { $and: [condition(next), condition(next)] } : { ...condition(next), ...(next() > 0.5 ? condition(next) : {}) }
        const groups = queryNeedles(query)
        const matches = sift(query)
        for (const item of records) {
          const text = JSON.stringify(item)
          if (matches(item)) {
            matched++
            expect(holdsNeedles(text, groups), `${JSON.stringify(query)} on ${text}`).to.equal(true)
          } else if (!holdsNeedles(text, groups)) {
            skipped++
          }
        }
      }
      // the sample is not empty on either side, and the needles do rule records out
      expect(matched).to.be.above(50)
      expect(skipped).to.be.above(500)
    })
  })
})
