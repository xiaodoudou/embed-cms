const request = require('supertest')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const waitFor = async (check, timeout = 8000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await check()) return true
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return false
}

const keys = async (app, resource) => (await app.cms.api()(resource).list()).map(item => item.key).sort()
const names = async (app, resource) => Object.fromEntries((await app.cms.api()(resource).list()).map(item => [item.key, item.name && item.name.en]))

// two real servers: A is this CMS, B is the other one. A push writes to B, a pull writes to A.
describe('sync plugin: running the syncs of all the resources (unit)', () => {
  let A, B

  const fill = async (app, resource, items) => {
    for (const item of items) {
      await app.cms.api()(resource).create(item)
    }
  }
  const empty = async (app, resource) => {
    for (const item of await app.cms.api()(resource).list()) {
      await app.cms.api()(resource).remove(item._id)
    }
  }

  before(async () => {
    const options = { sync: { resources: ['cities', 'countries'] }, disableJwtLogin: true }
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
    for (const app of [A, B]) {
      for (const resource of ['cities', 'countries']) {
        await empty(app, resource)
      }
    }
    await fill(A, 'cities', [{ key: 'paris', name: { en: 'Paris' } }, { key: 'rome', name: { en: 'Rome' } }])
    await fill(A, 'countries', [{ key: 'fr', name: { en: 'France' } }])
    await fill(B, 'cities', [{ key: 'rome', name: { en: 'Roma' } }, { key: 'lyon', name: { en: 'Lyon' } }])
    await fill(B, 'countries', [{ key: 'de', name: { en: 'Germany' } }])
    A.cms.$sync.runner.last = null
  })

  describe('one resource, from code', () => {
    it('pushes: the other CMS ends with the records of this one, and answers how it went', async () => {
      const result = await A.cms.$sync.run('cities', 'push')
      expect(result).to.include({ resource: 'cities', status: 'done', created: 1, updated: 1, removed: 1 })
      expect(result.finishedAt).to.be.at.least(result.startedAt)
      expect(await keys(B, 'cities')).to.deep.equal(['paris', 'rome'])
      expect(await names(B, 'cities')).to.deep.equal({ paris: 'Paris', rome: 'Rome' })
      // the resources that were not asked for are left alone
      expect(await keys(B, 'countries')).to.deep.equal(['de'])
    })

    it('pulls: this CMS ends with the records of the other one', async () => {
      const result = await A.cms.$sync.run('cities', 'pull')
      expect(result).to.include({ resource: 'cities', status: 'done', created: 1, updated: 1, removed: 1 })
      expect(await keys(A, 'cities')).to.deep.equal(['lyon', 'rome'])
      expect(await names(A, 'cities')).to.deep.equal({ lyon: 'Lyon', rome: 'Roma' })
      expect(await keys(B, 'cities')).to.deep.equal(['lyon', 'rome'])
    })

    it('changes nothing when both are alike', async () => {
      await A.cms.$sync.run('cities', 'push')
      const again = await A.cms.$sync.run('cities', 'push')
      expect(again).to.include({ status: 'done', created: 0, updated: 0, removed: 0 })
    })

    it('says why it could not: a token the other CMS does not know', async () => {
      const settings = await A.cms.api()('_sync').find({})
      await A.cms.api()('_sync').update(settings._id, { remote: { token: 'wrong', url: B.url } })
      try {
        const result = await A.cms.$sync.run('cities', 'push')
        expect(result.status).to.equal('error')
        expect(result.error).to.equal('token is not match')
        expect(await keys(B, 'cities')).to.deep.equal(['lyon', 'rome'])
      } finally {
        await A.cms.api()('_sync').update(settings._id, { remote: { token: 'token-b', url: B.url } })
      }
    })

    it('says why it could not: the other CMS does not allow writing, and it is not reachable', async () => {
      const settingsB = await B.cms.api()('_sync').find({})
      await B.cms.api()('_sync').update(settingsB._id, { allows: ['read'] })
      try {
        const refused = await A.cms.$sync.run('cities', 'push')
        expect(refused.status).to.equal('error')
        expect(refused.error).to.equal('write data is not allowed')
      } finally {
        await B.cms.api()('_sync').update(settingsB._id, { allows: ['read', 'write'] })
      }
      const settings = await A.cms.api()('_sync').find({})
      await A.cms.api()('_sync').update(settings._id, { remote: { token: 'token-b', url: 'http://127.0.0.1:1' } })
      try {
        const unreachable = await A.cms.$sync.run('cities', 'push')
        expect(unreachable.status).to.equal('error')
        expect(unreachable.error).to.match(/^http:\/\/127\.0\.0\.1:1\/sync\/cities could not be reached/)
        // the token is not in the message
        expect(unreachable.error).to.not.contain('token-b')
      } finally {
        await A.cms.api()('_sync').update(settings._id, { remote: { token: 'token-b', url: B.url } })
      }
    })

    it('says when the settings are not complete', async () => {
      const settings = await A.cms.api()('_sync').find({})
      await A.cms.api()('_sync').update(settings._id, { remote: { token: 'token-b', url: '' } })
      try {
        const result = await A.cms.$sync.run('cities', 'push')
        expect(result.error).to.equal('_sync config remote.url is not defined')
      } finally {
        await A.cms.api()('_sync').update(settings._id, { remote: { token: 'token-b', url: B.url } })
      }
    })

    it('refuses a resource that is not among the resources to sync, a bad direction, and says so with a code', async () => {
      const unknown = await A.cms.$sync.run('articles', 'push').catch(error => error)
      expect(unknown).to.be.an('error')
      expect(unknown.code).to.equal(400)
      expect(unknown.message).to.equal('Not among the resources to sync: articles')
      const direction = await A.cms.$sync.run('cities', 'sideways').catch(error => error)
      expect(direction.code).to.equal(400)
      expect(direction.message).to.contain('push or pull')
    })
  })

  describe('all the resources', () => {
    it('pushes them one after the other, in the order of the list', async () => {
      const run = await A.cms.$sync.runAll('push')
      expect(run).to.include({ direction: 'push', trigger: 'api', status: 'done' })
      expect(run.resources).to.deep.equal(['cities', 'countries'])
      expect(run.results.map(item => [item.resource, item.status])).to.deep.equal([['cities', 'done'], ['countries', 'done']])
      expect(run.finishedAt).to.be.at.least(run.startedAt)
      expect(await keys(B, 'cities')).to.deep.equal(['paris', 'rome'])
      expect(await keys(B, 'countries')).to.deep.equal(['fr'])
    })

    it('pulls them', async () => {
      const run = await A.cms.$sync.runAll('pull')
      expect(run.status).to.equal('done')
      expect(await keys(A, 'cities')).to.deep.equal(['lyon', 'rome'])
      expect(await keys(A, 'countries')).to.deep.equal(['de'])
    })

    it('syncs only the ones asked for', async () => {
      const run = await A.cms.$sync.runAll('push', { resources: ['countries'] })
      expect(run.resources).to.deep.equal(['countries'])
      expect(await keys(B, 'countries')).to.deep.equal(['fr'])
      expect(await keys(B, 'cities')).to.deep.equal(['lyon', 'rome'])
    })

    it('goes on when one fails, and says which', async () => {
      // publicData has no unique field to match its records by, so it cannot be synced
      const runner = A.cms.$sync.runner
      const config = A.cms.$sync.config
      const before = config.resources
      config.resources = ['publicData', 'cities']
      try {
        const run = await runner.run('push')
        expect(run.status).to.equal('error')
        expect(run.results.map(item => [item.resource, item.status])).to.deep.equal([['publicData', 'error'], ['cities', 'done']])
        expect(run.results[0].error).to.match(/unique key/)
        expect(await keys(B, 'cities')).to.deep.equal(['paris', 'rome'])
      } finally {
        config.resources = before
      }
    })

    it('does not start a second run while one goes on, and takes the place again when it ends', async () => {
      const runner = A.cms.$sync.runner
      const first = await runner.prepare('push', { trigger: 'api' })
      const second = await A.cms.$sync.runAll('pull').catch(error => error)
      expect(second.code).to.equal(409)
      expect(second.message).to.equal('a push is already running')
      expect(runner.state().running).to.include({ direction: 'push' })
      await runner.execute(first)
      expect(runner.state().running).to.equal(false)
      expect((await A.cms.$sync.runAll('push')).status).to.equal('done')
    })

    it('takes the place back when the resources asked for are refused', async () => {
      const refused = await A.cms.$sync.runAll('push', { resources: ['nope'] }).catch(error => error)
      expect(refused.code).to.equal(400)
      expect(A.cms.$sync.runner.state().running).to.equal(false)
    })

    it('keeps the last run, with its results, for the page and the command', async () => {
      expect(A.cms.$sync.runner.state().last).to.equal(null)
      await A.cms.$sync.runAll('push')
      const { running, last } = A.cms.$sync.runner.state()
      expect(running).to.equal(false)
      expect(last.direction).to.equal('push')
      expect(last.results).to.have.length(2)
    })

    it('says what is going on while it goes on: the resource it is on, and the ones done', async () => {
      const runner = A.cms.$sync.runner
      const run = await runner.prepare('push')
      const original = runner.syncOne.bind(runner)
      let seen
      runner.syncOne = async (resource, direction) => {
        if (resource === 'countries') {
          seen = JSON.parse(JSON.stringify(runner.state().running))
        }
        return original(resource, direction)
      }
      try {
        await runner.execute(run)
      } finally {
        delete runner.syncOne
      }
      expect(seen.current).to.equal('countries')
      expect(seen.results.map(item => item.resource)).to.deep.equal(['cities'])
    })
  })

  describe('over HTTP', () => {
    const runs = (token = 'token-a') => request(A.url).get('/sync/runs').query({ token })

    it('starts a run at once, and how it goes is in /sync/runs', async () => {
      const res = await request(A.url).post('/sync/run/push').query({ token: 'token-a' })
      expect(res.status).to.equal(202)
      expect(res.body).to.deep.include({ started: true, direction: 'push', resources: ['cities', 'countries'] })
      expect(res.body.startedAt).to.be.a('number')
      expect(await waitFor(async () => (await runs()).body.last)).to.equal(true)
      const { body } = await runs()
      expect(body.running).to.equal(false)
      expect(body.last).to.include({ direction: 'push', trigger: 'manual', status: 'done' })
      expect(body.last.results).to.have.length(2)
      expect(body.schedule).to.deep.equal({ push: null, pull: null })
      expect(await keys(B, 'cities')).to.deep.equal(['paris', 'rome'])
    })

    it('syncs the resources named in ?resources=', async () => {
      const res = await request(A.url).post('/sync/run/pull').query({ token: 'token-a', resources: 'countries' })
      expect(res.status).to.equal(202)
      expect(res.body.resources).to.deep.equal(['countries'])
      expect(await waitFor(async () => (await runs()).body.last)).to.equal(true)
      expect(await keys(A, 'countries')).to.deep.equal(['de'])
      expect(await keys(A, 'cities')).to.deep.equal(['paris', 'rome'])
    })

    it('shows a run that goes on', async () => {
      const runner = A.cms.$sync.runner
      const run = await runner.prepare('pull')
      try {
        const { body } = await runs()
        expect(body.running).to.include({ direction: 'pull', trigger: 'api' })
        expect(body.running.resources).to.deep.equal(['cities', 'countries'])
        const second = await request(A.url).post('/sync/run/push').query({ token: 'token-a' })
        expect(second.status).to.equal(409)
      } finally {
        await runner.execute(run)
      }
    })

    it('refuses a resource that cannot be synced, and a direction that does not exist', async () => {
      const unknown = await request(A.url).post('/sync/run/push').query({ token: 'token-a', resources: 'cities,articles' })
      expect(unknown.status).to.equal(400)
      expect(unknown.body.error).to.equal('Not among the resources to sync: articles')
      expect((await request(A.url).post('/sync/run/sideways').query({ token: 'token-a' })).status).to.not.equal(202)
    })

    it('needs the token of this CMS, or a logged-in person', async () => {
      expect((await request(A.url).post('/sync/run/push')).status).to.equal(401)
      expect((await request(A.url).post('/sync/run/push').query({ token: 'wrong' })).status).to.equal(401)
      expect((await runs('wrong')).status).to.equal(401)
      expect((await request(A.url).get('/sync/runs')).status).to.equal(401)
      // a person who is logged in needs no token (Basic authentication here)
      const { ADMIN } = require('../helpers/app')
      expect((await request(A.url).get('/sync/runs').auth(...ADMIN)).status).to.equal(200)
    })

    it('does not start a GET: a link or an image cannot begin a sync', async () => {
      const res = await request(A.url).get('/sync/run/push').query({ token: 'token-a' })
      expect(res.status).to.not.equal(202)
      expect(A.cms.$sync.runner.state().running).to.equal(false)
    })

    it('still pushes one resource through the route of the Sync page, and tells when the other CMS refuses', async () => {
      const ok = await request(A.url).post('/sync/cities/from/local/to/remote').query({ token: 'token-a' })
      expect(ok.status).to.equal(200)
      expect(await waitFor(async () => (await keys(B, 'cities')).join() === 'paris,rome')).to.equal(true)
      const settingsB = await B.cms.api()('_sync').find({})
      await B.cms.api()('_sync').update(settingsB._id, { allows: ['read'] })
      try {
        const refused = await request(A.url).post('/sync/cities/from/local/to/remote').query({ token: 'token-a' })
        expect(refused.status).to.equal(403)
        expect(refused.body.error).to.equal('write data is not allowed')
      } finally {
        await B.cms.api()('_sync').update(settingsB._id, { allows: ['read', 'write'] })
      }
    })
  })
})
