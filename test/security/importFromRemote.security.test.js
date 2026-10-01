const http = require('http')
const util = require('util')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const { expect } = require('chai')
const RequestService = require('../../lib-importFromRemote/RequestService')
const makeApi = require('../../lib-importFromRemote/api')
const logger = require('../../lib/logger')

/**
 * Small http server that records what it receives.
 * @param {function(import('http').IncomingMessage, import('http').ServerResponse): void} handler
 * @returns {Promise<{url: string, requests: object[], close: function(): Promise<void>}>}
 */
const listen = (handler) => new Promise(resolve => {
  const requests = []
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, headers: req.headers })
    handler(req, res)
  })
  server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise(done => { server.close(done); server.closeAllConnections() })
  }))
})

describe('importFromRemote requests (security)', () => {
  let remote, foreign, dir
  before(async () => {
    remote = await listen((req, res) => res.end('remote file'))
    foreign = await listen((req, res) => res.end('foreign file'))
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'embed-cms-import-'))
  })
  after(async () => {
    await remote.close()
    await foreign.close()
    await fs.remove(dir)
  })
  beforeEach(() => {
    remote.requests.length = 0
    foreign.requests.length = 0
  })

  const service = () => {
    const request = new RequestService({ username: 'importer', password: 'not-a-real-password' }, { origin: remote.url })
    request.setAuth('a-jwt-token')
    return request
  }

  it('sends the login token and Authorization header to the remote', async () => {
    await service().getAttachment(`${remote.url}/file.bin`, path.join(dir, 'a.bin'), 1)
    expect(remote.requests[0].headers['x-access-token']).to.equal('a-jwt-token')
    expect(remote.requests[0].headers.authorization).to.match(/^Basic /)
  })

  it('does not send credentials to another host named in a record', async () => {
    await service().getAttachment(`${foreign.url}/file.bin`, path.join(dir, 'b.bin'), 1)
    expect(foreign.requests).to.have.length(1)
    expect(foreign.requests[0].headers['x-access-token']).to.equal(undefined)
    expect(foreign.requests[0].headers.authorization).to.equal(undefined)
  })

  it('refuses another host when the urls are restricted, and any other protocol', async () => {
    const restricted = new RequestService({ username: 'u', password: 'p' }, { origin: remote.url, restrictUrls: true })
    restricted.setAuth('a-jwt-token')
    let error
    try {
      await restricted.getAttachment(`${foreign.url}/file.bin`, path.join(dir, 'c.bin'), 1)
    } catch (e) {
      error = e
    }
    expect(error).to.be.an('error')
    expect(foreign.requests).to.have.length(0)
    for (const url of ['file:///etc/passwd', 'ftp://example.com/x']) {
      let failure
      try {
        await restricted.getAttachment(url, path.join(dir, 'd.bin'), 1)
      } catch (e) {
        failure = e
      }
      expect(failure, url).to.be.an('error')
    }
    await restricted.getAttachment(`${remote.url}/file.bin`, path.join(dir, 'e.bin'), 1)
    expect(await fs.readFile(path.join(dir, 'e.bin'), 'utf8')).to.equal('remote file')
  })

  it('allows a host that is listed in allowedHosts', async () => {
    const listed = new RequestService({ username: 'u', password: 'p' }, { origin: remote.url, restrictUrls: true, allowedHosts: [new URL(foreign.url).host] })
    await listed.getAttachment(`${foreign.url}/file.bin`, path.join(dir, 'f.bin'), 1)
    expect(await fs.readFile(path.join(dir, 'f.bin'), 'utf8')).to.equal('foreign file')
  })

  it('downloads an attachment once when it succeeds', async () => {
    await service().getAttachment(`${remote.url}/once.bin`, path.join(dir, 'once.bin'), 10)
    expect(remote.requests.filter(r => r.url === '/once.bin')).to.have.length(1)
    expect(await fs.readFile(path.join(dir, 'once.bin'), 'utf8')).to.equal('remote file')
  })

  it('does not write the password to the log when it logs in', async () => {
    const lines = []
    const originals = ['log', 'info', 'warn', 'error'].map(name => [name, console[name]])
    originals.forEach(([name]) => { console[name] = (...args) => lines.push(util.inspect(args, { depth: 6 })) })
    const loginServer = await listen((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ code: 200, token: 'a-token' }))
    })
    try {
      const api = makeApi({ protocol: 'http://', host: loginServer.url.replace('http://', ''), prefix: '', username: 'importer', password: 'not-a-real-password' })
      await api().login()
      logger.warn('marker')
    } finally {
      originals.forEach(([name, fn]) => { console[name] = fn })
      await loginServer.close()
    }
    expect(lines.join('\n')).to.not.include('not-a-real-password')
  })
})
