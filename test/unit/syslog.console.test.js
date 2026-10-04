const os = require('os')
const { expect } = require('chai')
const SyslogManager = require('../../lib/SyslogManager')

// off Linux, with nothing configured, the log page shows what the process prints (it used to show made-up lines)
describe('SyslogManager console method (unit)', () => {
  // a fresh instance: init registers a route and may capture the output, which must not touch the shared one
  const createManager = () => new SyslogManager.constructor()
  const realPlatform = os.platform
  const realOut = process.stdout.write
  const realErr = process.stderr.write
  // the lines of these tests start with it, and go nowhere: the output under the manager lets through only what the reporter prints
  const MARK = '[syslog-test] '
  let manager

  const asPlatform = (name) => {
    os.platform = () => name
    // (a line that comes in two pieces is quiet in both)
    const quietly = (real, stream) => {
      let inside = false
      return function (chunk, ...rest) {
        const quiet = inside || String(chunk).startsWith(MARK)
        inside = quiet && !String(chunk).endsWith('\n')
        return quiet ? true : real.call(stream, chunk, ...rest)
      }
    }
    process.stdout.write = quietly(realOut, process.stdout)
    process.stderr.write = quietly(realErr, process.stderr)
  }
  // what the page holds: the lines of the log
  const lines = () => manager.syslogData.map(entry => entry.line)
  const say = (text) => process.stdout.write(`${MARK}${text}\n`)

  afterEach(() => {
    os.platform = realPlatform
    if (manager) {
      manager.stopCapturing()
    }
    process.stdout.write = realOut
    process.stderr.write = realErr
    manager = null
  })

  it('shows what the process prints, when nothing is configured and the system is not Linux', () => {
    asPlatform('win32')
    manager = createManager()
    manager.init({}, {})
    say('a line the cms printed')
    console.log(`${MARK}and one from console.log`)
    expect(lines()).to.include(`${MARK}a line the cms printed`)
    expect(lines()).to.include(`${MARK}and one from console.log`)
  })

  it('makes up no line', () => {
    asPlatform('win32')
    manager = createManager()
    manager.init({}, {})
    expect(manager.exampleTimer).to.equal(undefined)
    expect(lines()).to.deep.equal([])
  })

  it('also shows what goes to the error output', () => {
    asPlatform('darwin')
    manager = createManager()
    manager.init({}, {})
    process.stderr.write(`${MARK}an error line\n`)
    expect(lines()).to.include(`${MARK}an error line`)
  })

  it('keeps a line that comes in two pieces, and a text of several lines, as the lines they are', () => {
    asPlatform('win32')
    manager = createManager()
    manager.init({}, {})
    process.stdout.write(`${MARK}half a `)
    expect(lines()).to.not.include(`${MARK}half a `)
    process.stdout.write('line\nsecond\nthird\n')
    expect(lines().slice(-3)).to.deep.equal([`${MARK}half a line`, 'second', 'third'])
  })

  it('still writes the lines where they were going (the terminal)', () => {
    asPlatform('win32')
    manager = createManager()
    const written = []
    const under = process.stdout.write
    process.stdout.write = function (chunk) {
      written.push(String(chunk))
      return true
    }
    try {
      manager.init({}, {})
      process.stdout.write(`${MARK}to the terminal\n`)
    } finally {
      manager.stopCapturing()
      process.stdout.write = under
    }
    expect(written).to.include(`${MARK}to the terminal\n`)
  })

  it('does not feed the page again with what the page itself logs', () => {
    asPlatform('win32')
    manager = createManager()
    manager.init({}, {})
    // a very long line is cut, and the cut is written to the output the page reads
    manager.addLogOutput('x'.repeat(20000))
    const count = lines().length
    say('after')
    expect(lines().length).to.equal(count + 1)
  })

  it('gives the output back when it stops', () => {
    asPlatform('win32')
    manager = createManager()
    const before = process.stdout.write
    manager.init({}, {})
    expect(process.stdout.write).to.not.equal(before)
    manager.stopCapturing()
    expect(process.stdout.write).to.equal(before)
  })

  it('is the answer to a method it does not know, off Linux', () => {
    asPlatform('win32')
    manager = createManager()
    manager.init({}, { syslog: { method: 'nonsense', path: './test/data/syslog-console.log' } })
    say('unknown method')
    expect(lines()).to.include(`${MARK}unknown method`)
  })

  it('does nothing on Linux when nothing is configured, as it always did', () => {
    asPlatform('linux')
    manager = createManager()
    const before = process.stdout.write
    manager.init({}, {})
    expect(process.stdout.write).to.equal(before)
    expect(lines()).to.deep.equal([])
  })

  it('is asked for on any system with method: console', () => {
    asPlatform('linux')
    manager = createManager()
    manager.init({}, { syslog: { method: 'console' } })
    say('on linux, asked for')
    expect(lines()).to.include(`${MARK}on linux, asked for`)
  })

  it('makes up lines only when asked for with method: example', () => {
    asPlatform('win32')
    manager = createManager()
    manager.init({}, { syslog: { method: 'example' } })
    expect(manager.exampleTimer).to.not.equal(undefined)
    expect(lines().length).to.be.greaterThan(0)
  })
})
