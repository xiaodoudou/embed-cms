const path = require('path')
const sharp = require('sharp')
const WebSocket = require('ws')
const { expect } = require('chai')
const { startApp } = require('../helpers/app')
const hooks = require('../../docs/examples/taskboard/hooks')
const { seed, PEOPLE, RESOURCES } = require('../../docs/examples/taskboard/seed')

// The task board of docs/examples/taskboard over a real CMS: the hooks that number the cards and sign the comments, the rights of the group the team signs in with, and the client of
// the app (the very modules the browser runs: http, session, realtime, the stores) driven from here with a real login cookie, a real websocket and a real upload. This is what keeps
// the app compliant with the CMS: if a change of the CMS breaks the way the app signs in, reads, writes, hears or sends a file, one of these says so.

const EXAMPLE = path.resolve(__dirname, '../../docs/examples/taskboard')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** waits for something to be true, and says what it was waiting for when it is not */
async function until (what, check, timeout = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await check()) {
      return
    }
    await wait(20)
  }
  throw new Error(`Waited ${timeout} ms for ${what}`)
}

describe('the example task board (unit)', () => {
  let app, accounts, createServices
  const browsers = []
  afterEach(() => {
    browsers.splice(0).forEach((services) => services.realtime.stop())
  })

  /**
   * A person at their own browser: the client of the app with a jar for the cookie of the login, a websocket that sends it, and an upload that goes over fetch.
   * It counts what it asks the CMS for.
   */
  function browser (realtimeOptions = {}) {
    let cookie = ''
    // (every browser that a test opens is closed after it)
    const counts = { get: 0, requests: [] }
    const send = async (url, init = {}) => {
      for (let attempt = 1; ; attempt++) {
        try {
          const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) } })
          const set = res.headers.getSetCookie().map((item) => item.split(';')[0])
          if (set.length) {
            cookie = set.join('; ')
          }
          return res
        } catch (error) {
          if (attempt >= 3) {
            throw error
          }
        }
      }
    }
    const jarFetch = (url, init = {}) => {
      counts.requests.push(`${init.method || 'GET'} ${url}`)
      if ((init.method || 'GET') === 'GET') {
        counts.get++
      }
      return send(`${app.url}${url}`, init)
    }
    class JarSocket extends WebSocket {
      constructor (url) {
        super(url, { headers: cookie ? { cookie } : {} })
      }
    }
    // an XMLHttpRequest for an upload, over fetch: the app asks for what an upload needs of one (progress, load, error, abort)
    class FetchXhr {
      constructor () {
        this.upload = {}
        this.headers = {}
      }

      open (method, url) { this.method = method; this.url = url }
      setRequestHeader (name, value) { this.headers[name] = value }
      abort () { this.onabort() }
      send (form) {
        send(`${app.url}${this.url}`, { method: this.method, headers: this.headers, body: form }).then(async (res) => {
          this.status = res.status
          this.statusText = res.statusText
          this.responseText = await res.text()
          this.upload.onprogress({ lengthComputable: true, loaded: 1, total: 1 })
          this.onload()
        }, () => this.onerror())
      }
    }
    const services = createServices({
      fetch: jarFetch,
      xhr: () => new FetchXhr(),
      WebSocketImpl: JarSocket,
      realtime: { url: `${app.url.replace('http', 'ws')}/_updates`, minDelay: 30, maxDelay: 60, random: () => 0, ...realtimeOptions }
    })
    browsers.push(services)
    return { services, counts, cookie: () => cookie }
  }
  const account = (username) => accounts.find((one) => one.username === username)
  async function signedIn (username = 'ada', realtimeOptions) {
    const one = browser(realtimeOptions)
    await one.services.session.login(username, account(username).password)
    return one
  }
  before(async () => {
    ;({ createServices } = await import('../../docs/examples/taskboard/src/services.js'))
    app = await startApp({
      resources: path.join(EXAMPLE, 'resources'),
      disableAuthentication: true,
      disableJwtLogin: false,
      wsRecordUpdates: true
    })
    hooks.install(app.cms)
    const result = await seed(app.cms)
    accounts = result.accounts
    expect(result.report.created).to.be.above(0)
  })
  after(async () => {
    await app.close()
  })

  describe('the seed', () => {
    it('makes the people, the projects, the tasks and a few comments, a group for the team, and an account for each person', async () => {
      const api = app.cms.api()
      expect((await api('people').list({})).map((one) => one.username).sort()).to.deep.equal(['ada', 'grace', 'linus'])
      expect((await api('projects').list({})).map((one) => one.key).sort()).to.deep.equal(['OPS', 'WEB'])
      expect((await api('tasks').list({})).length).to.equal(10)
      const comments = await api('comments').list({})
      expect(comments.map((one) => one.author).sort()).to.deep.equal(['ada', 'grace'])
      const group = await app.cms.$authentication.groups.find({ name: 'team' })
      for (const action of ['read', 'create', 'update', 'remove', 'attachments']) {
        expect(group[action], action).to.deep.equal(RESOURCES)
      }
      expect(accounts.map((one) => one.username)).to.deep.equal(PEOPLE)
      expect(accounts.every((one) => /^[0-9a-f]{12}$/.test(one.password))).to.equal(true)
    })

    it('is not made again: nothing is created, no account is made, and the comments are not doubled', async () => {
      const again = await seed(app.cms)
      expect(again.report).to.include({ created: 0, updated: 0 })
      expect(again.accounts).to.deep.equal([])
      expect((await app.cms.api()('comments').list({})).length).to.equal(2)
    })

    it('keeps the passwords as hashes: an account that is read has none to show', async () => {
      const user = await app.cms.$authentication.users.find({ username: 'ada' })
      expect(JSON.stringify(user)).to.not.include(account('ada').password)
    })
  })

  describe('the hooks of the CMS', () => {
    it('number the tasks of a project one after the other, whoever asks and however many at once', async () => {
      const ada = await signedIn('ada')
      const web = (await app.cms.api()('projects').find({ key: 'WEB' }))._id
      const made = await Promise.all(Array.from({ length: 12 }, (_, index) => ada.services.http.post('/api/tasks', { project: web, status: 'todo', title: `Parallel ${index}` })))
      const numbers = made.map((task) => parseInt(task.ref.split('-')[1], 10)).sort((a, b) => a - b)
      expect(new Set(numbers).size).to.equal(12)
      expect(numbers).to.deep.equal(Array.from({ length: 12 }, (_, index) => numbers[0] + index))
      expect(made.every((task) => task.ref.startsWith('WEB-'))).to.equal(true)
      // and the other project has its own count
      const ops = (await app.cms.api()('projects').find({ key: 'OPS' }))._id
      expect((await ada.services.http.post('/api/tasks', { project: ops, status: 'todo', title: 'Ops' })).ref).to.equal('OPS-5')
    })

    it('do not keep a number that a request brings, and keep the one that the seed brings', async () => {
      const ada = await signedIn('ada')
      const web = (await app.cms.api()('projects').find({ key: 'WEB' }))._id
      const task = await ada.services.http.post('/api/tasks', { project: web, status: 'todo', title: 'Forged', ref: 'WEB-1' })
      expect(task.ref).to.not.equal('WEB-1')
      expect(await app.cms.api()('tasks').find({ ref: 'WEB-1' })).to.include({ title: 'Write the home page' })
    })

    it('put a new task at the foot of its column, unless the request says where', async () => {
      const ada = await signedIn('ada')
      const web = (await app.cms.api()('projects').find({ key: 'WEB' }))._id
      const doing = await app.cms.api()('tasks').list({ project: web, status: 'doing' })
      const highest = Math.max(...doing.map((one) => one.position))
      expect((await ada.services.http.post('/api/tasks', { project: web, status: 'doing', title: 'At the foot' })).position).to.equal(highest + hooks.STEP)
      expect((await ada.services.http.post('/api/tasks', { project: web, status: 'doing', title: 'Chosen', position: 42 })).position).to.equal(42)
      expect((await ada.services.http.post('/api/tasks', { project: web, status: 'review', title: 'Alone' })).position).to.be.a('number')
    })

    it('refuse a task of a project that does not exist, and never change the number of a task', async () => {
      const ada = await signedIn('ada')
      const refused = await ada.services.http.post('/api/tasks', { project: 'no-such-project', status: 'todo', title: 'Lost' }).catch((error) => error)
      expect(refused).to.include({ status: 400 })
      expect(refused.message).to.equal('There is no such project')
      const task = await app.cms.api()('tasks').find({ ref: 'WEB-2' })
      await ada.services.http.put(`/api/tasks/${task._id}`, { ref: 'WEB-999', title: 'Renamed' })
      expect(await app.cms.api()('tasks').find(task._id)).to.include({ ref: 'WEB-2', title: 'Renamed' })
    })

    it('make the author of a comment the account that wrote it, whatever the request says', async () => {
      const grace = await signedIn('grace')
      const task = await app.cms.api()('tasks').find({ ref: 'WEB-3' })
      const comment = await grace.services.http.post('/api/comments', { task: task._id, text: 'Not from Ada', author: 'ada', _updatedBy: 'team~ada' })
      expect(comment.author).to.equal('grace')
      expect(comment._updatedBy).to.equal('team~grace')
    })

    it('call the author "someone" when a comment is made without an account', async () => {
      const task = await app.cms.api()('tasks').find({ ref: 'WEB-3' })
      const made = await app.cms.api()('comments').create({ task: task._id, text: 'From a script' })
      expect(made.author).to.equal('someone')
    })
  })

  describe('the rights of the team', () => {
    it('are those of the board, and none on the CMS itself', async () => {
      const ada = await signedIn('ada')
      expect(ada.services.session.state.user.rights).to.deep.include({ read: RESOURCES })
      for (const resource of ['_users', '_groups', '_settings']) {
        const refused = await ada.services.http.get(`/api/${resource}`).catch((error) => error)
        expect(refused, resource).to.include({ status: 401 })
      }
      expect(ada.services.session.can('create', 'tasks')).to.equal(true)
      expect(ada.services.session.can('read', '_users')).to.equal(false)
    })

    it('are needed for everything: a visitor who is not signed in reads and writes nothing', async () => {
      const visitor = browser()
      for (const attempt of [() => visitor.services.http.get('/api/tasks'), () => visitor.services.http.post('/api/tasks', { title: 'x' }), () => visitor.services.http.get('/api/people')]) {
        expect(await attempt().catch((error) => error)).to.include({ status: 401 })
      }
    })
  })

  describe('the client of the app', () => {
    it('says that the account or the password is wrong, in one sentence', async () => {
      const visitor = browser()
      const error = await visitor.services.session.login('ada', 'not the password').catch((caught) => caught)
      expect(error).to.include({ status: 401, message: 'The account or the password is wrong.' })
      expect(visitor.services.session.state.user).to.equal(null)
      const unknown = await visitor.services.session.login('nobody', 'x').catch((caught) => caught)
      expect(unknown.message).to.equal(error.message)
    })

    it('signs in with a cookie that it cannot read, and then knows who it is, with the stamp the CMS puts on what it writes', async () => {
      const ada = await signedIn('ada')
      expect(ada.cookie()).to.match(/embedCmsJwt/)
      expect(JSON.stringify(ada.services.session.state)).to.not.match(/eyJ/)
      expect(ada.services.session.state.user.username).to.equal('ada')
      expect(ada.services.session.stamp.value).to.equal('team~ada')
      const task = await app.cms.api()('tasks').find({ ref: 'WEB-4' })
      const changed = await ada.services.http.put(`/api/tasks/${task._id}`, { title: 'Stamped' })
      expect(changed._updatedBy).to.equal(ada.services.session.stamp.value)
    })

    it('is told when nobody is signed in', async () => {
      const visitor = browser()
      let told = null
      visitor.services.onUnauthorized((error) => { told = error })
      await visitor.services.http.get('/api/tasks').catch(() => {})
      expect(told).to.include({ status: 401 })
    })

    it('opens a board: the team, the projects, and the tasks of the project, as the CMS has them', async () => {
      const ada = await signedIn('ada')
      const project = await ada.services.board.open('WEB')
      expect(project).to.include({ key: 'WEB' })
      const { board } = ada.services
      expect(board.people.list.value).to.have.length(3)
      expect(board.me.value).to.include({ username: 'ada' })
      const todo = board.column(project._id, 'todo', { text: '', who: [], label: [], due: '' })
      expect(todo.every((task) => task.project === project._id && task.status === 'todo')).to.equal(true)
      expect(todo.map((task) => task.position)).to.deep.equal([...todo.map((task) => task.position)].sort((a, b) => a - b))
      expect(board.tasks.list.value.every((task) => task.project === project._id)).to.equal(true)
    })

    it('loads more than a page of tasks, page by page, with the paging of the CMS', async () => {
      const ada = await signedIn('ada')
      const project = (await app.cms.api()('projects').create({ key: 'BIG', name: 'Big' }))
      for (let index = 0; index < 5; index++) {
        await app.cms.api()('tasks').create({ project: project._id, status: 'todo', title: `Big ${index}`, position: index })
      }
      const small = createServices({ fetch: ada.services.http && ((url, init) => fetch(`${app.url}${url}`, { ...init, headers: { cookie: ada.cookie() } })) })
      const collection = require('../../docs/examples/taskboard/src/stores/collection.js')
      expect(collection).to.not.equal(undefined)
      const { createCollection } = await import('../../docs/examples/taskboard/src/stores/collection.js')
      const tasks = createCollection({ http: small.http, resource: 'tasks', limit: 2 })
      await tasks.load({ project: project._id })
      expect(tasks.list.value).to.have.length(5)
      expect(tasks.list.value.map((one) => one.title).sort()).to.deep.equal(['Big 0', 'Big 1', 'Big 2', 'Big 3', 'Big 4'])
      const page = await small.http.page('tasks', { query: { project: project._id }, limit: 2, page: 0 })
      expect(page.total).to.equal(5)
      expect(page.items).to.have.length(2)
    })

    it('makes a card, moves it, and what it did is what a second browser reads', async () => {
      const ada = await signedIn('ada')
      const project = await ada.services.board.open('WEB')
      const { board } = ada.services
      const made = await board.addTask(project._id, 'todo', 'Made by the client')
      expect(made.ref).to.match(/^WEB-\d+$/)
      const empty = { text: '', who: [], label: [], due: '' }
      const doing = board.column(project._id, 'doing', empty)
      await board.moveTask(made._id, 'doing', doing, 0)
      expect(board.column(project._id, 'doing', empty)[0]._id).to.equal(made._id)
      const grace = await signedIn('grace')
      await grace.services.board.open('WEB')
      const seen = grace.services.board.column(project._id, 'doing', empty)
      expect(seen[0]).to.include({ _id: made._id, title: 'Made by the client', status: 'doing' })
      expect(seen.map((task) => task._id)).to.deep.equal(board.column(project._id, 'doing', empty).map((task) => task._id))
    })

    it('numbers the column again when the numbers have no room left, and the order that it keeps is the order that the CMS keeps', async () => {
      const ada = await signedIn('ada')
      const project = await app.cms.api()('projects').create({ key: 'TIGHT', name: 'Tight' })
      const make = (title, position, status = 'todo') => app.cms.api()('tasks').create({ project: project._id, status, title, position })
      const [a, b] = [await make('a', 1), await make('b', 1.0000000001)]
      const mover = await make('mover', 1, 'doing')
      await ada.services.board.open('TIGHT')
      const empty = { text: '', who: [], label: [], due: '' }
      await ada.services.board.moveTask(mover._id, 'todo', ada.services.board.column(project._id, 'todo', empty), 1)
      const order = (await app.cms.api()('tasks').list({ project: project._id, status: 'todo' })).sort((x, y) => x.position - y.position).map((one) => one.title)
      expect(order).to.deep.equal(['a', 'mover', 'b'])
      expect(ada.services.board.column(project._id, 'todo', empty).map((one) => one.title)).to.deep.equal(order)
      expect((await app.cms.api()('tasks').find(a._id)).position).to.equal(hooks.STEP)
      expect((await app.cms.api()('tasks').find(b._id)).position).to.equal(2 * hooks.STEP)
    })

    it('sends a file to a task, and reads the task again with the file, which can be downloaded and resized', async () => {
      const ada = await signedIn('ada')
      const project = await ada.services.board.open('WEB')
      const { board } = ada.services
      const task = board.tasks.list.value.find((one) => one.project === project._id)
      const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#468' } }).png().toBuffer()
      const progress = []
      await board.attach(task._id, new File([png], 'picture.png', { type: 'image/png' }), (done) => progress.push(done))
      expect(progress[progress.length - 1]).to.equal(1)
      const held = board.tasks.get(task._id)
      expect(held.files).to.have.length(1)
      expect(held.files[0]).to.include({ _contentType: 'image/png', _isAttachment: true, _filename: 'picture.png' })
      const original = await ada.services.http.get(held.files[0].url).catch((error) => error)
      expect(original).to.not.be.an('error')
      const resized = await fetch(`${app.url}${held.files[0].url}?resize=40xauto`, { headers: { cookie: ada.cookie() } })
      expect(resized.status).to.equal(200)
      expect(resized.headers.get('content-type')).to.equal('image/png')
      const small = await sharp(Buffer.from(await resized.arrayBuffer())).metadata()
      expect(small.width).to.equal(40)
      await board.detach(task._id, held.files[0]._id)
      expect(board.tasks.get(task._id).files || []).to.have.length(0)
    })

    it('refuses a file that the CMS refuses, with the reason, and leaves the task as it was', async () => {
      const ada = await signedIn('ada')
      const project = await ada.services.board.open('WEB')
      const task = ada.services.board.tasks.list.value.find((one) => one.project === project._id)
      const error = await ada.services.board.attach('no-such-task', new File(['x'], 'x.txt')).catch((caught) => caught)
      expect(error).to.be.an('error')
      expect(error.status).to.be.oneOf([400, 404, 500])
      expect(ada.services.board.tasks.get(task._id).files || []).to.not.have.length.above(0)
    })

    it('reads the comments of a task, writes one, and the CMS says who wrote it', async () => {
      const ada = await signedIn('ada')
      const project = await ada.services.board.open('WEB')
      const task = ada.services.board.tasks.list.value.find((one) => one.ref === 'WEB-3')
      expect(project).to.not.equal(undefined)
      await ada.services.board.openTask(task._id)
      const before = ada.services.board.commentsOf(task._id).length
      const comment = await ada.services.board.addComment(task._id, 'Written by the client')
      expect(comment.author).to.equal('ada')
      const read = ada.services.board.commentsOf(task._id)
      expect(read).to.have.length(before + 1)
      expect(read[read.length - 1]).to.include({ text: 'Written by the client', author: 'ada' })
    })

    it('signs out: the CMS ends the session of that browser, and no other', async () => {
      const first = await signedIn('ada')
      const second = await signedIn('ada')
      await first.services.session.logout()
      expect(first.services.session.state.user).to.equal(null)
      expect(await first.services.http.get('/api/tasks?limit=1').catch((error) => error)).to.include({ status: 401 })
      expect(await second.services.http.get('/api/tasks?limit=1')).to.be.an('array')
    })
  })

  describe('what the CMS says over its websocket, heard by the app', () => {
    const open = async (username, realtimeOptions) => {
      const one = await signedIn(username, realtimeOptions)
      const project = await one.services.board.open('WEB')
      one.services.realtime.start()
      await until('the socket to open', () => one.services.realtime.status.value === 'open')
      return { ...one, project }
    }
    const task = (browserOf, ref) => browserOf.services.board.tasks.list.value.find((one) => one.ref === ref)

    it('shows at once what another person changes', async () => {
      const ada = await open('ada')
      const grace = await signedIn('grace')
      await grace.services.board.open('WEB')
      const target = task(ada, 'WEB-4')
      await grace.services.http.put(`/api/tasks/${target._id}`, { title: 'Grace changed this' })
      await until('the change to reach Ada', () => task(ada, 'WEB-4').title === 'Grace changed this')
      ada.services.realtime.stop()
    })

    it('shows what another person makes, and what they remove', async () => {
      const ada = await open('ada')
      const grace = await signedIn('grace')
      const made = await grace.services.http.post('/api/tasks', { project: ada.project._id, status: 'review', title: 'Made by Grace' })
      await until('the new card to reach Ada', () => ada.services.board.tasks.get(made._id))
      expect(ada.services.board.tasks.get(made._id)).to.include({ title: 'Made by Grace', ref: made.ref })
      await grace.services.http.delete(`/api/tasks/${made._id}`)
      await until('the removal to reach Ada', () => !ada.services.board.tasks.get(made._id))
      ada.services.realtime.stop()
    })

    it('does not ask for what the person wrote themselves: the answer of the write has it', async () => {
      const ada = await open('ada')
      const target = task(ada, 'WEB-5')
      const before = ada.counts.requests.filter((request) => request.startsWith('GET /api/tasks/')).length
      await ada.services.board.tasks.update(target._id, { title: 'Ada changed this' })
      await wait(300)
      expect(ada.counts.requests.filter((request) => request.startsWith('GET /api/tasks/')).length).to.equal(before)
      expect(task(ada, 'WEB-5').title).to.equal('Ada changed this')
      ada.services.realtime.stop()
    })

    it('shows the files that another person adds, which are not in the answer of any write of the record', async () => {
      const ada = await open('ada')
      const grace = await signedIn('grace')
      const target = task(ada, 'WEB-6')
      await grace.services.http.upload('tasks', target._id, { field: 'files', blob: new File(['hello'], 'hello.txt', { type: 'text/plain' }) })
      await until('the file to reach Ada', () => (task(ada, 'WEB-6').files || []).length === 1)
      expect(task(ada, 'WEB-6').files[0]._filename).to.equal('hello.txt')
      ada.services.realtime.stop()
    })

    it('shows the comments that another person writes, on the card that is open', async () => {
      const ada = await open('ada')
      const grace = await signedIn('grace')
      const target = task(ada, 'WEB-3')
      await ada.services.board.openTask(target._id)
      const before = ada.services.board.commentsOf(target._id).length
      await grace.services.http.post('/api/comments', { task: target._id, text: 'Heard live' })
      await until('the comment to reach Ada', () => ada.services.board.commentsOf(target._id).length === before + 1)
      expect(ada.services.board.commentsOf(target._id).pop()).to.include({ text: 'Heard live', author: 'grace' })
      ada.services.realtime.stop()
    })

    it('opens the connection again when it is lost, and reads what was missed', async () => {
      // it waits a while before it tries again, so that there is a time when it is not connected
      const ada = await open('ada', { minDelay: 400, maxDelay: 400, random: () => 1 })
      const target = task(ada, 'WEB-1')
      let reopened = 0
      ada.services.realtime.on((message) => { if (message.action === 'reconnected') reopened++ })
      // the CMS drops the connection, and a change is made while the app is not listening
      app.cms.wss.clients.forEach((client) => client.terminate())
      await until('the app to notice', () => ada.services.realtime.status.value !== 'open')
      await app.cms.api()('tasks').update(target._id, { title: 'Changed while offline' })
      await until('the connection to come back', () => ada.services.realtime.status.value === 'open')
      await until('"reconnected"', () => reopened === 1)
      await until('the missed change to be read', () => task(ada, 'WEB-1').title === 'Changed while offline')
      ada.services.realtime.stop()
    })

    it('is refused to a browser that is not signed in: the socket does not open', async () => {
      const visitor = browser()
      visitor.services.realtime.start()
      await wait(400)
      expect(visitor.services.realtime.status.value).to.not.equal('open')
      visitor.services.realtime.stop()
    })

    it('stops when it is stopped', async () => {
      const ada = await open('ada')
      ada.services.realtime.stop()
      expect(ada.services.realtime.status.value).to.equal('closed')
      await until('the CMS to see it close', () => app.cms.wss.clients.size === 0 || [...app.cms.wss.clients].every((client) => client.readyState > 1))
    })
  })

  describe('the CMS configuration of the example', () => {
    it('uses the login page and its cookie, not the Basic authentication of a browser prompt', () => {
      expect(app.cms.options.disableAuthentication).to.equal(true)
      expect(app.cms.options.disableJwtLogin).to.equal(false)
      expect(app.cms.options.wsRecordUpdates).to.equal(true)
    })
  })
})
