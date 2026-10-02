const request = require('supertest')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')

const TOKEN = 'local-token'

const waitFor = async (check, timeout = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await check()) return true
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}

describe('sync plugin: a failed sync (unit)', () => {
  let app, unhandled
  const onUnhandled = (reason) => unhandled.push(reason)

  before(async () => {
    app = await startApp({ sync: { resources: ['cities'] } })
    // no local.url: the sync fails after the request was answered
    await app.cms.api()('_sync').create({
      allows: ['read', 'write'],
      local: { token: TOKEN, url: '' },
      remote: { token: 'remote-token', url: '' }
    })
  })
  after(async () => {
    await app.close()
  })
  beforeEach(() => {
    unhandled = []
    process.prependListener('unhandledRejection', onUnhandled)
  })
  afterEach(() => {
    process.removeListener('unhandledRejection', onUnhandled)
  })

  it('is logged and reported as an error status, not left as an unhandled rejection', async () => {
    const res = await request(app.url).put('/sync/cities').query({ token: TOKEN }).send([{ key: 'paris' }])
    expect(res.status).to.equal(200)
    const failed = await waitFor(async () => {
      const status = await request(app.url).get('/sync/cities/status').query({ token: TOKEN })
      return status.body.status === 'error'
    })
    expect(failed, 'the status never reported the failure').to.equal(true)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(unhandled, 'unhandled rejection').to.have.length(0)
    const status = await request(app.url).get('/sync/cities/status').query({ token: TOKEN })
    expect(status.body.error).to.be.a('string').and.include('local.url')
  })

  it('accepts a new sync after a failure', async () => {
    const res = await request(app.url).put('/sync/cities').query({ token: TOKEN }).send([])
    expect(res.status).to.equal(200)
  })
})
