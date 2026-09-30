const util = require('util')

const LEVELS = { error: 0, warn: 1, info: 2, verbose: 3, debug: 4 }
const STREAMS = { error: 'error', warn: 'warn', info: 'log', verbose: 'log', debug: 'log' }

class Logger {
  constructor (options = {}) {
    this.level = options.level || process.env.LOG_LEVEL || 'info'
  }

  log (level, args) {
    if (LEVELS[level] > (LEVELS[this.level] ?? LEVELS.info)) {
      return
    }
    console[STREAMS[level]](`${new Date().toISOString()} ${level.toUpperCase()} ${util.format(...args)}`)
  }

  error (...args) { this.log('error', args) }
  warn (...args) { this.log('warn', args) }
  info (...args) { this.log('info', args) }
  verbose (...args) { this.log('verbose', args) }
  debug (...args) { this.log('debug', args) }
}

// one shared instance: every module logs through it, so the level is configured in one place (LOG_LEVEL)
module.exports = new Logger()
module.exports.Logger = Logger
