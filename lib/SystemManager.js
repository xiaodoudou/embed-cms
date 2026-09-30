// const _ = require('lodash')
const osu = require('node-os-utils')
const _ = require('lodash')
const ExpressManager = require('./ExpressManager')
const cpu = osu.cpu
const mem = osu.mem
const netstat = osu.netstat
const drive = osu.drive
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
    this.updateSystemInfo()
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
  valOrDefault = async (func, defaultVal) => {
    try {
      return await func()
    } catch {}
    return defaultVal
  }
  getSystem = async () => {
    return {
      cpu: {
        count: cpu.count(),
        usage: await this.valOrDefault(cpu.usage, 0),
        model: cpu.model()
      },
      memory: await this.valOrDefault(mem.info, 0),
      network: await this.valOrDefault(netstat.inOut, 'not supported'),
      drive: await this.valOrDefault(drive.used, 'not supported'),
      uptime: Math.floor(process.uptime())
    }
  }
  sendSystemInfo = (client) => {
    client.write(`data: ${JSON.stringify(this.systemInfo)}\n\n`)
  }
  onGetSystem = async (req, res) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream')
      applySseCors(req, res, _.get(this.cms, 'security.sseCors', '*'))
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
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
