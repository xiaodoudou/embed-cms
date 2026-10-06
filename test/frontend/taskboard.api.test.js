import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { ApiError, createHttp, isAbort, toQuery } from '../../docs/examples/taskboard/src/api/http'
import { createSession } from '../../docs/examples/taskboard/src/api/session'
import { createRealtime, socketUrl } from '../../docs/examples/taskboard/src/api/realtime'

// The three pieces of docs/examples/taskboard that talk to the CMS: the HTTP client, the session, and the websocket. Each is given a false fetch, a false XMLHttpRequest and a false
// WebSocket, so that what the app does with every answer the CMS can give is seen without a server.

const reply = (status, body, headers = {}) => new Response(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body), { status, statusText: status === 404 ? 'Not Found' : 'Status', headers })

describe('taskboard: the HTTP client', () => {
  describe('toQuery', () => {
    it('says nothing when there is nothing to say', () => {
      expect(toQuery()).toBe('')
      expect(toQuery({})).toBe('')
      expect(toQuery({ query: {} })).toBe('')
    })

    it('writes the filter as JSON, the page size and the page (which counts from 0)', () => {
      const text = toQuery({ query: { project: 'p1', status: { $in: ['todo', 'doing'] } }, limit: 200, page: 0 })
      const params = new URLSearchParams(text.slice(1))
      expect(JSON.parse(params.get('query'))).toEqual({ project: 'p1', status: { $in: ['todo', 'doing'] } })
      expect(params.get('limit')).toBe('200')
      expect(params.get('page')).toBe('0')
    })

    it('adds other parameters, and encodes what needs it', () => {
      expect(toQuery({ params: { resize: '96xauto' } })).toBe('?resize=96xauto')
      expect(toQuery({ query: { title: 'a&b=c #d' } })).not.toMatch(/[&=# ]d|&b=/)
    })
  })

  describe('ApiError and isAbort', () => {
    it('keep the status, the reason and what was said', () => {
      const error = new ApiError(400, 'No', { code: 400 })
      expect(error).toBeInstanceOf(Error)
      expect(error).toMatchObject({ name: 'ApiError', status: 400, message: 'No', body: { code: 400 } })
    })

    it('isAbort knows a cancelled request, and nothing else', () => {
      expect(isAbort(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
      expect(isAbort(new Error('x'))).toBe(false)
      expect(isAbort(null)).toBe(false)
      expect(isAbort(undefined)).toBe(false)
    })
  })

  describe('a request', () => {
    it('sends JSON with the cookie of the page, and gives back what the CMS said', async () => {
      const fetch = vi.fn(async () => reply(200, { _id: 'a', title: 'x' }))
      const http = createHttp({ fetch })
      expect(await http.post('/api/tasks', { title: 'x' })).toEqual({ _id: 'a', title: 'x' })
      const [url, init] = fetch.mock.calls[0]
      expect(url).toBe('/api/tasks')
      expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', body: '{"title":"x"}' })
      expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' })
    })

    it('sends no body and no content type for a read', async () => {
      const fetch = vi.fn(async () => reply(200, []))
      await createHttp({ fetch }).get('/api/tasks')
      const [, init] = fetch.mock.calls[0]
      expect(init.body).toBeUndefined()
      expect(init.headers).toEqual({ Accept: 'application/json' })
    })

    it('has a verb for each of the four writes of the REST API, and a base for another address', async () => {
      const fetch = vi.fn(async () => reply(200, { done: true }))
      const http = createHttp({ fetch, base: 'https://cms.example' })
      await http.get('/a')
      await http.post('/b', {})
      await http.put('/c', { x: 1 })
      await http.delete('/d')
      expect(fetch.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual(['GET https://cms.example/a', 'POST https://cms.example/b', 'PUT https://cms.example/c', 'DELETE https://cms.example/d'])
    })

    it('passes the signal on, to cancel', async () => {
      const fetch = vi.fn(async () => reply(200, {}))
      const controller = new AbortController()
      await createHttp({ fetch }).get('/a', { signal: controller.signal })
      expect(fetch.mock.calls[0][1].signal).toBe(controller.signal)
    })

    it('reads an empty answer, and an answer that is not JSON', async () => {
      const http = createHttp({ fetch: vi.fn().mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200, 'plain text')) })
      expect(await http.get('/a')).toBeNull()
      expect(await http.get('/b')).toBe('plain text')
    })

    it('says no to an answer that is not a success, with the reason the CMS gave, whatever shape it has', async () => {
      const cases = [
        [{ code: 400, message: 'A title is required' }, 'A title is required'],
        [{ error: 'Not authenticated' }, 'Not authenticated'],
        ['Unauthorized', 'Unauthorized'],
        [undefined, '404 Not Found'],
        [{ other: 1 }, '404 Not Found'],
        ['x'.repeat(500), '404 Not Found']
      ]
      for (const [body, message] of cases) {
        const http = createHttp({ fetch: vi.fn(async () => reply(404, body)) })
        const error = await http.get('/a').catch((caught) => caught)
        expect(error, JSON.stringify(body)).toBeInstanceOf(ApiError)
        expect(error.status).toBe(404)
        expect(error.message).toBe(message)
      }
    })

    it('tells the app when the CMS says that nobody is signed in, once for each request, and for that status only', async () => {
      const onUnauthorized = vi.fn()
      const http = createHttp({ onUnauthorized, fetch: vi.fn().mockResolvedValueOnce(reply(401, { error: 'Not authenticated' })).mockResolvedValueOnce(reply(403, {})).mockResolvedValueOnce(reply(500, {})) })
      await expect(http.get('/a')).rejects.toMatchObject({ status: 401 })
      await expect(http.get('/b')).rejects.toMatchObject({ status: 403 })
      await expect(http.get('/c')).rejects.toMatchObject({ status: 500 })
      expect(onUnauthorized).toHaveBeenCalledTimes(1)
      expect(onUnauthorized.mock.calls[0][0]).toBeInstanceOf(ApiError)
    })

    it('says that the server cannot be reached when there is no answer, and lets a cancelled request be what it is', async () => {
      const lost = createHttp({ fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
      await expect(lost.get('/a')).rejects.toMatchObject({ name: 'ApiError', status: 0, message: 'The server cannot be reached.' })
      const cancelled = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      await expect(createHttp({ fetch: vi.fn().mockRejectedValue(cancelled) }).get('/a')).rejects.toBe(cancelled)
    })

    it('uses the fetch of the browser when it is not given one', async () => {
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { ok: 1 }))
      expect(await createHttp().get('/a')).toEqual({ ok: 1 })
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('a page of a list', () => {
    it('gives the records, and how many there are in all (the header of the CMS)', async () => {
      const fetch = vi.fn(async () => reply(200, [{ _id: 'a' }, { _id: 'b' }], { numRecords: '42' }))
      const result = await createHttp({ fetch }).page('tasks', { query: { project: 'p' }, limit: 2, page: 1 })
      expect(result).toEqual({ items: [{ _id: 'a' }, { _id: 'b' }], total: 42 })
      expect(fetch.mock.calls[0][0]).toMatch(/^\/api\/tasks\?query=.*&limit=2&page=1$/)
    })

    it('has no total when the CMS does not say, and no records when it does not answer a list', async () => {
      const http = createHttp({ fetch: vi.fn().mockResolvedValueOnce(reply(200, [])).mockResolvedValueOnce(reply(200, { not: 'a list' })) })
      expect(await http.page('tasks')).toEqual({ items: [], total: undefined })
      expect((await http.page('tasks')).items).toEqual([])
    })
  })

  describe('an upload', () => {
    /** a false XMLHttpRequest that says what it was given, and answers when it is told to */
    class FakeXhr {
      constructor () {
        FakeXhr.last = this
        this.upload = {}
        this.headers = {}
        this.status = 0
        this.statusText = ''
        this.responseText = ''
      }

      open (method, url) { this.method = method; this.url = url }
      setRequestHeader (name, value) { this.headers[name] = value }
      send (form) { this.form = form }
      abort () { this.onabort() }
      answer (status, body, statusText = '') {
        this.status = status
        this.statusText = statusText
        this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
        this.onload()
      }
    }
    const make = (extra) => createHttp({ xhr: () => new FakeXhr(), ...extra })
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    it('posts the file as a part named for the field, with the cookie, and says what the CMS answers', async () => {
      const promise = make().upload('tasks', 'task 1', { field: 'files', blob: file })
      const xhr = FakeXhr.last
      expect(xhr).toMatchObject({ method: 'POST', url: '/api/tasks/task%201/attachments', withCredentials: true })
      expect(xhr.headers).toEqual({ Accept: 'application/json' })
      expect(xhr.form.get('files').name).toBe('notes.txt')
      xhr.answer(200, { _id: 'f1' })
      expect(await promise).toEqual({ _id: 'f1' })
    })

    it('takes another name for the file when it is given one', async () => {
      const promise = make().upload('tasks', 't', { field: 'files', blob: file, name: 'renamed.txt' })
      expect(FakeXhr.last.form.get('files').name).toBe('renamed.txt')
      FakeXhr.last.answer(200, {})
      await promise
    })

    it('says how far it has gone, up to the end', async () => {
      const seen = []
      const promise = make().upload('tasks', 't', { field: 'files', blob: file, onProgress: (done) => seen.push(done) })
      FakeXhr.last.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 })
      FakeXhr.last.upload.onprogress({ lengthComputable: false, loaded: 50, total: 0 })
      FakeXhr.last.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 })
      FakeXhr.last.answer(201, {})
      await promise
      expect(seen).toEqual([0.25, 1, 1])
    })

    it('keeps an answer that is not JSON, and refuses with the reason of the CMS, or with its status', async () => {
      const first = make().upload('tasks', 't', { field: 'files', blob: file })
      FakeXhr.last.answer(200, 'done')
      expect(await first).toBe('done')
      const refused = make().upload('tasks', 't', { field: 'files', blob: file })
      FakeXhr.last.answer(400, { message: 'No such field' }, 'Bad Request')
      await expect(refused).rejects.toMatchObject({ status: 400, message: 'No such field' })
      const plain = make().upload('tasks', 't', { field: 'files', blob: file })
      FakeXhr.last.answer(500, 'oops', 'Server Error')
      await expect(plain).rejects.toMatchObject({ status: 500, message: '500 Server Error' })
    })

    it('tells the app when nobody is signed in', async () => {
      const onUnauthorized = vi.fn()
      const promise = make({ onUnauthorized }).upload('tasks', 't', { field: 'files', blob: file })
      FakeXhr.last.answer(401, { error: 'Not authenticated' })
      await expect(promise).rejects.toMatchObject({ status: 401 })
      expect(onUnauthorized).toHaveBeenCalledOnce()
    })

    it('says that the server cannot be reached, and can be cancelled', async () => {
      const lost = make().upload('tasks', 't', { field: 'files', blob: file })
      FakeXhr.last.onerror()
      await expect(lost).rejects.toMatchObject({ status: 0 })
      const controller = new AbortController()
      const cancelled = make().upload('tasks', 't', { field: 'files', blob: file, signal: controller.signal })
      controller.abort()
      await expect(cancelled).rejects.toSatisfy(isAbort)
    })

    it('uses the XMLHttpRequest of the browser when it is not given one', () => {
      const http = createHttp({ fetch: vi.fn() })
      const spy = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {})
      vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {})
      vi.spyOn(XMLHttpRequest.prototype, 'setRequestHeader').mockImplementation(() => {})
      http.upload('tasks', 't', { field: 'files', blob: file })
      expect(spy).toHaveBeenCalledOnce()
    })
  })
})

describe('taskboard: the session', () => {
  const alice = { username: 'ada', group: 'team', rights: { read: ['tasks'], update: ['tasks'] } }
  const make = (http) => createSession({ get: vi.fn(), post: vi.fn(), ...http })

  it('is nobody until the CMS has been asked, and says so', async () => {
    const session = make({ get: vi.fn(async () => ({})) })
    expect(session.state).toMatchObject({ user: null, checked: false })
    expect(await session.check()).toBeNull()
    expect(session.state).toMatchObject({ user: null, checked: true })
  })

  it('is the person the CMS says, with the stamp the CMS puts on what they write', async () => {
    const session = make({ get: vi.fn(async () => alice) })
    expect(session.stamp.value).toBeNull()
    await session.check()
    expect(session.state.user).toEqual(alice)
    expect(session.stamp.value).toBe('team~ada')
  })

  it('is nobody when the CMS cannot be asked', async () => {
    const session = make({ get: vi.fn().mockResolvedValueOnce(alice).mockRejectedValueOnce(new Error('down')) })
    await session.check()
    expect(await session.check()).toBeNull()
    expect(session.state.user).toBeNull()
  })

  it('signs in: the credentials are sent, then the CMS is asked who is signed in', async () => {
    const post = vi.fn(async () => ({ token: 'secret' }))
    const get = vi.fn(async () => alice)
    const session = make({ get, post })
    expect(await session.login('ada', 'pw')).toEqual(alice)
    expect(post).toHaveBeenCalledWith('/admin/login', { username: 'ada', password: 'pw' })
    expect(get).toHaveBeenCalledWith('/admin/login')
    // the app never holds the token: the cookie carries it
    expect(JSON.stringify(session.state)).not.toContain('secret')
  })

  it('says one thing, whatever the reason, when the account or the password is wrong', async () => {
    const session = make({ post: vi.fn().mockRejectedValue(new ApiError(401, 'Not authenticated')) })
    await expect(session.login('ada', 'nope')).rejects.toMatchObject({ status: 401, message: 'The account or the password is wrong.' })
    expect(session.state.user).toBeNull()
  })

  it('says that the browser may refuse cookies, when the sign-in did not hold', async () => {
    const session = make({ post: vi.fn(async () => ({})), get: vi.fn(async () => ({})) })
    await expect(session.login('ada', 'pw')).rejects.toMatchObject({ status: 401, message: expect.stringContaining('cookies') })
  })

  it('lets another failure through as it is', async () => {
    const session = make({ post: vi.fn().mockRejectedValue(new ApiError(0, 'The server cannot be reached.')) })
    await expect(session.login('ada', 'pw')).rejects.toMatchObject({ status: 0 })
    const other = make({ post: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(other.login('ada', 'pw')).rejects.toThrow('boom')
  })

  it('signs out at the CMS and here, even when the CMS cannot be reached', async () => {
    const get = vi.fn().mockResolvedValueOnce(alice).mockResolvedValueOnce({ message: 'done' }).mockRejectedValueOnce(new Error('down'))
    const session = make({ get })
    await session.check()
    await session.logout()
    expect(get).toHaveBeenLastCalledWith('/admin/logout')
    expect(session.state.user).toBeNull()
    session.state.user = alice
    await expect(session.logout()).rejects.toThrow('down')
    expect(session.state.user).toBeNull()
  })

  it('knows what the group of the person may do, to hide what would be refused', async () => {
    const session = make({ get: vi.fn(async () => alice) })
    expect(session.can('read', 'tasks')).toBe(false)
    await session.check()
    expect(session.can('read', 'tasks')).toBe(true)
    expect(session.can('update', 'tasks')).toBe(true)
    expect(session.can('remove', 'tasks')).toBe(false)
    expect(session.can('read', 'people')).toBe(false)
    expect(session.can('attachments', 'tasks')).toBe(false)
    session.state.user = { username: 'x', group: 'g' }
    expect(session.can('read', 'tasks')).toBe(false)
  })
})

describe('taskboard: the websocket', () => {
  /** a false WebSocket: the test says when it opens, what it hears, when it is lost */
  class FakeSocket {
    constructor (url) {
      this.url = url
      this.sent = []
      this.closed = false
      FakeSocket.all.push(this)
    }

    send (data) { this.sent.push(JSON.parse(data)) }
    close () { this.closed = true; this.onclose() }
    open () { this.onopen() }
    say (data) { this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) }) }
    lose () { this.onclose() }
  }
  const make = (options) => createRealtime({ url: 'ws://cms/_updates', WebSocketImpl: FakeSocket, random: () => 1, ...options })

  beforeEach(() => {
    FakeSocket.all = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the address of the websocket from the address of the page', () => {
    expect(socketUrl({ protocol: 'http:', host: 'localhost:3000' })).toBe('ws://localhost:3000/_updates')
    expect(socketUrl({ protocol: 'https:', host: 'board.example' })).toBe('wss://board.example/_updates')
    expect(socketUrl()).toBe(`ws://${window.location.host}/_updates`)
  })

  it('opens when it is started, says where it is, and does not open twice', () => {
    const realtime = make()
    expect(realtime.status.value).toBe('closed')
    realtime.start()
    realtime.start()
    expect(FakeSocket.all).toHaveLength(1)
    expect(FakeSocket.all[0].url).toBe('ws://cms/_updates')
    expect(realtime.status.value).toBe('connecting')
    FakeSocket.all[0].open()
    expect(realtime.status.value).toBe('open')
  })

  it('opens the address of the page when it is not given one', () => {
    const realtime = createRealtime({ WebSocketImpl: FakeSocket })
    realtime.start()
    expect(FakeSocket.all[0].url).toBe(`ws://${window.location.host}/_updates`)
  })

  it('answers each ping with a pong, or the CMS closes the connection', () => {
    const realtime = make()
    realtime.start()
    FakeSocket.all[0].open()
    FakeSocket.all[0].say({ action: 'ping' })
    expect(FakeSocket.all[0].sent).toEqual([{ action: 'pong' }])
  })

  it('gives each message about a record to those who listen, and not the pings', () => {
    const realtime = make()
    const heard = vi.fn()
    const off = realtime.on(heard)
    realtime.start()
    FakeSocket.all[0].open()
    FakeSocket.all[0].say({ action: 'ping' })
    FakeSocket.all[0].say({ action: 'update', data: { resource: 'tasks', _id: 'a', _updatedBy: 'team~grace' } })
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith({ action: 'update', data: { resource: 'tasks', _id: 'a', _updatedBy: 'team~grace' } })
    off()
    FakeSocket.all[0].say({ action: 'remove', data: { resource: 'tasks', _id: 'a' } })
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('does not stop for what it cannot read: not JSON, not a message, not an object', () => {
    const realtime = make()
    const heard = vi.fn()
    realtime.on(heard)
    realtime.start()
    FakeSocket.all[0].open()
    for (const bad of ['not json', '{}', 'null', '5', '{"data":1}']) {
      FakeSocket.all[0].say(bad)
    }
    expect(heard).not.toHaveBeenCalled()
    expect(FakeSocket.all[0].sent).toEqual([])
    FakeSocket.all[0].onerror(new Error('x'))
    expect(realtime.status.value).toBe('open')
  })

  it('opens again when the connection is lost, waiting twice as long each time that it fails to open', () => {
    const realtime = make({ minDelay: 1000, maxDelay: 5000 })
    realtime.start()
    FakeSocket.all[0].lose()
    expect(realtime.status.value).toBe('waiting')
    vi.advanceTimersByTime(999)
    expect(FakeSocket.all).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all).toHaveLength(2)
    expect(realtime.status.value).toBe('connecting')
    FakeSocket.all[1].lose()
    vi.advanceTimersByTime(1999)
    expect(FakeSocket.all).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all).toHaveLength(3)
    FakeSocket.all[2].lose()
    vi.advanceTimersByTime(4000)
    expect(FakeSocket.all).toHaveLength(4)
    // the longest wait is the longest
    FakeSocket.all[3].lose()
    vi.advanceTimersByTime(5000)
    expect(FakeSocket.all).toHaveLength(5)
  })

  it('spreads the retries: between half of the wait and all of it', () => {
    const early = make({ minDelay: 1000, random: () => 0 })
    early.start()
    FakeSocket.all[0].lose()
    vi.advanceTimersByTime(499)
    expect(FakeSocket.all).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all).toHaveLength(2)
  })

  it('starts again from the short wait once a connection has opened, and says "reconnected" for the second one', () => {
    const realtime = make({ minDelay: 1000 })
    const heard = vi.fn()
    realtime.on(heard)
    realtime.start()
    FakeSocket.all[0].open()
    expect(heard).not.toHaveBeenCalled()
    FakeSocket.all[0].lose()
    vi.advanceTimersByTime(1000)
    FakeSocket.all[1].lose()
    vi.advanceTimersByTime(2000)
    FakeSocket.all[2].open()
    expect(heard).toHaveBeenCalledWith({ action: 'reconnected' })
    expect(heard).toHaveBeenCalledTimes(1)
    FakeSocket.all[2].lose()
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.all).toHaveLength(4)
  })

  it('closes when it is stopped, stops trying, and can be started again', () => {
    const realtime = make()
    realtime.start()
    FakeSocket.all[0].open()
    realtime.stop()
    expect(FakeSocket.all[0].closed).toBe(true)
    expect(realtime.status.value).toBe('closed')
    vi.advanceTimersByTime(60000)
    expect(FakeSocket.all).toHaveLength(1)
    realtime.start()
    expect(FakeSocket.all).toHaveLength(2)
  })

  it('does not open again when it is stopped while it waits', () => {
    const realtime = make()
    realtime.start()
    FakeSocket.all[0].lose()
    expect(realtime.status.value).toBe('waiting')
    realtime.start()
    expect(FakeSocket.all).toHaveLength(1)
    realtime.stop()
    vi.advanceTimersByTime(60000)
    expect(FakeSocket.all).toHaveLength(1)
    expect(realtime.status.value).toBe('closed')
  })

  it('does not open again when the timer fires after it was stopped', () => {
    const timers = { setTimeout: vi.fn(() => 7), clearTimeout: vi.fn() }
    const realtime = make({ timers })
    realtime.start()
    FakeSocket.all[0].lose()
    const [fire] = timers.setTimeout.mock.calls[0]
    realtime.stop()
    expect(timers.clearTimeout).toHaveBeenCalled()
    fire()
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('can be stopped when it was never started', () => {
    const realtime = make()
    realtime.stop()
    expect(realtime.status.value).toBe('closed')
  })
})
