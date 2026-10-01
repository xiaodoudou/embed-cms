const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')

// POST /replicator/sync/:resource/:id brings one record to the peers. The protocol exchanges changes, not records, so the
// record travels with any other change the peer has not seen yet; what the route can promise is that the record exists here,
// and it says so with a 404 when it does not, instead of syncing the resource for nothing.
describe('replicator: syncing one record (unit)', () => {
  let app
  let agent
  before(async () => {
    app = await startApp({ replication: { peers: [], peersByResource: {}, secret: 'a-test-replication-secret' } })
    // these routes are protected by the login session
    agent = request.agent(app.url)
    await agent.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
  })
  after(async () => { await app.close() })

  it('answers 404 for a record this node does not have', async () => {
    const res = await agent.post('/replicator/sync/articles/muov4i42abcdefghy0f7dv8q')
    expect(res.status).to.equal(404)
    expect(res.body.error).to.match(/not found/i)
  })

  it('goes on to the peers for a record this node has (none are configured here)', async () => {
    const created = await request(app.url).post('/api/articles').auth(...ADMIN).send({ string: { enUS: `sync-${Date.now()}` } })
    const res = await agent.post(`/replicator/sync/articles/${created.body._id}`)
    expect(res.status).to.not.equal(404)
    expect(res.body.error).to.match(/peers/)
  })

  it('does not hand the record id to the store sync, which exchanges every pending change anyway', async () => {
    const calls = []
    const resource = app.cms.resource('articles')
    const original = resource.json.sync
    resource.json.sync = async (...args) => { calls.push(args); throw new Error('stop here') }
    const protocol = require('../../lib/plugins/replicator/protocol')
    const client = protocol.Client
    protocol.Client = (host, port, name, mid, callback) => callback(null, { destroy () {} }, 'peer0001')
    try {
      await app.cms.$replicator.replicator.replicate('localhost', 1, 'http://localhost/api/', 'articles', 'some-record').catch(() => {})
    } finally {
      resource.json.sync = original
      protocol.Client = client
    }
    expect(calls).to.have.length(1)
    expect(calls[0]).to.have.length(3)
  })
})

// A write to a resource whose type is not 'normal' goes to the peers right away. A removed record is gone, so syncRecord
// (which checks the record) cannot carry the delete: it travels with the resource's changes.
describe('replicator: writes go to the peers right away (unit)', () => {
  let app
  before(async () => {
    app = await startApp({ replication: { peers: [], peersByResource: {}, secret: 'a-test-replication-secret' } })
  })
  after(async () => { await app.close() })

  it('syncs the record after a create and an update, and the resource after a remove', async () => {
    const replicator = app.cms.$replicator
    const resource = app.cms.resource('articles')
    const saved = { syncRecord: replicator.syncRecord, syncResource: replicator.syncResource, hasPeers: replicator.hasPeers, type: resource.options.type }
    const calls = []
    replicator.syncRecord = async (name, id) => { calls.push(['record', name, id]) }
    replicator.syncResource = async (name) => { calls.push(['resource', name]) }
    replicator.hasPeers = () => true
    resource.options.type = 'downstream'
    try {
      const articles = app.cms.api()('articles')
      const created = await articles.create({ string: { enUS: `peers-${Date.now()}` } })
      await articles.update(created._id, { rate: 2 })
      await articles.remove(created._id)
      expect(calls).to.deep.equal([
        ['record', 'articles', created._id],
        ['record', 'articles', created._id],
        ['resource', 'articles']
      ])
    } finally {
      Object.assign(replicator, { syncRecord: saved.syncRecord, syncResource: saved.syncResource, hasPeers: saved.hasPeers })
      resource.options.type = saved.type
    }
  })
})
