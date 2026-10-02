// A throw-away CMS with the field catalogue (resources/) on a free port, for the screenshots of the documentation. Both login
// modes are on: the seed uses Basic authentication, the browser uses the login page. The data lives in a temporary folder.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'
const fs = require('fs')
const os = require('os')
const net = require('net')
const path = require('path')
const express = require('express')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const USER = 'localAdmin'
const PASSWORD = 'localAdmin'

/** Opens a TCP connection to the port to see that it answers (see below) */
const reachable = (port) => new Promise((resolve) => {
  const socket = net.connect({ port, host: '127.0.0.1', timeout: 3000 })
  socket.on('connect', () => { socket.destroy(); resolve(true) })
  socket.on('timeout', () => { socket.destroy(); resolve(false) })
  socket.on('error', () => resolve(false))
})

/**
 * Listens on `port` (0: a free one). On a machine that drops the first packet to some fresh local ports
 * (docs/contributing/TESTING.md) a port that does not answer is given up for another one.
 */
async function listen (app, port) {
  for (let attempt = 1; ; attempt++) {
    const server = await new Promise((resolve) => {
      const listening = app.listen(port, '127.0.0.1', () => resolve(listening))
    })
    if (port !== 0 || await reachable(server.address().port) || attempt >= 6) return server
    await new Promise((resolve) => server.close(resolve))
  }
}

/** Starts the CMS on a free port (or `port`) and answers { url, stop } */
async function start (port = 0) {
  const CMS = require(ROOT)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cms-shots-'))
  const cms = new CMS({
    data: dir,
    config: path.join(dir, 'cms.json'),
    resources: path.join(ROOT, 'resources'),
    mid: 'shot0001',
    disableReplication: true,
    disableAuthentication: false,
    disableJwtLogin: false,
    disableDarkMode: false,
    admin: { language: { defaultLocale: 'enUS', locales: ['enUS', 'zhCN'] } },
    auth: { secret: 'docshots-secret-please-change-1234567' },
    session: { secret: 'docshots-session-secret-1234567', resave: true, saveUninitialized: true }
  })
  const app = express()
  app.use(cms.express())
  const server = await listen(app, port)
  await cms.bootstrap(server)
  const url = `http://127.0.0.1:${server.address().port}`
  const stop = async () => {
    await new Promise((resolve) => server.close(resolve))
    server.closeAllConnections?.()
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // the stores of the CMS hold their files until the process ends: the temporary folder goes with the OS cleanup
    }
  }
  return { url, stop, user: USER, password: PASSWORD }
}

module.exports = { start, USER, PASSWORD }

if (require.main === module) {
  start(Number(process.env.SCREENSHOT_PORT) || 0).then(({ url }) => console.log(`READY ${url}/admin/`))
}
