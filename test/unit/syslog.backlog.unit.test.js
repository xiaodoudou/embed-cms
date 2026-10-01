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
})
