const request = require('supertest')
const xlsx = require('@e965/xlsx')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

const workbook = (sheets) => {
  const wb = xlsx.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), name)
  }
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

describe('import plugin, xlsx upload (unit)', () => {
  let app, cities, agent

  const post = (route, sheets) => agent.post(`/import/${route}`).attach('xlsx', workbook(sheets), 'import.xlsx')
  const header = ['key', 'name.en', 'name.zh']

  before(async () => {
    app = await startApp({ import: { resources: ['cities', 'provinces'] } })
    cities = app.cms.api()('cities')
    agent = request.agent(app.url)
    const login = await agent.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
    expect(login.status).to.equal(200)
  })
  after(async () => {
    await app.close()
  })

  it('is not reachable without a session', async () => {
    for (const route of ['/import/status', '/import/execute']) {
      const res = await request(app.url).get(route)
      expect(res.status, route).to.be.oneOf([401, 403])
    }
    const post = await request(app.url).post('/import/statusXlsx').attach('xlsx', workbook({ cities: [header] }), 'a.xlsx')
    expect(post.status).to.be.oneOf([401, 403])
  })

  it('reports what an upload would create, update and remove without changing data', async () => {
    await cities.create({ key: 'paris', name: { en: 'Paris' } })
    await cities.create({ key: 'nice', name: { en: 'Nice' } })
    const res = await post('statusXlsx', { cities: [header, ['paris', 'Paname', '巴黎'], ['lyon', 'Lyon', '里昂']] })
    expect(res.status).to.equal(200)
    expect(res.body.cities).to.deep.equal({ create: 1, update: 1, remove: 1 })
    expect((await cities.list()).map(c => c.key).sort()).to.deep.equal(['nice', 'paris'])
  })

  it('executes the import: creates, updates and removes records', async () => {
    const res = await post('executeXlsx', { cities: [header, ['paris', 'Paname', '巴黎'], ['lyon', 'Lyon', '里昂']] })
    expect(res.status).to.equal(200)
    expect(res.body.cities).to.deep.equal({ create: 1, update: 1, remove: 1 })
    expect((await cities.list()).map(c => c.key).sort()).to.deep.equal(['lyon', 'paris'])
    expect(await cities.find({ key: 'paris' })).to.have.nested.property('name.en', 'Paname')
  })

  it('does not reuse data from an earlier upload when a later file lacks the sheet', async () => {
    await post('executeXlsx', { cities: [header, ['first', 'First', '一']] })
    const before = (await cities.list()).map(c => c.key).sort()
    const res = await post('executeXlsx', { provinces: [['key', 'name.en'], ['bretagne', 'Bretagne']] })
    expect(res.status).to.equal(200)
    // the second file only has a provinces sheet: cities must be untouched, not re-imported from the first file
    expect(res.body).to.not.have.property('cities')
    expect((await cities.list()).map(c => c.key).sort()).to.deep.equal(before)
    expect(await app.cms.api()('provinces').find({ key: 'bretagne' })).to.be.ok
  })

  it('does not replay resources from a previous request on the next status call', async () => {
    await post('executeXlsx', { provinces: [['key', 'name.en'], ['normandie', 'Normandie']] })
    const res = await post('statusXlsx', { cities: [header, ['brest', 'Brest', '布雷斯特']] })
    expect(res.status).to.equal(200)
    expect(Object.keys(res.body)).to.deep.equal(['cities'])
  })

  it('answers an error for a request without a file', async () => {
    for (const route of ['statusXlsx', 'executeXlsx']) {
      const res = await agent.post(`/import/${route}`)
      expect(res.status, route).to.equal(400)
      expect(res.body.message, route).to.equal('missing xlsx file')
    }
  })
})
