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
    app = await startApp()
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
