const _ = require('lodash')
const logger = require('../../logger')
const { parseCron, nextRun } = require('../../util/cron')

// Runs the syncs of the resources to sync, one after the other, and keeps what it did: for the Sync page, the command line and the
// schedule. A run is `push` (this CMS writes to the other one) or `pull` (the other CMS writes here).

const DIRECTIONS = { push: ['local', 'remote'], pull: ['remote', 'local'] }
// the longest a timer can wait (about 24 days): a later run is reached in several steps
const MAX_TIMER = 2 ** 31 - 1
/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * @param {number} code the status the routes answer
 * @param {string} message
 * @returns {Error} with `code`
 */
const failure = (code, message) => Object.assign(new Error(message), { code })

class SyncRunner {
  /**
   * @param {object} sync the sync plugin: its `api`, `config`, `syncedResources()`
   */
  constructor (sync) {
    this.sync = sync
    // the run that is going on, and the one that ended last
    this.current = null
    this.last = null
    // direction -> { cron, parsed, next, timer }
    this.schedule = {}
    // how long to wait for the other CMS to finish a resource, and how often to ask
    this.timeout = 30 * 60 * 1000
    this.pollMs = 500
    // when a schedule comes next (a function of its own so that a test can bring the time forward)
    this.nextRun = nextRun
  }

  // ---- one resource ----------------------------------------------------------------------------------------------------

  /**
   * The answer of a sync route as an object. A refusal or a failure is thrown, with the reason the other CMS gave.
   * @param {Response} response
   * @returns {Promise<*>}
   */
  async readBody (response) {
    let body
    try {
      body = await response.json()
    } catch {
      body = {}
    }
    if (!response.ok) {
      throw failure(response.status, _.get(body, 'error') || _.get(body, 'message') || `${response.status} ${response.statusText}`)
    }
    return body
  }

  /** A fetch that says which address could not be reached, without the token in it */
  async fetchRoute (url, options) {
    try {
      return await fetch(url, options)
    } catch (error) {
      const where = url.replace(/[?].*$/, '')
      throw new Error(`${where} could not be reached (${_.get(error, 'cause.code') || _.get(error, 'cause.message') || error.message})`, { cause: error })
    }
  }

  /**
   * Reads the records of a resource on one CMS (`from`) and sends them to the other (`to`), which then makes its records match them
   * in the background. Answers when they are sent.
   * @param {string} resource
   * @param {'local'|'remote'} from
   * @param {'local'|'remote'} to
   * @returns {Promise<void>}
   */
  async transfer (resource, from, to) {
    const settings = await this.sync.api('_sync').find({})
    _.each(['local.token', 'local.url', 'remote.token', 'remote.url'], key => {
      if (_.isEmpty(_.get(settings, key))) {
        throw new Error(`_sync config ${key} is not defined`)
      }
    })
    const read = await this.fetchRoute(`${settings[from].url}/sync/${resource}?token=${encodeURIComponent(settings[from].token)}`)
    const items = await this.readBody(read)
    const write = await this.fetchRoute(`${settings[to].url}/sync/${resource}?token=${encodeURIComponent(settings[to].token)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    })
    await this.readBody(write)
  }

  /**
   * Waits for a CMS to finish the sync of a resource it was sent, and answers its report.
   * @param {'local'|'remote'} env
   * @param {string} resource
   * @returns {Promise<{status: string, created?: number, updated?: number, removed?: number, error?: string}>}
   */
  async waitUntilDone (env, resource) {
    const settings = await this.sync.api('_sync').find({})
    const deadline = Date.now() + this.timeout
    for (;;) {
      const response = await this.fetchRoute(`${settings[env].url}/sync/${resource}/status?token=${encodeURIComponent(settings[env].token)}`)
      const report = await this.readBody(response)
      if (report.status !== 'syncing') {
        return report
      }
      if (Date.now() > deadline) {
        throw new Error(`the ${env} CMS did not finish in ${Math.round(this.timeout / 1000)}s`)
      }
      await sleep(this.pollMs)
    }
  }

  /**
   * Syncs one resource and says how it went. It never throws: a failure is the result.
   * @param {string} resource
   * @param {'push'|'pull'} direction
   * @returns {Promise<{resource: string, status: 'done'|'error', created?: number, updated?: number, removed?: number, error?: string, startedAt: number, finishedAt: number}>}
   */
  async syncOne (resource, direction) {
    const [from, to] = DIRECTIONS[direction]
    const result = { resource, status: 'done', startedAt: Date.now() }
    try {
      // a resource that cannot be matched by a unique key cannot be synced
      this.sync.api(resource).getUniqueKeys()
      await this.transfer(resource, from, to)
      const report = await this.waitUntilDone(to, resource)
      Object.assign(result, _.pick(report, ['created', 'updated', 'removed', 'attachmentsAdded', 'attachmentsRemoved', 'attachmentsFailed']))
      if (report.status === 'error') {
        result.status = 'error'
        result.error = report.error || 'the sync failed'
      }
    } catch (error) {
      result.status = 'error'
      result.error = _.get(error, 'message') || _.toString(error)
    }
    result.finishedAt = Date.now()
    return result
  }

  // ---- all of them ------------------------------------------------------------------------------------------------------

  /**
   * Checks that a run can start, and takes the place: only one run goes on at a time.
   * @param {'push'|'pull'} direction
   * @param {object} [options]
   * @param {string[]} [options.resources] only these (all the resources to sync when left out)
   * @param {string} [options.trigger] who asked: 'api', 'manual' (the admin or the command), 'schedule'
   * @returns {Promise<object>} the run, to give to execute()
   * @throws {Error} code 400 for a direction or a name that is not allowed, code 409 when a run is going on
   */
  async prepare (direction, { resources, trigger = 'api' } = {}) {
    if (!DIRECTIONS[direction]) {
      throw failure(400, `a direction is push or pull, not "${direction}"`)
    }
    if (this.current) {
      throw failure(409, `a ${this.current.direction} is already running`)
    }
    // taken before anything is awaited, so that two callers cannot both start
    const run = { direction, trigger, startedAt: Date.now(), resources: [], current: null, results: [] }
    this.current = run
    try {
      const allowed = await this.sync.syncedResources()
      const names = _.isEmpty(resources) ? allowed : _.uniq(resources)
      const unknown = _.difference(names, allowed)
      if (unknown.length > 0) {
        throw failure(400, `Not among the resources to sync: ${unknown.join(', ')}`)
      }
      run.resources = names
      return run
    } catch (error) {
      this.current = null
      throw error
    }
  }

  /**
   * Syncs the resources of a prepared run, one after the other, and goes on when one fails.
   * @param {object} run what prepare() answered
   * @returns {Promise<object>} the run, with a result for each resource
   */
  async execute (run) {
    try {
      for (const resource of run.resources) {
        run.current = resource
        run.results.push(await this.syncOne(resource, run.direction))
      }
    } finally {
      run.current = null
      run.finishedAt = Date.now()
      run.status = _.some(run.results, { status: 'error' }) || run.results.length < run.resources.length ? 'error' : 'done'
      this.last = run
      this.current = null
    }
    const failed = _.filter(run.results, { status: 'error' })
    logger.info(`sync: ${run.direction} of ${run.resources.length} resource(s) by ${run.trigger}: ${run.results.length - failed.length} done, ${failed.length} failed`)
    return run
  }

  /**
   * Syncs the resources to sync in a direction, one after the other, and answers when they are all done.
   * @param {'push'|'pull'} direction push: this CMS writes to the other one. pull: the other CMS writes here.
   * @param {object} [options] see prepare()
   * @returns {Promise<object>} { direction, trigger, startedAt, finishedAt, status, resources, results }
   */
  async run (direction, options) {
    return this.execute(await this.prepare(direction, options))
  }

  /**
   * What is going on, what happened last, and what is scheduled: what the Sync page and the command line show. The times of the
   * schedule are read in the time zone of the server, which is told as well.
   * @returns {{running: object|false, last: object|null, schedule: object, timeZone: string}}
   */
  state () {
    return { running: this.current || false, last: this.last, schedule: this.scheduleInfo(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  }

  // ---- the schedule -----------------------------------------------------------------------------------------------------

  /**
   * Reads `sync.schedule` ({ push: '0 3 * * *', pull: '*\/30 * * * *' }) and refuses what is not valid, so that a typo shows at start-up.
   * @throws {Error} that names the setting
   */
  configureSchedule () {
    const schedule = _.get(this.sync.config, 'schedule')
    if (schedule === undefined || schedule === null) {
      return
    }
    if (!_.isPlainObject(schedule)) {
      throw new Error('sync.schedule is an object: { push: "0 3 * * *", pull: "*/30 * * * *" }')
    }
    _.each(schedule, (expression, direction) => {
      if (!DIRECTIONS[direction]) {
        throw new Error(`sync.schedule.${direction}: a schedule is for push or pull`)
      }
      if (expression === null || expression === false || expression === '') {
        return
      }
      try {
        const parsed = parseCron(expression)
        this.schedule[direction] = { parsed, cron: parsed.expression, next: null, timer: null }
      } catch (error) {
        throw new Error(`sync.schedule.${direction}: ${error.message}`, { cause: error })
      }
    })
  }

  /** Waits for the next time of each schedule. The timers do not keep the process alive. */
  startSchedule () {
    _.each(_.keys(this.schedule), direction => this.arm(direction))
  }

  /** Stops the schedule: no run starts on its own after this */
  stopSchedule () {
    _.each(this.schedule, entry => clearTimeout(entry.timer))
    this.schedule = {}
  }

  /** Sets the timer of a direction to its next time */
  arm (direction) {
    const entry = this.schedule[direction]
    if (!entry) {
      return
    }
    clearTimeout(entry.timer)
    entry.next = this.nextRun(entry.parsed)
    if (!entry.next) {
      logger.warn(`sync: the ${direction} schedule "${entry.cron}" never comes`)
      return
    }
    const wake = () => {
      const wait = entry.next.getTime() - Date.now()
      if (wait > 1000) {
        // a wait longer than a timer can hold is taken in steps
        entry.timer = setTimeout(wake, Math.min(wait, MAX_TIMER))
        entry.timer.unref()
        return
      }
      this.fire(direction)
    }
    entry.timer = setTimeout(wake, Math.min(Math.max(entry.next.getTime() - Date.now(), 0), MAX_TIMER))
    entry.timer.unref()
    logger.info(`sync: the ${direction} schedule "${entry.cron}" runs next at ${entry.next.toString()}`)
  }

  /** The time of a schedule has come: runs, then waits for the next time (counted from the end of the run, so a late run skips none twice) */
  async fire (direction) {
    const entry = this.schedule[direction]
    try {
      await this.run(direction, { trigger: 'schedule' })
    } catch (error) {
      logger.error(`sync: the scheduled ${direction} did not run: ${error.message}`)
    } finally {
      if (this.schedule[direction] === entry) {
        this.arm(direction)
      }
    }
  }

  /** @returns {{push: {cron: string, next: number|null}|null, pull: {cron: string, next: number|null}|null}} */
  scheduleInfo () {
    return _.mapValues(_.pick(_.assign({ push: null, pull: null }, this.schedule), ['push', 'pull']), entry => entry ? { cron: entry.cron, next: entry.next ? entry.next.getTime() : null } : null)
  }
}

module.exports = { SyncRunner }
