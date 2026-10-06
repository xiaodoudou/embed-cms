const http = require('http')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const request = require('supertest')
const { expect } = require('chai')
const SyslogManager = require('../../lib/SyslogManager')
const SystemManager = require('../../lib/SystemManager')
const { startApp, ADMIN } = require('../helpers/app')

describe('SyslogManager (unit)', () => {
  const sys = SyslogManager
  let originalOptions

  beforeEach(() => {
    originalOptions = sys.options
    sys.options = { syslog: { max: 5 } }
    sys.syslogData = []
    sys.logClients = []
  })
  afterEach(() => {
    sys.options = originalOptions
    sys.syslogData = []
  })

  describe('escapeHTML', () => {
    it('escapes every HTML special character', () => {
      expect(sys.escapeHTML('<a href="x">&\'</a>')).to.equal('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
    })
    it('leaves plain text alone and copes with non-strings', () => {
      expect(sys.escapeHTML('plain text 123')).to.equal('plain text 123')
      expect(sys.escapeHTML(42)).to.equal('42')
      expect(sys.escapeHTML(null)).to.equal('null')
    })
    it('escapes repeated and adjacent characters', () => {
      expect(sys.escapeHTML('<<>>&&')).to.equal('&lt;&lt;&gt;&gt;&amp;&amp;')
    })
  })

  describe('addLogOutput', () => {
    it('never puts raw HTML from a log line into the html field', () => {
      sys.addLogOutput('<img src=x onerror=alert(1)> <script>alert(2)</script>')
      const [entry] = sys.syslogData
      expect(entry.html).to.not.include('<img')
      expect(entry.html).to.not.include('<script')
      expect(entry.html).to.include('&lt;img')
      expect(entry.line).to.include('<img')
    })
    it('keeps colours but no script injection from ansi sequences', () => {
      sys.addLogOutput('\u001b[36mcyan\u001b[39m <b>bold</b>')
      const [entry] = sys.syslogData
      expect(entry.html).to.match(/<span[^>]*>cyan<\/span>/)
      expect(entry.html).to.not.include('<b>')
    })
    it('converts the non-standard #033 colour sequence', () => {
      sys.addLogOutput('#033[37mgray#033[39m')
      expect(sys.syslogData[0].html).to.match(/<span[^>]*>gray<\/span>/)
    })
    it('splits multi-line data, drops the trailing blank line and numbers entries', () => {
      sys.addLogOutput('one\ntwo\nthree\n')
      expect(sys.syslogData.map(e => e.line)).to.deep.equal(['one', 'two', 'three'])
      expect(sys.syslogData.map(e => e.id)).to.deep.equal([0, 1, 2])
      sys.addLogOutput('four')
      expect(sys.syslogData[3].id).to.equal(3)
    })
    it('derives the level from the first word', () => {
      sys.addLogOutput('warn: careful')
      sys.addLogOutput('error: broken')
      sys.addLogOutput('hello there')
      expect(sys.syslogData.map(e => e.level)).to.deep.equal([1, 2, 0])
    })
    it('understands the legacy namespace:level, [level] and CMS logger formats', () => {
      expect(sys.detectLevel('cms:warn something')).to.equal(1)
      expect(sys.detectLevel('[error] something')).to.equal(2)
      expect(sys.detectLevel('2026-09-29T01:02:03.456Z ERROR Error on login')).to.equal(2)
      expect(sys.detectLevel('2026-09-29T01:02:03.456Z WARN careful')).to.equal(1)
      expect(sys.detectLevel('2026-09-29T01:02:03.456Z DEBUG detail')).to.equal(-1)
      expect(sys.detectLevel('2026-09-29T01:02:03.456Z INFO started')).to.equal(0)
      expect(sys.detectLevel('an errors summary')).to.equal(0)
      expect(sys.detectLevel('')).to.equal(0)
    })
    it('keeps only the newest `syslog.max` entries', () => {
      for (let i = 0; i < 8; i++) sys.addLogOutput(`line ${i}`)
      expect(sys.syslogData).to.have.length(5)
      expect(sys.syslogData[0].line).to.equal('line 3')
      expect(sys.syslogData[4].line).to.equal('line 7')
    })
    it('pushes new lines to connected clients as SSE data events', () => {
      const written = []
      sys.logClients.push({ write: d => written.push(d) })
      sys.addLogOutput('live')
      expect(written).to.have.length(1)
      expect(written[0]).to.match(/^data: \{.*"line":"live".*\}\n\n$/)
    })
    describe('log file', () => {
      let logPath
      beforeEach(async () => {
        logPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'syslog-')), 'app.log')
        sys.options = { syslog: { max: 5, path: logPath, method: 'file' } }
      })
      afterEach(async () => {
        await fs.remove(path.dirname(logPath))
      })
      const settle = () => new Promise(resolve => setTimeout(resolve, 60))

      it('appends captured lines to the file for the file method', async () => {
        sys.addLogOutput('to disk')
        await settle()
        expect(fs.readFileSync(logPath, 'utf8')).to.equal('to disk\n')
      })
      it('does not write lines that were read from the file (no feedback loop)', async () => {
        sys.addLogOutput('from disk', true)
        await settle()
        expect(fs.existsSync(logPath)).to.equal(false)
      })
    })
  })

  describe('linesAfter', () => {
    it('returns everything, or only what came after the given id', () => {
      sys.addLogOutput('a\nb\nc\nd')
      expect(sys.linesAfter({ id: 0 })).to.have.length(4)
      expect(sys.linesAfter({ id: 1 }).map(e => e.line)).to.deep.equal(['c', 'd'])
      expect(sys.linesAfter({ id: 3 })).to.deep.equal([])
      expect(sys.linesAfter({ id: 99 })).to.have.length(4)
    })
  })
})

describe('system and syslog event streams (unit)', () => {
  let app, cookie

  const stream = (route, { cookies = cookie } = {}) => new Promise((resolve, reject) => {
    const req = http.get(`${app.url}${route}`, { headers: cookies ? { Cookie: cookies } : {} }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      resolve({ res, read: () => body, close: () => req.destroy() })
    })
    req.on('error', reject)
  })
  const waitFor = async (check, timeout = 3000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (check()) return true
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    return false
  }

  before(async () => {
    app = await startApp()
    const login = await request(app.url).post('/admin/login').send({ username: ADMIN[0], password: ADMIN[1] })
    cookie = (login.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ')
    SystemManager.heartbeatIntervalDuration = 60
    SyslogManager.heartbeatIntervalDuration = 60
  })
  after(async () => {
    SystemManager.heartbeatIntervalDuration = 15000
    SyslogManager.heartbeatIntervalDuration = 15000
    await app.close()
  })

  it('requires a session for /api/system and /api/_syslog', async () => {
    for (const route of ['/api/system', '/api/_syslog']) {
      const anon = await request(app.url).get(route).timeout({ response: 2000 })
      expect(anon.status, route).to.be.oneOf([401, 403])
    }
  })

  it('/api/system streams system info as server-sent events', async () => {
    const s = await stream('/api/system')
    try {
      expect(s.res.statusCode).to.equal(200)
      expect(s.res.headers['content-type']).to.match(/text\/event-stream/)
      expect(await waitFor(() => /data: \{.*\}\n\n/.test(s.read()))).to.equal(true)
      const payload = JSON.parse(/data: (\{.*\})\n\n/.exec(s.read())[1])
      expect(payload).to.include.keys(['cpu', 'memory', 'uptime'])
      expect(payload.uptime).to.be.a('number')
    } finally {
      s.close()
    }
  })

  it('a heartbeat is a complete SSE comment, so the next event is not swallowed', async () => {
    const s = await stream('/api/system')
    try {
      expect(await waitFor(() => s.read().includes(': heartbeat\n\n'))).to.equal(true)
      // a literal backslash-n would glue the following event onto the comment line
      expect(s.read()).to.not.include('\\n')
    } finally {
      s.close()
    }
  })

  it('/api/_syslog replays history and delivers new lines after a heartbeat', async () => {
    SyslogManager.addLogOutput('history line')
    const s = await stream('/api/_syslog')
    try {
      expect(await waitFor(() => s.read().includes('history line'))).to.equal(true)
      expect(await waitFor(() => s.read().includes(': heartbeat\n\n'))).to.equal(true)
      SyslogManager.addLogOutput('fresh line')
      expect(await waitFor(() => /\n\ndata: \{[^\n]*fresh line[^\n]*\}\n\n$/.test(s.read()))).to.equal(true)
    } finally {
      s.close()
    }
  })

  it('stops tracking a client when it disconnects', async () => {
    const before = SystemManager.clients.length
    const s = await stream('/api/system')
    expect(await waitFor(() => SystemManager.clients.length === before + 1)).to.equal(true)
    s.close()
    expect(await waitFor(() => SystemManager.clients.length === before)).to.equal(true)
  })
})
