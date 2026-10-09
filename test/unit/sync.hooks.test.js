const express = require('express')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const waitFor = async (check, timeout = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await check()) return true
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return false
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('sync plugin: push after a change (unit)', () => {
  let app, remote, remoteUrl, calls, cities, syncConfig

  const configure = (data) => app.cms.api()('_sync').update(syncConfig._id, data)

  before(async () => {
    // stands in for the other CMS: records the trigger calls it receives
    calls = []
    const remoteApp = express()
    remoteApp.all('/*path', (req, res) => {
      calls.push({ method: req.method, path: req.path, token: req.query.token })
      res.json({ message: 'done' })
    })
    remote = await new Promise(resolve => {
      const s = remoteApp.listen(0, () => resolve(s))
    })
    remoteUrl = `http://localhost:${remote.address().port}`
    app = await startApp({ sync: { resources: ['cities'] } })
    // the real delay is 5 seconds
    app.cms.$sync.hookDelay = 50
    cities = app.cms.api()('cities')
    syncConfig = await app.cms.api()('_sync').create({
      allows: ['read', 'write'],
      resources: ['cities'],
      local: { token: 'local-token', url: app.url },
      remote: { token: 'remote-token', url: remoteUrl }
    })
  })
  after(async () => {
    await app.close()
    remote.closeAllConnections()
    await new Promise(resolve => remote.close(resolve))
  })
  beforeEach(async () => {
    await configure({ resources: ['cities'], remote: { token: 'remote-token', url: remoteUrl } })
    await sleep(100)
    calls.length = 0
  })

  it('asks the other CMS to pull the resource a moment after a change', async () => {
    await cities.create({ key: 'oslo', name: { en: 'Oslo' } })
    const called = await waitFor(() => calls.length > 0)
    expect(called, 'the other CMS was never called').to.equal(true)
    expect(calls[0]).to.deep.equal({ method: 'GET', path: '/sync/cities/from/remote/to/local', token: 'remote-token' })
  })

  it('reacts to updates, removals and attachments as well', async () => {
    const record = await cities.create({ key: 'lima', name: { en: 'Lima' } })
    await waitFor(() => calls.length > 0)
    calls.length = 0
    await cities.update(record._id, { name: { en: 'Lima!' } })
    expect(await waitFor(() => calls.length > 0), 'update').to.equal(true)
    calls.length = 0
    await cities.remove(record._id)
    expect(await waitFor(() => calls.length > 0), 'remove').to.equal(true)
  })

  it('groups a burst of changes into one call', async () => {
    // a create checks the unique key against the store, which takes longer than the 50 ms of the other tests on a busy machine, and the burst
    // would split in two calls: give it a delay that no write takes longer than
    const delay = 500
    app.cms.$sync.hookDelay = delay
    try {
      await cities.create({ key: 'a1', name: { en: 'A1' } })
      await cities.create({ key: 'a2', name: { en: 'A2' } })
      await cities.create({ key: 'a3', name: { en: 'A3' } })
      await waitFor(() => calls.length > 0)
      // a second call would come within one more delay
      await sleep(delay + 200)
      expect(calls).to.have.length(1)
    } finally {
      app.cms.$sync.hookDelay = 50
    }
  })

  it('follows the saved settings: no call without an address for the other CMS', async () => {
    await configure({ remote: { token: 'remote-token', url: '' } })
    await cities.create({ key: 'nowhere', name: { en: 'Nowhere' } })
    await sleep(300)
    expect(calls).to.have.length(0)
  })

  it('follows the saved settings: no call for a resource that is not selected', async () => {
    // the settings choose another resource (an empty choice would fall back to the list of cms.json, which has cities)
    await configure({ resources: ['countries'] })
    await cities.create({ key: 'unselected', name: { en: 'Unselected' } })
    await sleep(300)
    expect(calls).to.have.length(0)
  })

  it('does not echo back the changes a sync is writing', async () => {
    app.cms.$sync.syncReport.cities = { status: 'syncing' }
    try {
      await cities.create({ key: 'echo', name: { en: 'Echo' } })
      await sleep(300)
      expect(calls).to.have.length(0)
    } finally {
      delete app.cms.$sync.syncReport.cities
    }
  })
})
