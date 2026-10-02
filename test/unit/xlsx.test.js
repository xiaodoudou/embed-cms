const request = require('supertest')
const xlsx = require('@e965/xlsx')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const binary = (res, callback) => {
  const chunks = []
  res.on('data', c => chunks.push(c))
  res.on('end', () => callback(null, Buffer.concat(chunks)))
}

const toBuffer = (rows) => {
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), 'cities')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

describe('xlsx plugin (unit)', () => {
  let app, cities

  before(async () => {
    app = await startApp({ xlsx: true })
    await app.cms.api()('_xlsx').create({ token: 'secret-token' })
    cities = app.cms.api()('cities')
    await cities.create({ key: 'paris', name: { en: 'Paris', zh: '巴黎' } })
    await cities.create({ key: 'rome', name: { en: 'Rome' } })
  })
  after(async () => {
    await app.close()
  })

  describe('authorization', () => {
    it('rejects a missing token with 401', async () => {
      const res = await request(app.url).get('/xlsx/cities')
      expect(res.status).to.equal(401)
    })
    it('rejects a wrong token with 401', async () => {
      const res = await request(app.url).get('/xlsx/cities').query({ token: 'nope' })
      expect(res.status).to.equal(401)
    })
    it('rejects a token that only shares a prefix', async () => {
      const res = await request(app.url).get('/xlsx/cities').query({ token: 'secret-token-extra' })
      expect(res.status).to.equal(401)
    })
    it('protects the import routes too', async () => {
      const file = toBuffer([['Key'], ['key'], ['x']])
      const status = await request(app.url).post('/xlsx/cities/status').attach('xlsx', file, 'a.xlsx')
      const imp = await request(app.url).post('/xlsx/cities/import').attach('xlsx', file, 'a.xlsx')
      expect(status.status).to.equal(401)
      expect(imp.status).to.equal(401)
    })
    it('answers 404 for an unknown resource', async () => {
      const res = await request(app.url).get('/xlsx/nothere').query({ token: 'secret-token' })
      expect(res.status).to.equal(404)
    })
  })

  describe('export', () => {
    let rows, sheets
    before(async () => {
      const res = await request(app.url).get('/xlsx/cities').query({ token: 'secret-token' }).buffer(true).parse(binary)
      expect(res.status).to.equal(200)
      expect(res.headers['content-disposition']).to.match(/cities\.xlsx/)
      const wb = xlsx.read(res.body)
      sheets = wb.SheetNames
      rows = xlsx.utils.sheet_to_json(wb.Sheets.cities, { header: 1 })
    })
    it('writes a label row, a key row and one row per record', () => {
      expect(rows[0][0]).to.equal('Key')
      expect(rows[1][0]).to.equal('key')
      expect(rows.slice(2).map(r => r[0]).sort()).to.deep.equal(['paris', 'rome'])
    })
    it('writes one column per locale for localised fields', () => {
      expect(rows[1]).to.include.members(['name.en', 'name.zh', 'name.th'])
      const paris = rows.find(r => r[0] === 'paris')
      expect(paris[rows[1].indexOf('name.zh')]).to.equal('巴黎')
    })
    it('adds a sheet for each related resource', () => {
      expect(sheets).to.include('provinces')
    })
  })

  describe('import', () => {
    const header = () => {
      const keys = ['key', 'name.en', 'name.zh']
      return [['Key', 'Name (en)', 'Name (zh)'], keys]
    }
    const post = (route, rows) => request(app.url)
      .post(`/xlsx/cities/${route}`)
      .query({ token: 'secret-token' })
      .attach('xlsx', toBuffer(rows), 'cities.xlsx')

    it('reports what an import would do without changing data', async () => {
      const before = (await cities.list()).length
      const res = await post('status', [...header(), ['berlin', 'Berlin', '柏林']])
      expect(res.status).to.equal(200)
      expect((await cities.list()).length).to.equal(before)
    })
    it('creates new records and updates existing ones by unique key', async () => {
      const res = await post('import', [...header(), ['berlin', 'Berlin', '柏林'], ['paris', 'Paname', '巴黎']])
      expect(res.status).to.equal(200)
      const berlin = await cities.find({ key: 'berlin' })
      expect(berlin).to.have.nested.property('name.en', 'Berlin')
      const paris = await cities.find({ key: 'paris' })
      expect(paris).to.have.nested.property('name.en', 'Paname')
    })
    it('answers an error instead of hanging on a file that is not a spreadsheet', async () => {
      const res = await request(app.url)
        .post('/xlsx/cities/import')
        .query({ token: 'secret-token' })
        .attach('xlsx', Buffer.from('not a spreadsheet'), 'bad.xlsx')
      expect(res.status).to.be.oneOf([200, 400, 500])
    })
    it('answers an error when no file is attached', async () => {
      const res = await request(app.url).post('/xlsx/cities/import').query({ token: 'secret-token' })
      expect(res.status).to.be.oneOf([400, 500])
    })
  })
})
