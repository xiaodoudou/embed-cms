const { expect } = require('chai')
const { startApp } = require('../helpers/app')

// an import names the records a field of several resources points to by their unique value; they become the references with the ids
describe('import: a field of several resources (unit)', () => {
  let app, pages, red, fresh

  before(async () => {
    app = await startApp({ resources: './test/fixtures/syncResources', disableJwtLogin: true })
    pages = app.cms.resource('pages')
    red = await app.cms.api()('tags').create({ name: 'red' })
    fresh = await app.cms.api()('labels').create({ name: 'new' })
  })
  after(() => app.close())

  it('turns the unique value of a reference into the id of the record, in the resource it says', async () => {
    const list = [{ slug: 'a', related: { resource: 'labels', id: 'new' }, relatedMany: [{ resource: 'tags', id: 'red' }, { resource: 'labels', id: 'new' }] }]
    await pages.getImportMap(list, undefined, false)
    expect(list[0].related).to.deep.equal({ resource: 'labels', id: fresh._id })
    expect(list[0].relatedMany).to.deep.equal([{ resource: 'tags', id: red._id }, { resource: 'labels', id: fresh._id }])
  })

  it('reads the references a spreadsheet holds as text', async () => {
    const list = [{ slug: 'b', related: JSON.stringify({ resource: 'tags', id: 'red' }), relatedMany: JSON.stringify([{ resource: 'labels', id: 'new' }]) }]
    await pages.getImportMap(list, undefined, false)
    expect(list[0].related).to.deep.equal({ resource: 'tags', id: red._id })
    expect(list[0].relatedMany).to.deep.equal([{ resource: 'labels', id: fresh._id }])
  })

  it('drops a reference to a record or to a resource that is not there', async () => {
    const list = [{ slug: 'c', related: { resource: 'tags', id: 'blue' }, relatedMany: [{ resource: 'tags', id: 'blue' }, { resource: 'nothing', id: 'x' }, { resource: 'tags', id: 'red' }] }]
    await pages.getImportMap(list, undefined, false)
    expect(list[0].related).to.equal(undefined)
    expect(list[0].relatedMany).to.deep.equal([{ resource: 'tags', id: red._id }])
  })

  it('leaves an empty cell empty', async () => {
    const list = [{ slug: 'd', related: '', relatedMany: [] }]
    await pages.getImportMap(list, undefined, false)
    expect(list[0].related).to.equal(null)
    expect(list[0].relatedMany).to.equal(null)
  })
})
