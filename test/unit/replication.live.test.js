const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN, randomSecret } = require('../helpers/app')
const { md5Of } = require('../../lib/plugins/replicator/attachments')

const IMAGE = path.join(__dirname, '../fixtures/man.jpg')

// Live replication: a node keeps a link to each peer it pulls a resource from. The peer sends what the node lacks, then
// each change as it is written, and the link connects again when the peer goes away.

const waitFor = async (check, timeout = 6000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}
const has = async (node, resource, id) => (await node.cms.api()(resource).list()).some(item => item._id === id)

describe('live replication (unit)', function () {
  this.timeout(30000)
  const secret = randomSecret()
  let a, b

  before(async () => {
    a = await startApp({ mid: 'aaaaaaaa', replication: { peers: [], peersByResource: {}, secret } })
    // B pulls the comments and the articles of A; it lists A, A does not list B
    b = await startApp({ mid: 'bbbbbbbb', replication: { peers: [], peersByResource: { comments: [{ url: `${a.url}/api/`, direction: 'upstream' }], articles: [{ url: `${a.url}/api/`, direction: 'upstream' }] }, secret, auth: { username: ADMIN[0], password: ADMIN[1] } } })
  })
  after(async () => {
    // the node that pulls first, so that no link is still fetching from a node that is gone
    await b.close()
    await a.close()
  })

  it('brings what the peer already had, without being asked', async () => {
    // written on A before B was up would be the same: B catches up when its link connects
    const early = await a.cms.api()('comments').create({ title: { enUS: 'already there' } })
    expect(await waitFor(() => has(b, 'comments', early._id))).to.equal(true)
  })

  it('brings each new change as it is written, while the link stays open', async () => {
    const link = b.cms.$replicator.links.find(item => item.name === 'comments')
    const connectedSince = link.since
    const first = await a.cms.api()('comments').create({ title: { enUS: 'live one' } })
    expect(await waitFor(() => has(b, 'comments', first._id), 3000)).to.equal(true)
    await a.cms.api()('comments').update(first._id, { title: { enUS: 'live one, changed' } })
    expect(await waitFor(async () => (await b.cms.api()('comments').find(first._id)).title.enUS === 'live one, changed', 3000)).to.equal(true)
    // the same connection carried both
    expect(link.since).to.equal(connectedSince)
    expect(link.state).to.equal('live')
  })

  it('says how the links are doing, on both sides', async () => {
    const agentB = request.agent(b.url)
    await agentB.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
    const { body: onB } = await agentB.get('/replicator/resources')
    const comments = onB.find(item => item.name === 'comments')
    expect(comments.receives).to.have.length(1)
    expect(comments.receives[0]).to.include({ peer: `${a.url}/api/`, peerId: 'aaaaaaaa', state: 'live', error: null })
    expect(comments.receives[0].received).to.be.at.least(2)
    expect(onB.find(item => item.name === 'authors').receives).to.deep.equal([])

    const agentA = request.agent(a.url)
    await agentA.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
    const { body: onA } = await agentA.get('/replicator/resources')
    const sends = onA.find(item => item.name === 'comments').sends
    expect(sends).to.have.length(1)
    expect(sends[0].peer).to.equal('bbbbbbbb')
    expect(sends[0].sent).to.be.at.least(2)
  })

  it('connects again after the peer stopped listening, and catches up', async () => {
    const link = b.cms.$replicator.links.find(item => item.name === 'comments')
    await a.cms.$replicator.replicator.close()
    a.cms.$replicator.replicator.server = null
    expect(await waitFor(() => link.state === 'reconnecting', 3000)).to.equal(true)
    const whileDown = await a.cms.api()('comments').create({ title: { enUS: 'written while the link was down' } })
    a.cms.$replicator.replicator.listen(a.cms.server)
    expect(await waitFor(() => has(b, 'comments', whileDown._id), 8000)).to.equal(true)
    expect(link.state).to.equal('live')
    expect(link.error).to.equal(null)
  })

  it('connects the links of a resource again on request', async () => {
    const agentB = request.agent(b.url)
    await agentB.post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
    const res = await agentB.post('/replicator/sync/comments')
    expect(res.status).to.equal(200)
    expect(res.body.result.links).to.have.length(1)
    const link = b.cms.$replicator.links.find(item => item.name === 'comments')
    expect(await waitFor(() => link.state === 'live', 5000)).to.equal(true)
    expect((await agentB.post('/replicator/sync/authors')).body.error).to.match(/no peer/)
    expect((await agentB.post('/replicator/sync/nothing')).status).to.equal(404)
  })

  it('brings the files of the records too', async () => {
    const articles = a.cms.api()('articles')
    const article = await articles.create({ string: { enUS: 'with a file' } })
    const attachment = await articles.createAttachment(article._id, { name: 'file', stream: fs.createReadStream(IMAGE), fields: { _filename: 'man.jpg' } })
    const onB = b.cms.api()('articles')
    // the record comes with the new attachment in it, then its file
    expect(await waitFor(async () => _.some(_.get(await onB.find(article._id).catch(() => null), '_attachments'), { _id: attachment._id }), 8000)).to.equal(true)
    // the file itself, checked the way the replicator checks it: it exists, and its checksum is the one of the record
    const store = b.cms.resource('articles').file
    const sameFile = await waitFor(async () => (await store.exists(attachment._id)) && (await md5Of(store.read(attachment._id))) === attachment._md5sum, 8000)
    expect(sameFile).to.equal(true)
  })

})

describe('how a link says what went wrong (unit)', () => {
  const { errorText } = require('../../lib/plugins/replicator/links')
  it('gives the codes of a connection that failed on every address, not an empty AggregateError', () => {
    const refused = (address) => Object.assign(new Error(''), { code: 'ECONNREFUSED', address, port: 9997 })
    expect(errorText(new AggregateError([refused('::1'), refused('127.0.0.1')]))).to.equal('ECONNREFUSED (port 9997)')
    expect(errorText(new Error('The replication peer answered 404'))).to.equal('The replication peer answered 404')
    expect(errorText(Object.assign(new Error(''), { code: 'ENOTFOUND' }))).to.equal('ENOTFOUND')
    expect(errorText('plain')).to.equal('plain')
  })
})

describe('which resources a node pulls (unit)', () => {
  let app
  afterEach(async () => { if (app) { await app.close(); app = undefined } })

  it('never pulls a resource it sends (upstream), and checks the direction of the peer with strictTypes', async () => {
    app = await startApp({ replication: { peers: [], peersByResource: {}, secret: randomSecret() } })
    const manager = app.cms.$replicator
    expect(manager.pullsFrom('upstream', { direction: 'upstream' })).to.equal(false)
    expect(manager.pullsFrom('downstream', {})).to.equal(true)
    expect(manager.pullsFrom('normal', { direction: 'downstream' })).to.equal(true)
    app.cms.options.replication.strictTypes = true
    expect(manager.pullsFrom('normal', { direction: 'downstream' })).to.equal(false)
    expect(manager.pullsFrom('downstream', { direction: 'upstream' })).to.equal(true)
    expect(manager.pullsFrom('normal', { direction: 'normal' })).to.equal(true)
    expect(manager.pullsFrom('normal', {})).to.equal(false)
  })

  it('opens no link without a secret, and says why', async () => {
    app = await startApp({ replication: { peers: [{ url: 'http://localhost:1/api/' }], peersByResource: {} } })
    expect(app.cms.$replicator.links).to.deep.equal([])
  })
})
