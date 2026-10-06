const request = require('supertest')
const { expect } = require('chai')
const { startApp, ADMIN } = require('../helpers/app')
const { nextRun } = require('../../lib/util/cron')

const waitFor = async (check, timeout = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await check()) return true
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  return false
}
const refusal = async (promise) => {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

describe('sync plugin: the schedule (unit)', () => {
  describe('what it shows', () => {
    let app
    before(async () => {
      app = await startApp({ sync: { resources: ['cities'], schedule: { push: '0 3 * * *', pull: '*/30 * * * *' } }, disableJwtLogin: true })
    })
    after(async () => {
      app.cms.$sync.runner.stopSchedule()
      await app.close()
    })

    it('knows each schedule and when it comes next', () => {
      const info = app.cms.$sync.runner.scheduleInfo()
      expect(info.push.cron).to.equal('0 3 * * *')
      expect(info.push.next).to.equal(nextRun('0 3 * * *').getTime())
      expect(info.pull.cron).to.equal('*/30 * * * *')
      expect(info.pull.next).to.be.within(Date.now(), Date.now() + 30 * 60 * 1000)
    })

    it('shows them to the Sync page, with nothing run yet', async () => {
      const res = await request(app.url).get('/sync/runs').auth(...ADMIN)
      expect(res.status).to.equal(200)
      expect(res.body.running).to.equal(false)
      expect(res.body.last).to.equal(null)
      expect(res.body.schedule.push).to.deep.equal({ cron: '0 3 * * *', next: nextRun('0 3 * * *').getTime() })
      expect(res.body.schedule.pull.cron).to.equal('*/30 * * * *')
      // the times are those of the server: its time zone comes with them
      expect(res.body.timeZone).to.equal(Intl.DateTimeFormat().resolvedOptions().timeZone)
    })

    it('waits with timers that do not keep the process alive', () => {
      const entry = app.cms.$sync.runner.schedule.push
      expect(entry.timer).to.be.an('object')
      expect(entry.timer.hasRef()).to.equal(false)
    })
  })

  describe('a direction left out', () => {
    it('has no schedule, and says so', async () => {
      const app = await startApp({ sync: { resources: ['cities'], schedule: { pull: '0 4 * * 1' } }, disableJwtLogin: true })
      try {
        expect(app.cms.$sync.runner.scheduleInfo().push).to.equal(null)
        expect(app.cms.$sync.runner.scheduleInfo().pull.cron).to.equal('0 4 * * 1')
      } finally {
        app.cms.$sync.runner.stopSchedule()
        await app.close()
      }
    })

    it('is the same with no schedule at all, or an empty one', async () => {
      for (const schedule of [undefined, null, {}, { push: '', pull: null }]) {
        const app = await startApp({ sync: { resources: ['cities'], schedule }, disableJwtLogin: true })
        try {
          expect(app.cms.$sync.runner.scheduleInfo()).to.deep.equal({ push: null, pull: null })
        } finally {
          await app.close()
        }
      }
    })
  })

  describe('a schedule that is not valid', () => {
    it('stops the start-up and names the setting and the field', async () => {
      const wrong = await refusal(startApp({ sync: { resources: ['cities'], schedule: { push: '60 3 * * *' } }, disableJwtLogin: true }))
      expect(wrong, 'a refusal').to.be.an('error')
      expect(wrong.message).to.match(/^sync\.schedule\.push: the minute .* out of range \(0-59\)/)
      const short = await refusal(startApp({ sync: { resources: ['cities'], schedule: { pull: '0 3 * *' } }, disableJwtLogin: true }))
      expect(short.message).to.match(/^sync\.schedule\.pull: .* has 4 fields/)
    })

    it('refuses a direction that is not push or pull, and a schedule that is not an object', async () => {
      const direction = await refusal(startApp({ sync: { resources: ['cities'], schedule: { sideways: '0 3 * * *' } }, disableJwtLogin: true }))
      expect(direction.message).to.equal('sync.schedule.sideways: a schedule is for push or pull')
      const text = await refusal(startApp({ sync: { resources: ['cities'], schedule: '0 3 * * *' }, disableJwtLogin: true }))
      expect(text.message).to.match(/^sync\.schedule is an object/)
    })
  })

  describe('when the time comes', () => {
    let app
    let runs

    beforeEach(async () => {
      app = await startApp({ sync: { resources: ['cities'], schedule: { push: '0 3 * * *' } }, disableJwtLogin: true })
      runs = []
      app.cms.$sync.runner.run = async (direction, options) => {
        runs.push({ direction, options })
        return {}
      }
    })
    afterEach(async () => {
      app.cms.$sync.runner.stopSchedule()
      await app.close()
    })

    it('runs, as the schedule, and waits for the next time', async () => {
      const runner = app.cms.$sync.runner
      const before = runner.schedule.push.next
      await runner.fire('push')
      expect(runs).to.deep.equal([{ direction: 'push', options: { trigger: 'schedule' } }])
      expect(runner.schedule.push.next.getTime()).to.be.at.least(before.getTime())
      expect(runner.schedule.push.timer).to.be.an('object')
    })

    it('goes on waiting when a run cannot start (one is going on), and says nothing is thrown', async () => {
      const runner = app.cms.$sync.runner
      runner.run = async () => { throw Object.assign(new Error('a push is already running'), { code: 409 }) }
      await runner.fire('push')
      expect(runner.schedule.push.next).to.be.an.instanceof(Date)
    })

    it('fires by itself when the timer runs out, and then waits again', async () => {
      const runner = app.cms.$sync.runner
      let calls = 0
      // the next time is 40ms away, however the schedule is written
      runner.nextRun = () => {
        calls++
        return new Date(Date.now() + 40)
      }
      runner.arm('push')
      expect(await waitFor(() => runs.length >= 2)).to.equal(true)
      expect(runs.every(item => item.direction === 'push' && item.options.trigger === 'schedule')).to.equal(true)
      expect(calls).to.be.at.least(2)
    })

    it('does not fire early when it wakes before the time (a wait longer than a timer can hold is taken in steps)', async () => {
      const runner = app.cms.$sync.runner
      const entry = runner.schedule.push
      // an hour away: the timer is armed for the whole wait, and nothing has run
      runner.nextRun = () => new Date(Date.now() + 60 * 60 * 1000)
      runner.arm('push')
      expect(runs).to.have.length(0)
      expect(entry.next.getTime()).to.be.within(Date.now() + 59 * 60 * 1000, Date.now() + 61 * 60 * 1000)
    })

    it('stops for good when it is stopped: nothing fires, and nothing is scheduled', async () => {
      const runner = app.cms.$sync.runner
      runner.nextRun = () => new Date(Date.now() + 30)
      runner.arm('push')
      runner.stopSchedule()
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(runs).to.have.length(0)
      expect(runner.scheduleInfo()).to.deep.equal({ push: null, pull: null })
    })

    it('does not wait for a day that never comes, and says so', async () => {
      const runner = app.cms.$sync.runner
      runner.nextRun = () => null
      runner.arm('push')
      expect(runner.schedule.push.next).to.equal(null)
      expect(runner.scheduleInfo().push).to.deep.equal({ cron: '0 3 * * *', next: null })
    })
  })

  describe('a scheduled run of two servers', () => {
    let A, B
    before(async () => {
      const options = { sync: { resources: ['cities'] }, disableJwtLogin: true }
      A = await startApp({ ...options, sync: { resources: ['cities'], schedule: { push: '0 3 * * *' } } })
      B = await startApp(options)
      A.cms.$sync.runner.pollMs = 20
      B.cms.$sync.runner.pollMs = 20
      await A.cms.api()('_sync').create({ allows: ['read', 'write'], local: { token: 'a', url: A.url }, remote: { token: 'b', url: B.url } })
      await B.cms.api()('_sync').create({ allows: ['read', 'write'], local: { token: 'b', url: B.url }, remote: { token: 'a', url: A.url } })
      await A.cms.api()('cities').create({ key: 'oslo', name: { en: 'Oslo' } })
    })
    after(async () => {
      A.cms.$sync.runner.stopSchedule()
      await A.close()
      await B.close()
    })

    it('really pushes, and the last run says it came from the schedule', async () => {
      await A.cms.$sync.runner.fire('push')
      expect((await B.cms.api()('cities').list()).map(item => item.key)).to.deep.equal(['oslo'])
      const { last } = A.cms.$sync.runner.state()
      expect(last).to.include({ direction: 'push', trigger: 'schedule', status: 'done' })
      expect(last.results[0]).to.include({ resource: 'cities', status: 'done', created: 1 })
      // and it is waiting for the next time
      expect(A.cms.$sync.runner.scheduleInfo().push.next).to.be.greaterThan(Date.now())
    })
  })
})
