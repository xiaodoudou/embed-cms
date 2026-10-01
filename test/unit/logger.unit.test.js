const util = require('util')
const { expect } = require('chai')
const shared = require('../../lib/logger')
const { Logger } = shared

describe('logger (unit)', () => {
  let calls
  const originals = {}

  beforeEach(() => {
    calls = []
    for (const method of ['log', 'warn', 'error']) {
      originals[method] = console[method]
      console[method] = (line) => calls.push([method, line])
    }
  })
  afterEach(() => {
    for (const method of Object.keys(originals)) console[method] = originals[method]
  })

  it('exports one shared instance and the class', () => {
    expect(shared).to.be.instanceOf(Logger)
    expect(require('../../lib/logger')).to.equal(shared)
  })

  it('writes nothing at the silent level, not even errors', () => {
    const quiet = new Logger({ level: 'silent' })
    quiet.error('boom')
    quiet.warn('careful')
    quiet.info('hello')
    quiet.debug('details')
    expect(calls).to.have.length(0)
  })

  it('writes an ISO timestamp, the level and the message', () => {
    new Logger({ colors: false }).info('hello')
    expect(calls).to.have.length(1)
    expect(calls[0][1]).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO hello$/)
  })

  it('formats several arguments like console does', () => {
    new Logger({ colors: false }).info('user %s has %d items', 'ana', 3, { a: 1 })
    expect(calls[0][1]).to.match(/INFO user ana has 3 items \{ a: 1 \}$/)
  })

  it('sends warnings and errors to their own console streams', () => {
    const logger = new Logger()
    logger.warn('w')
    logger.error('e')
    logger.info('i')
    expect(calls.map(c => c[0])).to.deep.equal(['warn', 'error', 'log'])
  })

  it('hides messages below the configured level', () => {
    const logger = new Logger({ level: 'warn', colors: false })
    logger.debug('d')
    logger.verbose('v')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(calls.map(c => c[1].split(' ')[1])).to.deep.equal(['WARN', 'ERROR'])
  })

  it('shows everything at debug level', () => {
    const logger = new Logger({ level: 'debug' })
    for (const level of ['error', 'warn', 'info', 'verbose', 'debug']) logger[level](level)
    expect(calls).to.have.length(5)
  })

  it('reads the level from LOG_LEVEL and defaults to info', () => {
    const before = process.env.LOG_LEVEL
    try {
      process.env.LOG_LEVEL = 'error'
      expect(new Logger().level).to.equal('error')
      delete process.env.LOG_LEVEL
      expect(new Logger().level).to.equal('info')
    } finally {
      if (before === undefined) delete process.env.LOG_LEVEL
      else process.env.LOG_LEVEL = before
    }
  })

  it('falls back to info for an unknown level', () => {
    const logger = new Logger({ level: 'nonsense' })
    logger.debug('hidden')
    logger.info('shown')
    expect(calls).to.have.length(1)
  })

  it('colors timestamp, level and values when colors are enabled', () => {
    new Logger({ colors: true }).info('payload', { a: 1, b: 'x' })
    const line = calls[0][1]
    expect(line).to.contain('\x1b[32m') // green time
    expect(line).to.contain('\x1b[36mINFO\x1b[39m') // cyan INFO
    expect(line).to.contain('\x1b[33m1\x1b[39m') // number colored by inspect
    expect(util.stripVTControlCharacters(line)).to.match(/Z INFO payload \{ a: 1, b: 'x' \}$/)
  })

  it('closes each color with its own code, never a full reset, so the System log page renders it', () => {
    new Logger({ colors: true }).error('bad')
    expect(calls[0][1]).to.not.contain('\x1b[0m')
    expect(calls[0][1]).to.contain('\x1b[1m\x1b[31mERROR\x1b[39m\x1b[22m')
  })

  it('prints the same text with and without colors, nested objects included', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } }, list: [1, 'two', null] }
    new Logger({ colors: true }).info('deep', deep)
    new Logger({ colors: false }).info('deep', deep)
    const strip = (line) => util.stripVTControlCharacters(line).replace(/^\S+/, '')
    expect(strip(calls[0][1])).to.equal(strip(calls[1][1]))
  })

  it('does not color when colors are disabled', () => {
    new Logger({ colors: false }).error('plain', { a: 1 })
    expect(calls[0][1]).to.not.contain('\x1b[')
  })

  describe('color detection', () => {
    const saved = {}
    beforeEach(() => {
      saved.env = { NO_COLOR: process.env.NO_COLOR, FORCE_COLOR: process.env.FORCE_COLOR }
      saved.tty = { out: process.stdout.isTTY, err: process.stderr.isTTY }
      delete process.env.NO_COLOR
      delete process.env.FORCE_COLOR
    })
    afterEach(() => {
      for (const [key, value] of Object.entries(saved.env)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      process.stdout.isTTY = saved.tty.out
      process.stderr.isTTY = saved.tty.err
    })

    it('checks stdout and stderr separately, so errors redirected to a file stay plain', () => {
      process.stdout.isTTY = true
      process.stderr.isTTY = false
      const logger = new Logger()
      logger.info('to the terminal')
      logger.error('to the file')
      expect(calls[0][1]).to.contain('\x1b[')
      expect(calls[1][1]).to.not.contain('\x1b[')
    })

    it('turns colors off with NO_COLOR and on with FORCE_COLOR', () => {
      process.stdout.isTTY = true
      process.env.NO_COLOR = '1'
      new Logger().info('no color')
      delete process.env.NO_COLOR
      process.stdout.isTTY = false
      process.env.FORCE_COLOR = '1'
      new Logger().info('forced')
      process.env.FORCE_COLOR = '0'
      new Logger().info('not forced')
      expect(calls.map(c => c[1].includes('\x1b['))).to.deep.equal([false, true, false])
    })
  })

  it('does not throw for objects it cannot stringify', () => {
    const circular = {}
    circular.self = circular
    expect(() => new Logger().info('loop', circular)).to.not.throw()
  })
})
