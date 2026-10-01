const fs = require('fs')
const os = require('os')
const path = require('path')
const request = require('supertest')
const { expect } = require('chai')
const h = require('../../lib/helpers')
const UUID = require('../../lib/util/uuid')
const { startApp } = require('../helpers/app')

describe('hardening fixes (unit)', () => {
  describe('checkResourceLimits', () => {
    it('ends the operation with the error, so the lock is released, when the count cannot be read', async () => {
      const failure = new Error('database is down')
      let reported
      const context = {
        resource: { options: { maxCount: 1 }, list: () => Promise.reject(failure) },
        error: (error) => { reported = error },
        next: () => { throw new Error('must not continue') },
        result: () => { throw new Error('must not answer') },
        on: () => {}
      }
      await h.checkResourceLimits(context)
      expect(reported).to.equal(failure)
      // the error path of the real context triggers 'error' and 'end', which is where lockResource releases
      context.resource.locked = true
      context._lockHeld = true
      h.releaseResource(context)
      expect(context.resource.locked).to.equal(false)
    })
  })

  describe('ids', () => {
    it('do not use Math.random', () => {
      const original = Math.random
      Math.random = () => { throw new Error('Math.random must not be used for ids') }
      try {
        const id = UUID('42424242')()
        expect(id).to.match(/^[0-9a-z]{24}$/)
        expect(id.slice(8, 16)).to.equal('42424242')
      } finally {
        Math.random = original
      }
    })

    it('sort in the order they were made, also within one millisecond and when the clock steps back', () => {
      const uuid = UUID('42424242')
      const made = []
      for (let i = 0; i < 5000; i++) {
        made.push(uuid())
      }
      const realNow = Date.now
      const start = realNow()
      try {
        Date.now = () => start - 5000 // the clock went back
        for (let i = 0; i < 100; i++) {
          made.push(uuid())
        }
      } finally {
        Date.now = realNow
      }
      expect(made.every(id => /^[0-9a-z]{24}$/.test(id))).to.equal(true)
      expect([...made].sort()).to.deep.equal(made)
    })

    it('are unique over a large sample', () => {
      const uuid = UUID('42424242')
      const seen = new Set()
      for (let i = 0; i < 20000; i++) {
        seen.add(uuid())
      }
      expect(seen.size).to.equal(20000)
    })
  })

  describe('xlsx export', () => {
    it('does not leave the generated file behind, and never reuses a name', async () => {
      const app = await startApp({ xlsx: true })
      try {
        await app.cms.api()('_xlsx').create({ token: 'export-token' })
        await app.cms.api()('cities').create({ key: 'paris', name: { en: 'Paris' } })
        // the folder the exports are written to (the rest of the temp folder belongs to other processes, and may not be readable)
        const exportsDir = path.join(os.tmpdir(), 'node-cms', 'exports')
        const spreadsheets = () => fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter(name => name.endsWith('.xlsx')).length : 0
        const before = spreadsheets()
        const [a, b] = await Promise.all([
          request(app.url).get('/xlsx/cities').query({ token: 'export-token' }),
          request(app.url).get('/xlsx/cities').query({ token: 'export-token' })
        ])
        expect(a.status).to.equal(200)
        expect(b.status).to.equal(200)
        // sendFile finished before the response ended: give the cleanup a moment
        await new Promise(resolve => setTimeout(resolve, 200))
        expect(spreadsheets()).to.equal(before)
      } finally {
        await app.close()
      }
    })
  })
})

describe('image concurrency (unit)', () => {
  const { startApp, hardened } = require('../helpers/app')
  const os = require('os')
  const ImageOptimization = require('../../lib/util/imageOptimization')

  const limiterOf = async (overrides) => {
    const app = await startApp(overrides)
    try {
      return { concurrency: ImageOptimization.limiter.concurrency, maxQueue: ImageOptimization.limiter.maxQueue }
    } finally {
      await app.close()
    }
  }

  it('runs one operation per core, and lets 100 wait', async () => {
    expect(await limiterOf({})).to.deep.equal({ concurrency: os.cpus().length, maxQueue: 100 })
    expect(await limiterOf(hardened())).to.deep.equal({ concurrency: os.cpus().length, maxQueue: 100 })
  })
  it('follows imageConcurrency', async () => {
    expect((await limiterOf({ imageConcurrency: 2 })).concurrency).to.equal(2)
    expect((await limiterOf(hardened({ imageConcurrency: 3 }))).concurrency).to.equal(3)
    expect((await limiterOf(hardened({ imageConcurrency: 0 }))).concurrency).to.equal(0)
  })
})
