const util = require('util')

// 'silent' writes nothing (the test run uses it)
const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, verbose: 3, debug: 4 }
const STREAMS = { error: 'error', warn: 'warn', info: 'log', verbose: 'log', debug: 'log' }

// each color closes with its own code (39: default color, 22: not bold) rather than a full reset, and uses one code
// per escape: the System log page turns these into HTML (lib/SyslogManager.js convertToHTML), which only renders that
const paint = (open, close = '\x1b[39m') => (text) => `${open}${text}${close}`
const COLORS = {
  time: paint('\x1b[32m'),
  error: paint('\x1b[1m\x1b[31m', '\x1b[39m\x1b[22m'),
  warn: paint('\x1b[33m'),
  info: paint('\x1b[36m'),
  verbose: paint('\x1b[35m'),
  debug: paint('\x1b[90m')
}

// colors only when a human is looking (the stream is a TTY), unless forced/disabled via FORCE_COLOR / NO_COLOR.
// Each stream is checked on its own: warnings and errors go to stderr, which can be redirected to a file alone
function detectColors (stream) {
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true
  return Boolean(stream.isTTY)
}

class Logger {
  constructor (options = {}) {
    this.level = options.level || process.env.LOG_LEVEL || 'info'
    // options.colors (true or false) overrides the detection for every stream
    this.colors = {
      log: options.colors ?? detectColors(process.stdout),
      warn: options.colors ?? detectColors(process.stderr),
      error: options.colors ?? detectColors(process.stderr)
    }
  }

  /**
   * Writes a line through the console when the level is at or above the configured one (LOG_LEVEL).
   * @param {string} level
   * @param {unknown[]} args
   */
  log (level, args) {
    if (LEVELS[level] > (LEVELS[this.level] ?? LEVELS.info)) {
      return
    }
    const stream = STREAMS[level]
    const time = new Date().toISOString()
    const label = level.toUpperCase()
    // without colors this is util.format: the plain line is the colored one with the escape codes taken out
    const message = util.formatWithOptions({ colors: this.colors[stream] }, ...args)
    if (!this.colors[stream]) {
      console[stream](`${time} ${label} ${message}`)
      return
    }
    console[stream](`${COLORS.time(time)} ${COLORS[level](label)} ${message}`)
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
