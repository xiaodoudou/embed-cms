const { expect } = require('chai')
const SyslogManager = require('../../lib/SyslogManager')

const waitFor = async (check, timeout = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (check()) return true
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}

describe('SyslogManager command method (unit)', () => {
  // a fresh instance: init registers a route and starts capturing, which must not touch the shared one
  const createManager = () => new SyslogManager.constructor()
  let manager

  afterEach(() => {
    if (manager && manager.stopCapturing) {
      manager.stopCapturing()
    }
    manager = null
  })

  it('runs the configured command and shows its output, without an identifier', async () => {
    manager = createManager()
    const marker = `cms-syslog-command-${process.pid}`
    manager.init({}, { syslog: { method: 'command', command: `node -e "console.log('${marker}')"` } })
    const captured = await waitFor(() => manager.syslogData.some(entry => entry.line === marker))
    expect(captured, 'the command output never reached the log page').to.equal(true)
  })

  it('keeps following a command that writes over time', async () => {
    manager = createManager()
    const script = 'let i = 0; const t = setInterval(() => { console.log(\'tick \' + (i++)); if (i > 2) clearInterval(t) }, 50)'
    manager.init({}, { syslog: { method: 'command', command: `node -e "${script}"` } })
    const captured = await waitFor(() => ['tick 0', 'tick 1', 'tick 2'].every(line => manager.syslogData.some(entry => entry.line === line)))
    expect(captured).to.equal(true)
  })

  it('does not spawn anything without a command', () => {
    manager = createManager()
    manager.init({}, { syslog: { method: 'command' } })
    expect(manager.captureProcess).to.equal(undefined)
  })
})
