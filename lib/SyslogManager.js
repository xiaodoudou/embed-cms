const _ = require('lodash')
const os = require('os')
const fs = require('fs-extra')
const spawn = require('child_process').spawn
const ansiHTML = require('ansi-html')
const TailingReadableStream = require('tailing-stream')
const Tail = require('tail').Tail
// the sample lines only need two styles: plain ANSI escapes, no colour library
const ansi = (codes, text) => `\u001b[${codes.join(';')}m${text}\u001b[0m`
const Dayjs = require('dayjs')
const util = require('util')
const { table } = require('table')
const ExpressManager = require('./ExpressManager')
const logger = require('./logger')
const applySseCors = require('./util/sseCors')
class SyslogManager extends ExpressManager {
  constructor() {
    super()
    ansiHTML.setColors({
      reset: ['f8f8f2', '222'],
      black: 'd6d6d6',
      red: 'ff5555',
      green: '50fa7b',
      yellow: 'f1fa8c',
      blue: '6272a4',
      magenta: 'ff79c6',
      cyan: '8be9fd',
      lightgrey: 'a0a0a0',
      darkgrey: '808080'
    })
    this.syslogData = []
    this.logClients = []
    this.matchHtmlRegExp = /["'&<>]/
    this.escapeCharCodesMapping = {
      34: '&quot;',
      38: '&amp;',
      39: '&#39;',
      60: '&lt;',
      62: '&gt;'
    }
    this.heartbeatIntervalDuration = 15000
    this.levels = {'trace': -3, 'verbose': -2, 'debug': -1, 'info': 0, 'warn': 1, 'error': 2}
  }
  init = (cms, options) => {
    this.cms = cms
    this.options = options
    this.app.get('/api/_syslog', this.onGetSyslog)
    const syslogMethod = _.get(this.options, 'syslog.method', 'syslog')
    if (syslogMethod === 'command') {
      // any operating system: the command is whatever the operator configured
      logger.info('Syslog Configuration:', _.get(this.options, 'syslog', {}))
      this.startCommandCapturing()
    } else if (os.platform() === 'linux' && (syslogMethod === 'syslog' || syslogMethod === 'journalctl')) {
      logger.info('Syslog Configuration:', _.get(this.options, 'syslog', {}))
      this.startSysLogCapturing()
    } else {
      this.startVirtualSysLog()
    }
  }
  escapeHTML = (string) => {
    let str = '' + string
    let match = this.matchHtmlRegExp.exec(str)
    if (!match) {
      return str
    }
    let escape
    let html = ''
    let index
    let lastIndex = 0
    for (index = match.index; index < str.length; index++) {
      const val = _.get(this.escapeCharCodesMapping, str.charCodeAt(index), false)
      if (!val) {
        continue
      }
      escape = val
      if (lastIndex !== index) {
        html += str.substring(lastIndex, index)
      }
      lastIndex = index + 1
      html += escape
    }
    return lastIndex !== index ? html + str.substring(lastIndex, index) : html
  }
  getSyslogData = (data) => {
    if (data.id > 0) {
      const item = _.find(this.syslogData, {id: _.toNumber(data.id)})
      if (item) {
        const currentId = _.indexOf(this.syslogData, item)
        return _.drop(this.syslogData, currentId + 1)
      }
    }
    return this.syslogData
  }
  onGetSyslog = (req, res) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream')
      applySseCors(req, res, _.get(this.cms, 'security.sseCors', '*'))
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders() // flush the headers to establish SSE with client
      const heartbeatInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': heartbeat\n\n')
        } else {
          clearInterval(heartbeatInterval)
        }
      }, this.heartbeatIntervalDuration)
      this.syslogData.forEach((log) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`)
      })
      this.logClients.push(res)
      req.on('close', () => {
        clearInterval(heartbeatInterval)
        const index = this.logClients.indexOf(res)
        this.logClients.splice(index, 1)
      })
    } catch (error) {
      logger.error('Error while getting syslog:', error)
    }
  }
  startSysLogCapturing = () => {
    const identifier = _.get(this.options, 'syslog.identifier')
    if (!identifier) {
      return
    }
    if (!this.options.syslog.method) {
      this.options.syslog.method = 'syslog'
    }
    let commandLine = 'tail -q -n0 -f /var/log/syslog'
    if (this.options.syslog.method === 'journalctl') {
      commandLine = `journalctl -f -u ${identifier}.service --output cat -n 0`
    }
    // split into arguments, no shell: the identifier must not be interpreted
    this.followCommand(commandLine)
  }
  /**
   * The `command` method: runs `syslog.command` through the shell (so pipes work) and shows what it prints.
   * Needs no identifier and works on every operating system.
   */
  startCommandCapturing = () => {
    const command = _.get(this.options, 'syslog.command')
    if (!_.isString(command) || _.isEmpty(_.trim(command))) {
      logger.warn('Syslog method is "command" but no syslog.command is configured; nothing is captured.')
      return
    }
    this.followCommand(command, { shell: true })
  }
  /**
   * Spawns a command, feeds its output to the log page line by line, and starts it again when it stops.
   * @param {string} commandLine
   * @param {{shell?: boolean}} [options] shell: run through the system shell instead of splitting on spaces
   */
  followCommand = (commandLine, { shell = false } = {}) => {
    this.stopCapturing()
    const start = () => {
      let pending = ''
      const flush = (text) => {
        try {
          this.injectDataToSyslogData(text)
        } catch (error) {
          logger.error('Syslog: could not read the command output:', error)
        }
      }
      logger.info('Syslog: following', commandLine)
      let child
      if (shell) {
        child = spawn(commandLine, { shell: true })
      } else {
        const args = commandLine.split(' ')
        child = spawn(args.shift(), args)
      }
      child.exited = false
      child.stdout.on('data', (data) => {
        // a chunk can end in the middle of a line: keep the rest for the next chunk
        const text = pending + data.toString()
        const end = text.lastIndexOf('\n')
        if (end === -1) {
          pending = text
          return
        }
        pending = text.slice(end + 1)
        flush(text.slice(0, end + 1))
      })
      child.on('close', () => {
        child.exited = true
        if (pending) {
          flush(pending)
          pending = ''
        }
      })
      child.on('error', (error) => {
        child.exited = true
        logger.error('spawn syslog error:', error)
      })
      this.captureProcess = child
    }
    start()
    this.captureTimer = setInterval(() => {
      if (this.captureProcess && this.captureProcess.exited) {
        start()
      }
    }, 2000)
    this.captureTimer.unref()
  }
  /**
   * Stops a command started by followCommand (and its restart timer).
   */
  stopCapturing = () => {
    if (this.captureTimer) {
      clearInterval(this.captureTimer)
      this.captureTimer = null
    }
    if (this.captureProcess) {
      const child = this.captureProcess
      this.captureProcess = undefined
      if (!child.exited) {
        child.kill()
      }
    }
  }
  convertToHTML = (line) => {
    line = line.replace('\u001b[38;5;8;1m', '\u001b[38;1m')
    // eslint-disable-next-line no-control-regex
      .replace(/ {2}\u001b\[([0-9]{1,3})?;([0-9]{1,3})?m/g, '\u001b[$1m')
    // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[([0-9]{1,3})?;([0-9]{1,3})?m/g, '\u001b[$1m')
      .replace(/#033\[([0-9]{1,3})?m/g, '\u001b[$1m')

    return ansiHTML(line)
  }
  cleanLine = (line) => {
    // eslint-disable-next-line no-control-regex
    return `${line}`.replace(/ {2}\u001b\[([0-9]{1,3})?;([0-9]{1,3})?m/g, '$1')
    // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[([0-9]{1,3})?;([0-9]{1,3})?m/g, '$1')
      .replace(/#033\[([0-9]{1,3})?m/g, '[$1')
  }
  /**
   * Finds the log level of a line. Understands 'namespace:level ...' (first word), 'level: ...',
   * '[level] ...' and '<ISO timestamp> LEVEL ...' (the CMS logger format). Unknown lines are level 0.
   * @param {string} line
   * @returns {number}
   */
  detectLevel = (line) => {
    // the CMS logger colors the timestamp and the level on a terminal (lib/logger.js): read the line without colors
    const clean = this.cleanLine(util.stripVTControlCharacters(`${line}`))
    const legacy = _.get(this.levels, clean.split(' ')[0].split(':').slice(-1)[0])
    if (!_.isUndefined(legacy)) {
      return legacy
    }
    const match = /^(?:\S*\d{2}:\d{2}:\d{2}\S*\s+)?\W*(trace|verbose|debug|info|warn|error)\b/i.exec(clean)
    return match ? this.levels[match[1].toLowerCase()] : 0
  }
  injectDataToSyslogData = (data, fromFile = false) => {
    const identifier = _.get(this.options, 'syslog.identifier')
    const logPath = _.get(this.options, 'syslog.path', false)
    const syslogMethod = _.get(this.options, 'syslog.method', 'file')
    const doubleDate = RegExp('^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z)\\ (.*)\\ \\d{4}/\\d{2}/\\d{2}\\ \\d{2}:\\d{2}:\\d{2}\\.\\d{4}', 'g')
    const startingDate = RegExp('^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z)\\ ', 'g')
    if (doubleDate.test(data)) {
      data = data.replace(startingDate, '')
    }
    const regex = new RegExp(`\\w{3}\\s+\\d+\\s+\\d{2}:\\d{2}:\\d{2} .* ${identifier}\\[\\d+\\]: `, 'g')
    if (regex.test(data)) {
      data = data.replace(regex, '')
    }
    let lines = data.split('\n')
    if (_.last(lines) === '') {
      lines = _.dropRight(lines, 1)
    }
    // Write to file only if method is 'file' and data is not from file (to prevent circular writes)
    if (logPath && lines.length > 0 && syslogMethod === 'file' && !fromFile) {
      const logContent = lines.join('\n') + '\n'
      fs.appendFile(logPath, logContent, (err) => {
        if (err) {
          logger.error('Error writing to syslog file:', err)
        }
      })
    }
    let lastId = _.get(_.last(this.syslogData), 'id', -1)
    lines = _.map(lines, (line, idx) => {
      return {
        id: lastId + idx + 1,
        line,
        html: this.convertToHTML(this.escapeHTML(line)),
        level: this.detectLevel(line)
      }
    })
    this.syslogData.push(...lines)
    _.each(lines, (line) => {
      this.logClients.forEach((client) => {
        client.write(`data: ${JSON.stringify(line)}\n\n`)
      })
    })
    this.syslogData = _.takeRight(this.syslogData, _.get(this.options, 'syslog.max', 2000))
  }
  generateExampleLog = () => {
    const example = { example: 'string', nested: { a: { b: 1, c: { e: { f: { alongvartobetested: { h: 1, a: 1, b: 2 } }, i: 2 }, j: 3 }, k: 4 }, d: 'string' } }
    example.nested.a.c.e.f.alongvartobetested.a = example
    const exampleLogs = [
      'Emojis Example: 🐛 to ✂️ Copy and 📋 Paste 👌',
      'Standard ANSI Example: \u001b[36mBlue Example\u001b[39m!',
      'None-Standard ANSI Example: #033[37mGray Example #033[39m!',
      `Bold ANSI Example: ${ansi([1, 37, 41], 'White Text with Red Background Example')}!`,
      'Normal Example: Hello World!',
      'A multiline Example: \nHello World!\nFrom a multiline example!',
      'An inline inspect Example: \n' + util.inspect(example, { showHidden: false, depth: null, colors: true }),
      'A multiline inspect Example: \n' + util.inspect(example, { showHidden: true, depth: Infinity, colors: true }),
      'A table Example: \n' + table([
        ['0A', '0B', '0C'],
        ['1A', '1B', '1C'],
        ['2A', '2B', '2C']
      ]),
      'Dori me\nInterimo, adapare\nDori me\nAmeno, Ameno\nLatire\nLatiremo\nDori me\nAmeno\nOmenare imperavi ameno\nDimere, dimere matiro\nMatiremo\nAmeno\nOmenare imperavi emulari, ameno\nOmenare imperavi emulari, ameno\nAmeno dore\nAmeno dori me\nAmeno dori me\nAmeno dom\nDori me reo\nAmeno dori me\nAmeno dori me\nDori me am\nAmeno\nOmenare imperavi ameno\nDimere dimere matiro\nMatiremo\nAmeno',
      'A raw HTML example that is automatically escaped: <b>Hello World</b>'
    ]
    this.injectDataToSyslogData(ansi([1, 36], `[${new Dayjs().format('YYYY/MM/DD HH:mm:ss.SSSS')}] `) + exampleLogs[_.random(0, exampleLogs.length - 1)])
    clearTimeout(this.exampleTimer)
    this.exampleTimer = setTimeout(this.generateExampleLog, 500 + Math.floor(Math.random() * 3000))
    this.exampleTimer.unref()
  }

  setupConsoleCapture = () => {
    const logPath = _.get(this.options, 'syslog.path', false)
    if (!logPath) {
      return
    }
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    }
    const originalStdoutWrite = process.stdout.write
    const originalStderrWrite = process.stderr.write
    // one append stream keeps the lines in order (separate appendFile calls can finish out of order)
    const out = fs.createWriteStream(logPath, { flags: 'a' })
    out.on('error', (err) => {
      if (err.code !== 'ENOENT') {
        originalConsole.error('Error writing to syslog file:', err)
      }
    })
    this.captureStream = out
    const writeToFile = (content) => {
      if (_.isString(content)) {
        out.write(content)
      }
    }
    process.stdout.write = function(chunk, encoding, callback) {
      const result = originalStdoutWrite.call(process.stdout, chunk, encoding, callback)
      writeToFile(chunk)
      return result
    }
    process.stderr.write = function(chunk, encoding, callback) {
      const result = originalStderrWrite.call(process.stderr, chunk, encoding, callback)
      writeToFile(chunk)
      return result
    }
    // console.log/warn/error/info write to process.stdout/stderr, which are captured above: wrapping the console
    // methods too would write every line twice
    this.originalStreams = {
      stdout: originalStdoutWrite,
      stderr: originalStderrWrite,
      console: originalConsole
    }
    originalConsole.log('Stream and console capture setup complete. All terminal output will be written to:', logPath)
  }
  /**
   * Loads the end of an existing log file into the backlog, so the page has history right after a restart.
   * @param {string} logPath
   * @param {number} [maxBytes] how much of the end of the file to read
   */
  loadBacklog = (logPath, maxBytes = 512 * 1024) => {
    try {
      const size = fs.statSync(logPath).size
      if (size === 0) {
        return
      }
      const start = Math.max(0, size - maxBytes)
      const fd = fs.openSync(logPath, 'r')
      const buffer = Buffer.alloc(size - start)
      fs.readSync(fd, buffer, 0, buffer.length, start)
      fs.closeSync(fd)
      let text = buffer.toString('utf8')
      if (start > 0) {
        // the first line is probably cut in the middle
        text = text.slice(text.indexOf('\n') + 1)
      }
      const max = _.get(this.options, 'syslog.max', 2000)
      this.injectDataToSyslogData(_.takeRight(text.split('\n'), max + 1).join('\n'), true)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return
      }
      logger.error('Could not load the syslog backlog:', error)
    }
  }
  fileMethod = (logPath) => {
    logger.warn('Virtual Syslog with file method is activated. Capturing console logs and writing to file.')
    this.loadBacklog(logPath)
    this.setupConsoleCapture()
    try {
      logger.warn('Setting up tail for file:', logPath)
      const tail = new Tail(logPath, { fromBeginning: false, follow: true })
      tail.on('line', (data) => {
        this.injectDataToSyslogData(data, true)
      })
      tail.on('error', (error) => {
        logger.error('Tail error for file method:', error)
      })
      this.tailInstance = tail
      logger.warn('Tail setup complete for file method')
    } catch (error) {
      logger.error('Error starting tail for file method:', error)
    }
  }
  syslogMethod = (logPath) => {
    logger.warn('Virtual Syslog with syslog method is activated. Tailing file:', logPath)
    try {
      const tail = new Tail(logPath, { fromBeginning: false, follow: true })
      tail.on('line', (data) => {
        logger.info('Tail reading from file:', data)
        this.injectDataToSyslogData(data, true)
      })
      tail.on('error', (error) => {
        logger.error('Tail error:', error)
      })
      this.tailInstance = tail
    } catch (error) {
      logger.error('Error starting tail:', error)
    }
  }
  journalctlMethod = (logPath) => {
  // Method is 'journalctl': Read from the file using TailingReadableStream
    logger.warn('Virtual Syslog with journalctl method is activated. Reading from file:', logPath)
    const stream = TailingReadableStream.createReadStream(logPath, { timeout: 0 })
    stream.on('data', buffer => {
      logger.info('Reading from file:', buffer.toString())
      this.injectDataToSyslogData(buffer.toString(), true)
    })
  }
  startVirtualSysLog = () => {
    const logPath = _.get(this.options, 'syslog.path', false)
    const syslogMethod = _.get(this.options, 'syslog.method', 'file')
    if (logPath !== false) {
      fs.ensureFileSync(logPath)
      if (syslogMethod === 'file') {
        this.fileMethod(logPath)
      } else if (syslogMethod === 'syslog') {
        this.syslogMethod(logPath)
      } else if (syslogMethod === 'journalctl') {
        this.journalctlMethod(logPath)
      } else {
        if (os.platform() !== 'linux') {
          logger.warn('Unknown syslog method:', syslogMethod, '. Generating example logs (non-Linux system).')
          this.generateExampleLog()
        } else {
          logger.warn('Unknown syslog method:', syslogMethod, '. No action taken on Linux system.')
        }
      }
    } else {
      if (os.platform() !== 'linux') {
        logger.warn('Virtual Syslog is activated but no syslog.path found in configuration; example log will be thrown (non-Linux system).')
        this.generateExampleLog()
      } else {
        logger.warn('Virtual Syslog is activated but no syslog.path found in configuration; no action taken on Linux system.')
      }
    }
  }
}

exports = module.exports = new SyslogManager()
