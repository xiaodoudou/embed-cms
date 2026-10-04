const { expect } = require('chai')
const { isMultiSource, sourcesOf, isRef, mapRefs } = require('../../lib/util/fieldSources')

// a select of several resources: the value says its resource
describe('fieldSources (unit)', () => {
  describe('isMultiSource and sourcesOf', () => {
    it('is a select or a multiselect with a list of sources', () => {
      expect(isMultiSource({ input: 'select', sources: ['a', 'b'] })).to.equal(true)
      expect(isMultiSource({ input: 'multiselect', sources: [{ resource: 'a' }] })).to.equal(true)
    })

    it('is not any other field, nor a field with one source or none', () => {
      expect(isMultiSource({ input: 'string', sources: ['a'] })).to.equal(false)
      expect(isMultiSource({ input: 'select', source: 'a' })).to.equal(false)
      expect(isMultiSource({ input: 'select', sources: [] })).to.equal(false)
      expect(isMultiSource({ input: 'select', sources: 'a' })).to.equal(false)
      expect(isMultiSource(undefined)).to.equal(false)
    })

    it('lists the resources in the order of the field, a name and an object being the same thing', () => {
      expect(sourcesOf({ input: 'select', sources: ['a', { resource: 'b', customLabel: '{{x}}', title: 'Bs' }] })).to.deep.equal([
        { resource: 'a' }, { resource: 'b', customLabel: '{{x}}', title: 'Bs' }
      ])
    })

    it('leaves out what is not a resource, and the doubles', () => {
      expect(sourcesOf({ input: 'select', sources: ['a', 3, null, '', {}, { resource: '' }, { resource: 'a', title: 'again' }, ['b']] })).to.deep.equal([{ resource: 'a' }])
    })

    it('has no resource for a field that is not of several', () => {
      expect(sourcesOf({ input: 'select', source: 'a' })).to.deep.equal([])
    })
  })

  describe('isRef', () => {
    it('is a resource and an id', () => {
      expect(isRef({ resource: 'a', id: 'x' })).to.equal(true)
      expect(isRef({ resource: 'a', id: 'x', extra: 1 })).to.equal(true)
    })

    it('is nothing else', () => {
      for (const value of [undefined, null, '', 'a', 3, [], {}, { resource: 'a' }, { id: 'x' }, { resource: '', id: 'x' }, { resource: 'a', id: '' }, { resource: 'a', id: 5 }, { resource: 5, id: 'x' }]) {
        expect(isRef(value), JSON.stringify(value)).to.equal(false)
      }
    })
  })

  describe('mapRefs', () => {
    const lists = {
      tags: { list: [{ _id: 't1', name: 'red' }, { _id: 't2', name: 'green' }], key: 'name' },
      labels: { list: [{ _id: 'l1', name: 'new' }], key: 'name' }
    }

    it('says the record by its unique value on the way out, and by its id on the way in', () => {
      expect(mapRefs({ resource: 'tags', id: 't2' }, lists, 'export')).to.deep.equal({ resource: 'tags', id: 'green' })
      expect(mapRefs({ resource: 'labels', id: 'new' }, lists, 'import')).to.deep.equal({ resource: 'labels', id: 'l1' })
    })

    it('keeps the positions of a list, with undefined for what is not there', () => {
      const mapped = mapRefs([{ resource: 'tags', id: 't1' }, { resource: 'tags', id: 'gone' }, { resource: 'other', id: 'x' }, { resource: 'labels', id: 'l1' }], lists, 'export')
      expect(mapped).to.deep.equal([{ resource: 'tags', id: 'red' }, undefined, undefined, { resource: 'labels', id: 'new' }])
    })

    it('goes through a value per language', () => {
      expect(mapRefs({ enUS: { resource: 'tags', id: 't1' }, zhCN: { resource: 'labels', id: 'l1' } }, lists, 'export')).to.deep.equal({
        enUS: { resource: 'tags', id: 'red' }, zhCN: { resource: 'labels', id: 'new' }
      })
    })

    it('does not mix the resources: a value that two resources have is looked for in the one the reference says', () => {
      const same = { a: { list: [{ _id: '1', name: 'x' }], key: 'name' }, b: { list: [{ _id: '2', name: 'x' }], key: 'name' } }
      expect(mapRefs({ resource: 'b', id: 'x' }, same, 'import')).to.deep.equal({ resource: 'b', id: '2' })
    })

    it('leaves what is not a reference as it is', () => {
      expect(mapRefs('plain', lists, 'export')).to.equal('plain')
      expect(mapRefs(undefined, lists, 'export')).to.equal(undefined)
      expect(mapRefs(null, lists, 'export')).to.equal(null)
    })
  })
})
