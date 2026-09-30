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

  it('writes an ISO timestamp, the level and the message', () => {
    new Logger().info('hello')
    expect(calls).to.have.length(1)
    expect(calls[0][1]).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO hello$/)
  })

  it('formats several arguments like console does', () => {
    new Logger().info('user %s has %d items', 'ana', 3, { a: 1 })
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
    const logger = new Logger({ level: 'warn' })
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

  it('does not throw for objects it cannot stringify', () => {
    const circular = {}
    circular.self = circular
    expect(() => new Logger().info('loop', circular)).to.not.throw()
  })
})
