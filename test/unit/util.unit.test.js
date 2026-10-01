const { expect } = require('chai')
const sanitizeQuery = require('../../lib/util/sanitizeQuery')
const safeEqual = require('../../lib/util/safeEqual')
const OSSHelper = require('../../lib/util/OSSHelper')

describe('sanitizeQuery', () => {
  it('passes plain and operator queries through unchanged', () => {
    const q = { title: 'x', n: { $gt: 1, $lte: 5 }, $or: [{ a: { $in: [1, 2] } }, { b: { $regex: '^a' } }] }
    expect(sanitizeQuery(q)).to.equal(q)
  })
  it('rejects $where at any depth', () => {
    expect(() => sanitizeQuery({ $where: 'x' })).to.throw(/\$where/)
    expect(() => sanitizeQuery({ a: { $not: { $where: 'x' } } })).to.throw(/\$where/)
    expect(() => sanitizeQuery({ $and: [{ $or: [{ $where: 'x' }] }] })).to.throw(/\$where/)
  })
  it('rejects unknown operators with a 400 error', () => {
    try {
      sanitizeQuery({ a: { $function: {} } })
      expect.fail('should throw')
    } catch (e) {
      expect(e.code).to.equal(400)
    }
  })
  it('rejects prototype keys', () => {
    expect(() => sanitizeQuery(JSON.parse('{"__proto__":{"a":1}}'))).to.throw(/Forbidden/)
    expect(() => sanitizeQuery({ constructor: 1 })).to.throw(/Forbidden/)
  })
  it('rejects oversized or non-string $regex', () => {
    expect(() => sanitizeQuery({ a: { $regex: 'a'.repeat(201) } })).to.throw(/regex/)
    expect(() => sanitizeQuery({ a: { $regex: { x: 1 } } })).to.throw(/regex/)
  })
  it('rejects overly deep queries', () => {
    let q = { a: 1 }
    for (let i = 0; i < 20; i++) q = { $and: [q] }
    expect(() => sanitizeQuery(q)).to.throw(/deeply/)
  })
})

describe('safeEqual', () => {
  it('compares strings', () => {
    expect(safeEqual('abc', 'abc')).to.equal(true)
    expect(safeEqual('abc', 'abd')).to.equal(false)
    expect(safeEqual('abc', 'abcd')).to.equal(false)
  })
  it('is false for non-strings', () => {
    expect(safeEqual(undefined, 'a')).to.equal(false)
    expect(safeEqual('a', null)).to.equal(false)
    expect(safeEqual(undefined, undefined)).to.equal(false)
  })
})

describe('OSSHelper.getOSSFilepath', () => {
  const helper = new OSSHelper()
  const field = { options: { oss: { path: '%{resource}/%{_id}', filename: '%{filename}' } } }
  const ctx = (filename) => ({ resource: { name: 'articles' }, params: { id: 'abc' }, attachment: { _filename: filename } })
  it('keeps a normal filename inside the record folder', () => {
    expect(helper.getOSSFilepath(ctx('man.jpg'), field)).to.equal('articles/abc/man.jpg')
  })
  it('strips path traversal from the client supplied filename', () => {
    expect(helper.getOSSFilepath(ctx('../../other/x.jpg'), field)).to.equal('articles/abc/x.jpg')
    expect(helper.getOSSFilepath(ctx('..\\..\\x.jpg'), field)).to.equal('articles/abc/x.jpg')
  })
})
