const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const { expect } = require('chai')
const SyslogManager = require('../../lib/SyslogManager')

describe('SyslogManager backlog and capture (unit)', () => {
  const sys = SyslogManager
  let originalOptions
  let file

  beforeEach(() => {
    originalOptions = sys.options
    sys.syslogData = []
    sys.logClients = []
    file = path.join(os.tmpdir(), `syslog-${process.pid}-${Date.now()}.log`)
  })
  afterEach(async () => {
    sys.options = originalOptions
    sys.syslogData = []
    await fs.remove(file)
  })

  describe('loadBacklog', () => {
    it('loads the end of an existing log file, with levels, so the page has history after a restart', async () => {
      sys.options = { syslog: { max: 10 } }
      await fs.writeFile(file, ['2026-01-01T00:00:00.000Z INFO started', '2026-01-01T00:00:01.000Z WARN careful', '2026-01-01T00:00:02.000Z ERROR broke', ''].join('\n'))
      sys.loadBacklog(file)
      expect(sys.syslogData.map(l => l.level)).to.deep.equal([0, 1, 2])
      expect(sys.syslogData[2].line).to.contain('broke')
    })

    it('keeps only the last lines and drops a first line cut in the middle', async () => {
      sys.options = { syslog: { max: 3 } }
      const lines = Array.from({ length: 50 }, (_, i) => `INFO line number ${i}`)
      await fs.writeFile(file, lines.join('\n') + '\n')
      sys.loadBacklog(file, 100)
      expect(sys.syslogData.length).to.be.at.most(3)
      expect(sys.syslogData[sys.syslogData.length - 1].line).to.equal('INFO line number 49')
      sys.syslogData.forEach(l => expect(l.line).to.match(/^INFO line number \d+$/))
    })

    it('does nothing for an empty or missing file', async () => {
      await fs.writeFile(file, '')
      sys.loadBacklog(file)
      sys.loadBacklog(`${file}.missing`)
      expect(sys.syslogData).to.deep.equal([])
    })
  })

  describe('lines colored by the CMS logger', () => {
    const { Logger } = require('../../lib/logger')
    const colored = (level, message) => {
      const original = { log: console.log, warn: console.warn, error: console.error }
      let line
      console.log = console.warn = console.error = (text) => { line = text }
      try {
        new Logger({ colors: true, level: 'debug' })[level](message)
      } finally {
        Object.assign(console, original)
      }
      return line
    }

    it('keeps their level', () => {
      expect(sys.detectLevel(colored('error', 'e'))).to.equal(sys.levels.error)
      expect(sys.detectLevel(colored('warn', 'w'))).to.equal(sys.levels.warn)
      expect(sys.detectLevel(colored('debug', 'd'))).to.equal(sys.levels.debug)
      expect(sys.detectLevel(colored('verbose', 'v'))).to.equal(sys.levels.verbose)
    })

    it('render with their colors and nothing left open', () => {
      const html = sys.convertToHTML(sys.escapeHTML(colored('error', 'bad')))
      expect(html).to.contain('<span style="color:#ff5555;">ERROR</span>')
      expect(html).to.not.contain('background')
      expect(html.split('<span').length).to.equal(html.split('</span>').length)
    })
  })

  describe('console capture', () => {
    it('writes each line once, whether it comes from console.log or from stdout', async () => {
      sys.options = { syslog: { path: file } }
      await fs.ensureFile(file)
      const originals = { out: process.stdout.write, err: process.stderr.write, log: console.log }
      try {
        // the capture also passes every line on to the terminal: keep the markers out of the test output
        process.stdout.write = () => true
        sys.setupConsoleCapture()
        process.stdout.write('direct-stdout-marker\n')
        console.log('console-log-marker')
        await new Promise(resolve => sys.captureStream.end(resolve))
      } finally {
        process.stdout.write = originals.out
        process.stderr.write = originals.err
        console.log = originals.log
      }
      const text = await fs.readFile(file, 'utf8')
      expect(text.split('console-log-marker').length - 1, 'console.log').to.equal(1)
      expect(text.split('direct-stdout-marker').length - 1, 'stdout.write').to.equal(1)
    })
  })

  describe('very long logs', () => {
    it('cuts a line longer than syslog.maxLineLength, and says how much is missing', () => {
      sys.options = { syslog: { maxLineLength: 20 } }
      sys.addLogOutput('INFO ' + 'x'.repeat(1000))
      const [item] = sys.syslogData
      expect(item.line.startsWith('INFO ' + 'x'.repeat(15))).to.equal(true)
      expect(item.line).to.contain('line cut, 985 more characters')
      expect(item.level).to.equal(0)
    })

    it('never leaves half a colour code at the cut, and keeps lines whole when the limit is 0', () => {
      sys.options = { syslog: { maxLineLength: 6 } }
      const colour = String.fromCharCode(27) + '[31m'
      expect(sys.capLine('abcde' + colour + 'red')).to.not.contain(String.fromCharCode(27))
      sys.options = { syslog: { maxLineLength: 0 } }
      expect(sys.capLine('y'.repeat(50000))).to.have.length(50000)
    })

    it('drops a page that does not read, and keeps feeding the others', () => {
      sys.options = { syslog: { maxClientBuffer: 100 } }
      const written = []
      const make = (writableLength) => ({ writableLength, write: (m) => written.push(m), end () { this.ended = true } })
      const slow = make(1000)
      const fast = make(0)
      sys.logClients = [slow, fast]
      sys.sendToClients({ id: 1, line: 'INFO hello' })
      expect(slow.ended).to.equal(true)
      expect(sys.logClients).to.deep.equal([fast])
      expect(written).to.have.length(1)
    })

    it('copies the log file to <path>.1 and empties it once it passes syslog.maxFileSize', async () => {
      sys.options = { syslog: { maxFileSize: 100 } }
      const text = ('INFO a line' + os.EOL).repeat(20)
      await fs.writeFile(file, text)
      sys.rotateLogFile(file)
      expect((await fs.stat(file)).size).to.equal(0)
      expect(await fs.readFile(`${file}.1`, 'utf8')).to.equal(text)
      await fs.remove(`${file}.1`)
    })

    it('leaves a file under the limit alone, and every file when the limit is 0', async () => {
      const text = ('INFO a line' + os.EOL).repeat(20)
      await fs.writeFile(file, text)
      sys.options = { syslog: { maxFileSize: 10000 } }
      sys.rotateLogFile(file)
      sys.options = { syslog: { maxFileSize: 0 } }
      sys.rotateLogFile(file)
      expect((await fs.stat(file)).size).to.equal(text.length)
      expect(await fs.pathExists(`${file}.1`)).to.equal(false)
    })
  })
})
