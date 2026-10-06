const { expect } = require('chai')
const { fieldPathPattern, BLOCK_WILDCARD } = require('../../lib/util/fieldPathPattern')

// the keys of _attachmentFields and _relations: the admin takes the locale and the index of a file from the last group of the
// pattern, so the shape of the pattern is a contract, not a detail
describe('fieldPathPattern (unit)', () => {
  it('matches a field, and the field with a locale and the index of the file', () => {
    expect(fieldPathPattern('photo')).to.equal('photo(\\..+)?$')
    const regex = new RegExp(fieldPathPattern('photo'))
    expect('photo').to.match(regex)
    expect('photo.enUS.0').to.match(regex)
    expect('photos').to.not.match(regex)
    expect('a.photo'.match(regex)[1]).to.equal(undefined)
    expect('photo.enUS.0'.match(regex)[1]).to.equal('.enUS.0')
  })

  it('matches the field of any block of a paragraph, written with a dot or with brackets', () => {
    const pattern = fieldPathPattern(`blocks.${BLOCK_WILDCARD}.banner`)
    expect(pattern).to.equal('blocks(\\.|\\[)(.+)(\\.|\\])banner(\\..+)?$')
    const regex = new RegExp(pattern)
    expect('blocks.0.banner').to.match(regex)
    expect('blocks[2].banner.zhCN.1').to.match(regex)
    expect('blocks.0.banner.zhCN.1'.match(regex)[4]).to.equal('.zhCN.1')
    expect('blocks.0.caption').to.not.match(regex)
  })

  it('goes through blocks inside blocks', () => {
    expect(fieldPathPattern(`a.${BLOCK_WILDCARD}.b.${BLOCK_WILDCARD}.c`, false)).to.equal('a(\\.|\\[)(.+)(\\.|\\])b(\\.|\\[)(.+)(\\.|\\])c$')
  })

  it('takes no locale after a field that is not localised', () => {
    expect(fieldPathPattern('doc', false)).to.equal('doc$')
    expect('doc.enUS').to.not.match(new RegExp(fieldPathPattern('doc', false)))
  })

  it('escapes what a field name may hold that means something in a regular expression', () => {
    expect(fieldPathPattern('we$ird.name')).to.equal('we\\$ird\\.name(\\..+)?$')
    expect('we$ird.name').to.match(new RegExp(fieldPathPattern('we$ird.name')))
    expect('weXird.name').to.not.match(new RegExp(fieldPathPattern('we$ird.name')))
  })
})
