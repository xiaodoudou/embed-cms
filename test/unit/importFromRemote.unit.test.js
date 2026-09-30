const path = require('path')
const request = require('supertest')
const { expect } = require('chai')
const utils = require('../../lib-importFromRemote/utils')
const ImportWrapper = require('../../lib-importFromRemote/index')
const { startApp, ADMIN } = require('../helpers/app')

describe('importFromRemote utilities (unit)', () => {
  describe('determineResourceOrder', () => {
    const schemaMap = {
      cities: { schema: [{ field: 'province', source: 'provinces' }] },
      provinces: { schema: [{ field: 'country', source: 'countries' }] },
      countries: { schema: [] },
      notes: { schema: [] }
    }
    it('puts referenced resources before the ones that reference them', () => {
      const order = utils.determineResourceOrder(['cities', 'provinces', 'countries'], schemaMap)
      expect(order).to.deep.equal(['countries', 'provinces', 'cities'])
    })
    it('keeps independent resources and ignores sources outside the list', () => {
      const order = utils.determineResourceOrder(['cities', 'notes'], schemaMap)
      expect(order.sort()).to.deep.equal(['cities', 'notes'])
    })
    it('returns the input order when the references form a cycle', () => {
      const cyclic = { a: { schema: [{ source: 'b' }] }, b: { schema: [{ source: 'a' }] } }
      expect(utils.determineResourceOrder(['a', 'b'], cyclic)).to.deep.equal(['a', 'b'])
    })
    it('handles an empty list', () => {
      expect(utils.determineResourceOrder([], {})).to.deep.equal([])
    })
  })

  describe('getFilename', () => {
    it('uses _filename when present', () => {
      expect(utils.getFilename({ _filename: 'photo.jpg' })).to.equal('photo.jpg')
    })
    it('falls back to the last segment of the url without its query string', () => {
      expect(utils.getFilename({ url: 'https://cms/api/x/file/abc.png?token=1' })).to.equal('abc.png')
      expect(utils.getFilename('https://cms/files/name.gif?x=y')).to.equal('name.gif')
    })
    it('never returns a path, whatever the remote sent', () => {
      expect(utils.getFilename({ _filename: '../../etc/passwd' })).to.equal('passwd')
      expect(utils.getFilename({ _filename: '..\\..\\evil.exe' })).to.equal('evil.exe')
      expect(utils.getFilename({ _filename: '/abs/olute.txt' })).to.equal('olute.txt')
    })
  })

  describe('safeJoin', () => {
    const base = path.resolve('cached-test')
    it('joins segments inside the base folder', () => {
      expect(utils.safeJoin(base, 'articles', 'my-key', 'image', 'a.png')).to.equal(path.join(base, 'articles', 'my-key', 'image', 'a.png'))
    })
    it('allows a segment with dots inside its name', () => {
      expect(utils.safeJoin(base, 'a', 'name.with.dots', 'x.png')).to.equal(path.join(base, 'a', 'name.with.dots', 'x.png'))
    })
    it('refuses traversal through any segment', () => {
      expect(() => utils.safeJoin(base, 'articles', '../../outside', 'x.png')).to.throw(/outside/)
      expect(() => utils.safeJoin(base, '..')).to.throw(/outside/)
      expect(() => utils.safeJoin(base, 'a', '..', '..', 'b')).to.throw(/outside/)
    })
    it('refuses absolute segments', () => {
      expect(() => utils.safeJoin(base, path.resolve('/etc/passwd'))).to.throw(/outside/)
    })
    it('coerces non-string segments', () => {
      expect(utils.safeJoin(base, 'a', 42)).to.equal(path.join(base, 'a', '42'))
    })
  })

  describe('findMatches', () => {
    it('finds values by path pattern and field name', () => {
      const obj = { image: [{ _id: '1' }, { _id: '2' }], other: { image: { _id: '3' } } }
      const found = utils.findMatches(obj, /image/, 'image')
      expect(found.map(f => f.path)).to.include.members(['image', 'other.image'])
    })
    it('returns nothing for a value without objects', () => {
      expect(utils.findMatches('text', /x/, 'x')).to.deep.equal([])
    })
  })

  describe('convertKeyToId', () => {
    const field = { source: 'provinces' }
    it('maps a remote id to its local id', () => {
      expect(utils.convertKeyToId(field, 'remote-1', { provinces: { 'remote-1': 'local-1' } }, {})).to.equal('local-1')
    })
    it('keeps the remote id when it is a known remote record that is not mapped yet', () => {
      expect(utils.convertKeyToId(field, 'remote-2', {}, { provinces: [{ _id: 'remote-2' }] })).to.equal('remote-2')
    })
    it('returns null for an id that exists nowhere', () => {
      expect(utils.convertKeyToId(field, 'ghost', {}, { provinces: [] })).to.equal(null)
    })
  })

  describe('small helpers', () => {
    it('filterAttachments drops ignored file names', () => {
      expect(utils.filterAttachments(['a.png', '.DS_Store', 'b.png'], ['.DS_Store'])).to.deep.equal(['a.png', 'b.png'])
    })
    it('getAttachments makes urls absolute and strips server ids', () => {
      const config = { remote: { protocol: 'https://', host: 'cms.example.org', prefix: '/cms' } }
      const record = { image: [{ _id: 'x', url: '/api/x/file/x', _filename: 'x.png' }, { _id: 'y' }] }
      const list = utils.getAttachments(record, 'image', config)
      expect(list).to.have.length(1)
      expect(list[0].url).to.equal('https://cms.example.org/api/x/file/x')
      expect(list[0]).to.not.have.property('_id')
    })
  })
})

describe('ImportWrapper (unit)', () => {
  it('reports a failure and is not left busy afterwards', async () => {
    const wrapper = new ImportWrapper()
    wrapper.multibar = undefined
    const config = { local: { protocol: 'http://', host: 'localhost:1', prefix: '' }, remote: { protocol: 'http://', host: 'localhost:1', prefix: '' }, resources: [] }
    const first = await wrapper.startImport(config, { yes: true }, null)
    expect(first).to.equal(false)
    expect(wrapper.lastError).to.be.instanceOf(Error)
    expect(wrapper.ongoingImport).to.equal(false)
    const second = await wrapper.startImport(config, { yes: true }, null)
    expect(second).to.equal(false)
    expect(wrapper.ongoingImport).to.equal(false)
  }).timeout(20000)

  it('refuses to run without confirmation when nobody can be asked', async () => {
    const wrapper = new ImportWrapper()
    const config = { local: { protocol: 'http://', host: 'localhost:1', prefix: '' }, remote: { protocol: 'http://', host: 'localhost:1', prefix: '' }, resources: [] }
    expect(await wrapper.startImport(config, {}, null)).to.equal(false)
    expect(wrapper.lastError.message).to.match(/Confirmation required/)
  })

  it('refuses a second import while one is running', async () => {
    const wrapper = new ImportWrapper()
    wrapper.ongoingImport = true
    expect(await wrapper.startImport({}, { yes: true }, null)).to.equal(false)
    expect(wrapper.ongoingImport).to.equal(true)
  })
})

describe('importFromRemote plugin (unit)', () => {
  let app, plugin, agent

  before(async () => {
    app = await startApp({ importFromRemote: { local: {}, remote: {}, resources: [] } })
    plugin = app.cms.$importFromRemote
    agent = request.agent(app.url)
    const login = await agent.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
    expect(login.status).to.equal(200)
  })
  after(async () => {
    await app.close()
  })

  it('requires a session', async () => {
    for (const route of ['/importFromRemote/status', '/importFromRemote/execute']) {
      const res = await request(app.url).get(route)
      expect(res.status, route).to.be.oneOf([401, 403])
    }
  })

  it('reports an idle status', async () => {
    const res = await agent.get('/importFromRemote/status')
    expect(res.status).to.equal(200)
    expect(res.body).to.deep.equal({ status: 'idle', progress: 0, message: '' })
  })

  it('asks the importer to run without confirmation and reports success', async () => {
    let received
    plugin.importWrapper.startImport = async (config, options, ask) => { received = { config, options, ask }; return true }
    const res = await agent.get('/importFromRemote/execute')
    expect(res.status).to.equal(200)
    expect(received.options).to.deep.equal({ yes: true })
    expect(received.ask).to.equal(null)
    const status = await agent.get('/importFromRemote/status')
    expect(status.body).to.include({ status: 'done', progress: 100 })
  })

  it('reports the real reason when the import failed', async () => {
    plugin.importWrapper.startImport = async function () { this.lastError = new Error('remote login refused'); return false }
    await agent.get('/importFromRemote/execute')
    const status = await agent.get('/importFromRemote/status')
    expect(status.body).to.include({ status: 'error', message: 'remote login refused' })
  })

  it('answers 409 while an import is in progress', async () => {
    plugin.importWrapper.ongoingImport = true
    const res = await agent.get('/importFromRemote/execute')
    expect(res.status).to.equal(409)
    expect(res.body).to.have.property('status', 'busy')
    plugin.importWrapper.ongoingImport = false
  })
})
