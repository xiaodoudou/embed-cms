const _ = require('lodash')
const ExpressManager = require('./ExpressManager')
const { collectSystem, withNetworkRate } = require('./util/systemStats')
const logger = require('./logger')
const applySseCors = require('./util/sseCors')
class SystemManager extends ExpressManager {
  constructor() {
    super()
    this.refreshIntervalDuration = 5000
    this.heartbeatIntervalDuration = 15000
  }
  init = (cms, options) => {
    this.cms = cms
    this.options = options
    this.clients = []
    this.clientsIntervals = []
    this.systemInfo = {}
    this.app.get('/api/system', this.onGetSystem)
    // the first report can take a moment: a client that connects meanwhile waits for it instead of getting an empty one
    this.firstReport = this.updateSystemInfo()
    // one refresh loop per instance; unref so it never keeps the process alive
    clearInterval(this.refreshTimer)
    this.refreshTimer = setInterval(async () => {
      await this.updateSystemInfo()
      _.each(this.clients, (client) => {
        this.sendSystemInfo(client)
      })
    }, this.refreshIntervalDuration)
    this.refreshTimer.unref()
  }
  updateSystemInfo = async () => {
    this.systemInfo = await this.getSystem()
  }
  // the live traffic is the difference between two reports: the previous counters are kept here
  networkState = {}
  getSystem = async () => withNetworkRate(await collectSystem(), this.networkState)
  sendSystemInfo = (client) => {
    client.write(`data: ${JSON.stringify(this.systemInfo)}\n\n`)
  }
  onGetSystem = async (req, res) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream')
      applySseCors(req, res, _.get(this.cms, 'security.sseCors', '*'))
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      await this.firstReport
      this.sendSystemInfo(res)
      this.clients.push(res)
      const heartbeatInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': heartbeat\n\n')
        } else {
          clearInterval(heartbeatInterval)
        }
      }, this.heartbeatIntervalDuration)
      req.on('close', () => {
        this.clients.splice(this.clients.indexOf(res), 1)
        clearInterval(heartbeatInterval)
      })
    } catch (error) {
      logger.error('Error while getting system info:', error)
    }
  }
}
exports = module.exports = new SystemManager()
