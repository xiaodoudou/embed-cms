const _ = require('lodash')
const sift = require('sift')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

// mulberry32
const random = (seed) => () => {
  seed |= 0
  seed = seed + 0x6D2B79F5 | 0
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

/**
 * The search the import map used before it was indexed: lodash walks the whole list for every item.
 */
const reference = (resource, importList, cmsList, query) => {
  const uniqueKeys = resource.getUniqueKeys()
  const removeItem = _.filter(cmsList, item => !_.find(importList, _.pick(item, uniqueKeys)))
  const createItem = _.filter(importList, item => !_.find(cmsList, _.pick(item, uniqueKeys)))
  let updateItem = _.difference(importList, createItem)
  if (query) {
    const filteredCmsList = _.filter(cmsList, sift(query))
    updateItem = _.filter(updateItem, item => _.find(filteredCmsList, _.pick(item, uniqueKeys)))
  }
  updateItem = _.filter(updateItem, item => {
    const cmsItem = _.find(cmsList, _.pick(item, uniqueKeys))
    item._id = cmsItem._id
    return !resource.isEqual(item, cmsItem)
  })
  return { create: createItem, update: updateItem, remove: removeItem }
}

describe('import map (unit)', () => {
  let app, products, resource

  before(async () => {
    app = await startApp({ resources: './test/bench/resources', smartCrop: false })
    products = app.cms.api()('products')
    resource = app.cms.resource('products')
    for (let i = 0; i < 30; i++) {
      await products.create({ sku: `S${i}`, name: { enUS: `name ${i % 5}` }, price: i, category: i % 2 ? 'odd' : 'even' })
    }
  })
  after(async () => { await app.close() })

  it('gives the map the exhaustive search gave, whatever the import list holds', async () => {
    const next = random(7)
    const pick = (list) => list[Math.floor(next() * list.length)]
    for (let round = 0; round < 25; round++) {
      const importList = []
      for (let i = 0; i < 20; i++) {
        const row = { name: { enUS: `name ${Math.floor(next() * 5)}` }, price: Math.floor(next() * 40), category: pick(['odd', 'even']) }
        const kind = next()
        if (kind < 0.6) {
          row.sku = `S${Math.floor(next() * 40)}` // existing or new
        } else if (kind < 0.7) {
          row.sku = Math.floor(next() * 40) // a number: never equal to a text key
        } else if (kind < 0.8) {
          row.sku = null
        } else if (kind < 0.9) {
          row.sku = { $x: 1 } // not a plain value: the search of lodash is kept
        } // else: no key at all
        importList.push(row)
      }
      const query = pick([undefined, { category: 'odd' }, { price: { $lt: 10 } }])
      const cmsList = await resource.list()
      const expected = reference(resource, _.cloneDeep(importList), cmsList, query && _.cloneDeep(query))
      const actual = await resource.getImportMap(_.cloneDeep(importList), query && _.cloneDeep(query))
      const shape = (map) => _.mapValues(map, list => list.map(item => _.omit(item, ['_local'])))
      expect(shape(actual), `round ${round}`).to.deep.equal(shape(expected))
    }
  })

  it('finds the records of a large import quickly', async () => {
    const importList = _.times(3000, i => ({ sku: `S${i % 40}-${i}`, name: { enUS: `n${i}` } }))
    const started = Date.now()
    const map = await resource.getImportMap(importList)
    expect(map.create).to.have.length(3000)
    expect(map.remove).to.have.length(30)
    expect(Date.now() - started).to.be.below(2000)
  })
})
