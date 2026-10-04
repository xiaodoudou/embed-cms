const { expect } = require('chai')
const { startApp } = require('../helpers/app')

// a select of several resources is synced with the record each reference points to, which has another id on the other CMS
describe('sync plugin: a field of several resources (unit)', () => {
  let A, B

  const api = (app, resource) => app.cms.api()(resource)
  const find = async (app, resource, field, value) => (await api(app, resource).list()).find(item => item[field] === value)
  const clear = async (app) => {
    for (const resource of ['pages', 'tags', 'labels']) {
      for (const item of await api(app, resource).list()) {
        await api(app, resource).remove(item._id)
      }
    }
  }
  const make = async (app, resource, names) => {
    for (const name of names) {
      await api(app, resource).create({ name })
    }
  }
  const ref = async (app, resource, name) => ({ resource, id: (await find(app, resource, 'name', name))._id })
  const run = async (from, way) => {
    await from.cms.$sync.run('tags', way)
    await from.cms.$sync.run('labels', way)
    return from.cms.$sync.run('pages', way)
  }

  before(async () => {
    const options = { resources: './test/fixtures/syncResources', sync: { resources: ['tags', 'labels', 'pages'] }, disableJwtLogin: true }
    A = await startApp(options)
    B = await startApp(options)
    for (const app of [A, B]) {
      app.cms.$sync.runner.pollMs = 20
    }
    await A.cms.api()('_sync').create({ allows: ['read', 'write'], local: { token: 'token-a', url: A.url }, remote: { token: 'token-b', url: B.url } })
    await B.cms.api()('_sync').create({ allows: ['read', 'write'], local: { token: 'token-b', url: B.url }, remote: { token: 'token-a', url: A.url } })
  })
  after(async () => {
    await A.close()
    await B.close()
  })
  beforeEach(async () => {
    await clear(A)
    await clear(B)
    // the same records on both, made in another order, so that no id is the same
    await make(A, 'tags', ['red', 'green'])
    await make(A, 'labels', ['new', 'old'])
    await make(B, 'tags', ['green', 'red'])
    await make(B, 'labels', ['old', 'new'])
  })

  it('points a page to the same record of the same resource on the other CMS, though its id is not the same', async () => {
    await api(A, 'pages').create({
      slug: 'home',
      related: await ref(A, 'labels', 'new'),
      relatedMany: [await ref(A, 'tags', 'green'), await ref(A, 'labels', 'old'), await ref(A, 'tags', 'red')]
    })
    const result = await run(A, 'push')
    expect(result).to.include({ status: 'done', created: 1 })
    const copied = await find(B, 'pages', 'slug', 'home')
    expect(copied.related).to.deep.equal(await ref(B, 'labels', 'new'))
    expect(copied.related.id).to.not.equal((await ref(A, 'labels', 'new')).id)
    expect(copied.relatedMany).to.deep.equal([await ref(B, 'tags', 'green'), await ref(B, 'labels', 'old'), await ref(B, 'tags', 'red')])
  })

  it('pulls the references the other way', async () => {
    await api(B, 'pages').create({ slug: 'there', related: await ref(B, 'tags', 'red'), relatedMany: [await ref(B, 'labels', 'new')] })
    const result = await A.cms.$sync.run('tags', 'pull').then(() => A.cms.$sync.run('labels', 'pull')).then(() => A.cms.$sync.run('pages', 'pull'))
    expect(result).to.include({ status: 'done', created: 1 })
    const copied = await find(A, 'pages', 'slug', 'there')
    expect(copied.related).to.deep.equal(await ref(A, 'tags', 'red'))
    expect(copied.relatedMany).to.deep.equal([await ref(A, 'labels', 'new')])
  })

  it('finds nothing to change when it is run again, the references being compared by the record they point to', async () => {
    await api(A, 'pages').create({ slug: 'same', related: await ref(A, 'tags', 'red'), relatedMany: [await ref(A, 'labels', 'old')] })
    await run(A, 'push')
    const again = await run(A, 'push')
    expect(again).to.include({ status: 'done', created: 0, updated: 0 })
  })

  it('updates the other CMS when a reference changes to another record, or to another resource', async () => {
    const page = await api(A, 'pages').create({ slug: 'moves', related: await ref(A, 'tags', 'red') })
    await run(A, 'push')
    await api(A, 'pages').update(page._id, { related: await ref(A, 'labels', 'old') })
    const result = await run(A, 'push')
    expect(result).to.include({ status: 'done', updated: 1 })
    expect((await find(B, 'pages', 'slug', 'moves')).related).to.deep.equal(await ref(B, 'labels', 'old'))
  })

  it('leaves out a reference to a record the other CMS does not have', async () => {
    await api(A, 'tags').create({ name: 'only here' })
    await api(A, 'pages').create({ slug: 'lonely', relatedMany: [await ref(A, 'tags', 'only here'), await ref(A, 'tags', 'red')] })
    // only the pages: the tags would take the record over with them
    await A.cms.$sync.run('pages', 'push')
    const copied = await find(B, 'pages', 'slug', 'lonely')
    expect(copied.relatedMany.filter(Boolean)).to.deep.equal([await ref(B, 'tags', 'red')])
  })
})
