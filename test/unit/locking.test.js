const { expect } = require('chai')
const h = require('../../lib/helpers')
const { startApp } = require('../helpers/app')

// minimal stand-in for a driver context: on/next/error/end like the real one
const fakeContext = (resource) => {
  const listeners = {}
  const context = {
    resource,
    nexted: 0,
    on (name, fn) { (listeners[name] = listeners[name] || []).push(fn) },
    trigger (name, ...args) { (listeners[name] || []).forEach(fn => fn(...args)) },
    next () { context.nexted++ },
    end () { context.trigger('end'); Object.keys(listeners).forEach(k => delete listeners[k]) },
    error (e) { context.trigger('error', e); context.end() }
  }
  return context
}

describe('resource locking (unit)', () => {
  describe('lockResource / releaseResource', () => {
    it('lets the first operation through and queues the next ones', () => {
      const resource = {}
      const a = fakeContext(resource)
      const b = fakeContext(resource)
      h.lockResource(a)
      h.lockResource(b)
      expect(a.nexted).to.equal(1)
      expect(b.nexted).to.equal(0)
      h.releaseResource(a)
      expect(b.nexted).to.equal(1)
    })
    it('serves queued operations in the order they arrived', () => {
      const resource = {}
      const first = fakeContext(resource)
      h.lockResource(first)
      const order = []
      const queued = [1, 2, 3].map(n => {
        const c = fakeContext(resource)
        c.next = () => order.push(n)
        h.lockResource(c)
        return c
      })
      h.releaseResource(first)
      queued.slice(0, 2).forEach(c => h.releaseResource(c))
      expect(order).to.deep.equal([1, 2, 3])
    })
    it('frees the resource when nothing is waiting', () => {
      const resource = {}
      const a = fakeContext(resource)
      h.lockResource(a)
      expect(resource.locked).to.equal(true)
      h.releaseResource(a)
      expect(resource.locked).to.equal(false)
    })
    it('releasing twice does not steal the lock from the next operation', () => {
      const resource = {}
      const a = fakeContext(resource)
      const b = fakeContext(resource)
      const c = fakeContext(resource)
      h.lockResource(a)
      h.lockResource(b)
      h.lockResource(c)
      h.releaseResource(a)
      h.releaseResource(a)
      expect(b.nexted).to.equal(1)
      expect(c.nexted).to.equal(0)
    })
    it('releasing a context that never took the lock changes nothing', () => {
      const resource = {}
      const holder = fakeContext(resource)
      h.lockResource(holder)
      h.releaseResource(fakeContext(resource))
      expect(resource.locked).to.equal(true)
    })
    it('releases automatically when the operation ends, however it ends', () => {
      const resource = {}
      const a = fakeContext(resource)
      const b = fakeContext(resource)
      h.lockResource(a)
      h.lockResource(b)
      a.end()
      expect(b.nexted).to.equal(1)
    })
    it('releases when the operation fails', () => {
      const resource = {}
      const a = fakeContext(resource)
      const b = fakeContext(resource)
      h.lockResource(a)
      h.lockResource(b)
      a.error(new Error('boom'))
      expect(b.nexted).to.equal(1)
    })
  })

  describe('through the resource api', () => {
    let app, api

    before(async () => {
      app = await startApp({ xlsx: true })
      api = app.cms.api()
    })
    after(async () => {
      await app.close()
    })

    const within = (promise, ms = 2000) => Promise.race([
      promise,
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('operation hung, the resource lock was never released')), ms))
    ])

    it('maxCount: a create at the limit returns the existing record', async () => {
      const first = await api('_xlsx').create({ token: 'one' })
      const second = await api('_xlsx').create({ token: 'two' })
      expect(second._id).to.equal(first._id)
      expect((await api('_xlsx').list()).length).to.equal(1)
    })
    it('maxCount: the resource is still usable after a create hit the limit', async () => {
      const [record] = await api('_xlsx').list()
      const updated = await within(api('_xlsx').update(record._id, { token: 'three' }))
      expect(updated).to.have.property('token', 'three')
      await within(api('_xlsx').create({ token: 'again' }))
      await within(api('_xlsx').create({ token: 'and again' }))
    })
    it('a failed create (duplicate) does not block later creates', async () => {
      await api('cities').create({ key: 'dup', name: { en: 'x' } })
      for (let i = 0; i < 3; i++) {
        let error
        try { await within(api('cities').create({ key: 'dup', name: { en: 'y' } })) } catch (e) { error = e }
        expect(error, `attempt ${i}`).to.have.property('code', 400)
      }
      await within(api('cities').create({ key: 'fine', name: { en: 'z' } }))
    })
    it('mixed parallel creates and updates all finish', async () => {
      const seed = await api('publicData').create({ message: 'seed' })
      const jobs = []
      for (let i = 0; i < 10; i++) {
        jobs.push(api('publicData').create({ message: `c${i}` }))
        jobs.push(api('publicData').update(seed._id, { message: `u${i}` }))
      }
      const results = await within(Promise.all(jobs), 5000)
      expect(results).to.have.length(20)
    })
  })
})
