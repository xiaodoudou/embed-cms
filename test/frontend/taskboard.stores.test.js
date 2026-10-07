import { describe, it, expect, vi } from 'vitest'
import { reactive } from 'vue'
import { ApiError } from '../../docs/examples/taskboard/src/api/http'
import { createCollection } from '../../docs/examples/taskboard/src/stores/collection'
import { createBoard, STATUSES } from '../../docs/examples/taskboard/src/stores/board'
import { STEP } from '../../docs/examples/taskboard/src/lib/position'
import { fakeHttp, rec, tick } from './helpers/taskboard'

// The two stores of docs/examples/taskboard: the collection (the records of one resource, and how they get from the CMS to the screen and back) and the board (four collections, and
// what the screens do with them). They are given a fake of the REST API that keeps its records in memory, so that what they do with each answer is seen, and with answers that come late.


describe('taskboard: a collection', () => {
  const make = (initial, extra = {}) => {
    const http = fakeHttp({ tasks: initial })
    return { http, collection: createCollection({ http, resource: 'tasks', limit: 2, ...extra }) }
  }
  const ids = (collection) => collection.list.value.map((record) => record._id).sort()

  describe('load', () => {
    it('reads the records by pages until a page is short, and keeps them by id', async () => {
      const { http, collection } = make([rec('a'), rec('b'), rec('c'), rec('d'), rec('e')])
      const loading = collection.load({})
      expect(collection.loading.value).toBe(true)
      await loading
      expect(ids(collection)).toEqual(['a', 'b', 'c', 'd', 'e'])
      expect(http.log.map((entry) => entry[4])).toEqual([0, 1, 2])
      expect(collection.loading.value).toBe(false)
      expect(collection.loaded.value).toBe(true)
      expect(collection.get('c')).toMatchObject({ _id: 'c' })
      expect(collection.get('nothing')).toBeUndefined()
    })

    it('asks for one more page when the last one is full, and stops at the empty one', async () => {
      const { http, collection } = make([rec('a'), rec('b')])
      await collection.load({})
      expect(http.log.map((entry) => entry[4])).toEqual([0, 1])
    })

    it('asks the CMS for the filter that it is given, and passes the signal', async () => {
      const { http, collection } = make([rec('a', { project: 'p1' }), rec('b', { project: 'p2' })])
      await collection.load({ project: 'p1' })
      expect(ids(collection)).toEqual(['a'])
      expect(http.log[0].slice(1, 3)).toEqual(['tasks', { project: 'p1' }])
    })

    it('drops what it held for that filter and the CMS no longer has, and nothing else', async () => {
      const { http, collection } = make([rec('a', { project: 'p1' }), rec('b', { project: 'p1' }), rec('c', { project: 'p2' })])
      await collection.load({})
      http.db.tasks = http.db.tasks.filter((record) => record._id !== 'a' && record._id !== 'c')
      await collection.load({ project: 'p1' }, { scope: (record) => record.project === 'p1' })
      // a was of the project and is gone; c was of another project, which this load says nothing of
      expect(ids(collection)).toEqual(['b', 'c'])
    })

    it('keeps a record that is waiting for the CMS, whatever the answer says', async () => {
      const { http, collection } = make([])
      const release = http.hold('post tasks')
      const made = collection.create({ title: 'new' })
      await collection.load({})
      expect(collection.list.value.filter((record) => record._pending)).toHaveLength(1)
      release()
      await made
    })

    it('says what went wrong, and lets it through, but not a request that was cancelled on purpose', async () => {
      const { http, collection } = make([rec('a')])
      http.fail = new ApiError(500, 'The disk is full')
      await expect(collection.load({})).rejects.toMatchObject({ status: 500 })
      expect(collection.error.value).toMatchObject({ message: 'The disk is full' })
      expect(collection.loading.value).toBe(false)
      http.fail = Object.assign(new Error('aborted'), { name: 'AbortError' })
      await expect(collection.load({})).rejects.toMatchObject({ name: 'AbortError' })
      expect(collection.error.value).toBeNull()
    })

    it('has no error again once a load succeeds', async () => {
      const { http, collection } = make([rec('a')])
      http.fail = new ApiError(500, 'x')
      await collection.load({}).catch(() => {})
      http.fail = null
      await collection.load({})
      expect(collection.error.value).toBeNull()
    })
  })

  describe('a record that arrives', () => {
    it('is not kept over a newer one that is held: an answer that came late', async () => {
      const { collection } = make([])
      collection.put(rec('a', { title: 'new', _updatedAt: 200 }))
      expect(collection.put(rec('a', { title: 'old', _updatedAt: 100 })).title).toBe('new')
      expect(collection.get('a').title).toBe('new')
      expect(collection.put(rec('a', { title: 'newer', _updatedAt: 300 })).title).toBe('newer')
    })

    it('replaces the one that waits for the CMS', async () => {
      const { collection } = make([])
      collection.put(rec('a', { title: 'mine', _updatedAt: 500, _pending: true }))
      expect(collection.put(rec('a', { title: 'theirs', _updatedAt: 100 })).title).toBe('theirs')
    })
  })

  describe('fetch', () => {
    it('asks for a record once, however many ask at once, and asks again later', async () => {
      const { http, collection } = make([rec('a', { title: 'x' })])
      const release = http.hold('get tasks a')
      const first = collection.fetch('a')
      const second = collection.fetch('a')
      expect(second).toBe(first)
      release()
      await first
      expect(http.log.filter((entry) => entry[0] === 'get')).toHaveLength(1)
      await collection.fetch('a')
      expect(http.log.filter((entry) => entry[0] === 'get')).toHaveLength(2)
    })

    it('asks again after a failure, and says the failure', async () => {
      const { collection } = make([])
      await expect(collection.fetch('nothing')).rejects.toMatchObject({ status: 404 })
      await expect(collection.fetch('nothing')).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('create', () => {
    it('shows the record at once, with a number of its own, and puts the record of the CMS in its place', async () => {
      const { http, collection } = make([])
      const release = http.hold('post tasks')
      const made = collection.create({ title: 'New', status: 'todo' })
      await tick()
      expect(collection.list.value).toHaveLength(1)
      expect(collection.list.value[0]).toMatchObject({ _id: 'pending-1', title: 'New', _pending: true })
      release()
      const record = await made
      expect(record._id).toBe('tasks-1')
      expect(collection.list.value).toHaveLength(1)
      expect(collection.get('tasks-1')).toMatchObject({ title: 'New' })
      expect(collection.get('pending-1')).toBeUndefined()
    })

    it('takes the record back when the CMS refuses it, and says why', async () => {
      const { http, collection } = make([])
      http.fail = new ApiError(400, 'A title is required')
      await expect(collection.create({ title: '' })).rejects.toMatchObject({ message: 'A title is required' })
      expect(collection.list.value).toEqual([])
    })

    it('gives each waiting record a number of its own', async () => {
      const { http, collection } = make([])
      http.hold('post tasks')
      collection.create({ title: 'a' })
      collection.create({ title: 'b' })
      await tick()
      expect(ids(collection)).toEqual(['pending-1', 'pending-2'])
    })
  })

  describe('update', () => {
    it('shows the change at once, and keeps the record of the CMS when it answers', async () => {
      const { http, collection } = make([rec('a', { title: 'Old', status: 'todo' })])
      await collection.load({})
      const release = http.hold('put tasks a {"title":"New"}')
      const changed = collection.update('a', { title: 'New' })
      expect(collection.get('a')).toMatchObject({ title: 'New', status: 'todo', _pending: true })
      release()
      const record = await changed
      expect(record.title).toBe('New')
      expect(collection.get('a')._pending).toBeUndefined()
      expect(collection.get('a')._updatedAt).toBe(101)
    })

    it('puts the record back as it was when the CMS refuses the change', async () => {
      const { http, collection } = make([rec('a', { title: 'Old' })])
      await collection.load({})
      http.fail = new ApiError(401, 'Not authorized')
      await expect(collection.update('a', { title: 'New' })).rejects.toMatchObject({ status: 401 })
      expect(collection.get('a')).toMatchObject({ title: 'Old' })
      expect(collection.get('a')._pending).toBeUndefined()
    })

    it('refuses a record that is not there', async () => {
      const { collection } = make([])
      await expect(collection.update('nothing', { title: 'x' })).rejects.toThrow('There is no tasks nothing to change')
    })

    it('sends the writes of one record one after the other, and the state is the last one, whatever the order of the answers', async () => {
      const { http, collection } = make([rec('a', { title: 'Old' })])
      await collection.load({})
      const first = http.hold('put tasks a {"title":"One"}')
      const one = collection.update('a', { title: 'One' })
      const two = collection.update('a', { title: 'Two' })
      await tick()
      // the second is not sent while the first is out
      expect(http.log.filter((entry) => entry[0] === 'put')).toHaveLength(1)
      expect(collection.get('a').title).toBe('Two')
      first()
      await Promise.all([one, two])
      expect(http.log.filter((entry) => entry[0] === 'put').map((entry) => entry[3])).toEqual([{ title: 'One' }, { title: 'Two' }])
      expect(collection.get('a')).toMatchObject({ title: 'Two' })
      expect(collection.get('a')._pending).toBeUndefined()
    })

    it('does not take the screen back to an older state when an earlier write fails and a later one is waiting', async () => {
      const { http, collection } = make([rec('a', { title: 'Old' })])
      await collection.load({})
      const release = http.hold('put tasks a {"title":"One"}')
      http.fail = new ApiError(500, 'first fails')
      const one = collection.update('a', { title: 'One' }).catch((error) => error)
      const two = collection.update('a', { title: 'Two' }).catch((error) => error)
      await tick()
      expect(collection.get('a').title).toBe('Two')
      release()
      expect((await one).message).toBe('first fails')
      http.fail = null
      // the second one is sent after the first one failed, and succeeds
      expect((await two).title).toBe('Two')
      expect(collection.get('a').title).toBe('Two')
    })

    it('goes on with the next write after one that failed', async () => {
      const { http, collection } = make([rec('a', { title: 'Old', status: 'todo' })])
      await collection.load({})
      http.fail = new ApiError(500, 'no')
      await collection.update('a', { title: 'One' }).catch(() => {})
      http.fail = null
      await collection.update('a', { status: 'done' })
      expect(collection.get('a')).toMatchObject({ title: 'Old', status: 'done' })
    })
  })

  describe('remove', () => {
    it('takes the record away at once', async () => {
      const { http, collection } = make([rec('a'), rec('b')])
      await collection.load({})
      const release = http.hold('delete tasks a')
      const removed = collection.remove('a')
      expect(ids(collection)).toEqual(['b'])
      release()
      await removed
      expect(http.db.tasks.map((record) => record._id)).toEqual(['b'])
    })

    it('puts it back when the CMS refuses', async () => {
      const { http, collection } = make([rec('a', { title: 'Kept' })])
      await collection.load({})
      http.fail = new ApiError(401, 'Not authorized')
      await expect(collection.remove('a')).rejects.toMatchObject({ status: 401 })
      expect(collection.get('a')).toMatchObject({ title: 'Kept' })
    })

    it('does not put it back when the CMS says it was already gone', async () => {
      const { http, collection } = make([rec('a')])
      await collection.load({})
      http.fail = new ApiError(404, 'Not found')
      await expect(collection.remove('a')).rejects.toMatchObject({ status: 404 })
      expect(collection.get('a')).toBeUndefined()
    })

    it('says so when the record was not held and the CMS refuses', async () => {
      const { http, collection } = make([])
      http.fail = new ApiError(500, 'no')
      await expect(collection.remove('ghost')).rejects.toMatchObject({ status: 500 })
      expect(collection.list.value).toEqual([])
    })
  })

  describe('what the CMS says over the websocket', () => {
    const session = { stamp: { value: 'team~ada' } }
    const said = (action, data) => ({ action, data: { resource: 'tasks', _id: 'a', _updatedBy: 'team~grace', ...data } })

    it('is heard from the connection it is given, and stops being heard when it is stopped', () => {
      const off = vi.fn()
      const realtime = { on: vi.fn(() => off) }
      const collection = createCollection({ http: fakeHttp(), resource: 'tasks', realtime })
      expect(realtime.on).toHaveBeenCalledWith(collection.hear)
      collection.stop()
      expect(off).toHaveBeenCalledOnce()
    })

    it('reads a record that someone else changed or made, and shows it', async () => {
      const { http, collection } = make([rec('a', { title: 'Old' })], { session })
      await collection.load({})
      http.db.tasks[0].title = 'Changed by Grace'
      http.db.tasks[0]._updatedAt = 150
      collection.hear(said('update'))
      await tick()
      expect(collection.get('a').title).toBe('Changed by Grace')
      http.db.tasks.push(rec('b', { title: 'Made by Grace' }))
      collection.hear(said('create', { _id: 'b' }))
      await tick()
      expect(collection.get('b').title).toBe('Made by Grace')
    })

    it('does not read again a change that is its own and is held: the answer of the write has it', async () => {
      const { http, collection } = make([rec('a')], { session })
      await collection.load({})
      collection.hear(said('update', { _updatedBy: 'team~ada' }))
      collection.hear(said('create', { _updatedBy: 'team~ada' }))
      await tick()
      expect(http.log.filter((entry) => entry[0] === 'get')).toHaveLength(0)
    })

    it('reads its own change when the record is not held (another window made it), and when a write of it is still out', async () => {
      const { http, collection } = make([rec('a')], { session })
      await collection.load({})
      http.db.tasks.push(rec('z'))
      collection.hear(said('update', { _id: 'z', _updatedBy: 'team~ada' }))
      collection.put(rec('a', { _pending: true, _updatedAt: 500 }))
      collection.hear(said('update', { _updatedBy: 'team~ada' }))
      await tick()
      expect(http.log.filter((entry) => entry[0] === 'get')).toHaveLength(2)
    })

    it('reads again what it holds when a file was added, changed or taken away, even by oneself: the CMS says the id of the file, not of the record it is on', async () => {
      const { http, collection } = make([rec('a')], { session })
      await collection.load({})
      for (const action of ['createAttachment', 'updateAttachment', 'removeAttachment']) {
        http.log.length = 0
        http.db.tasks[0].files = [{ _id: 'f-' + action }]
        collection.hear(said(action, { _id: 'the-id-of-a-file', _updatedBy: 'team~ada' }))
        await tick()
        await tick()
        expect(http.log.filter((entry) => entry[0] === 'page').length, action).toBeGreaterThanOrEqual(1)
        expect(http.log.filter((entry) => entry[0] === 'get')).toHaveLength(0)
        expect(collection.get('a').files).toEqual([{ _id: 'f-' + action }])
      }
    })

    it('reads again once, not once for each message, when many come while it reads', async () => {
      const { http, collection } = make([rec('a')])
      await collection.load({})
      http.log.length = 0
      const release = http.hold('page tasks')
      for (let index = 0; index < 5; index++) {
        collection.hear(said('createAttachment', { _id: `file-${index}` }))
      }
      release()
      await tick()
      await tick()
      await tick()
      const reads = http.log.filter((entry) => entry[0] === 'page').length
      // the one that was going, and one more for what was said while it went
      expect(reads).toBe(2)
    })

    it('removes a record that someone removed', async () => {
      const { collection } = make([rec('a'), rec('b')])
      await collection.load({})
      collection.hear(said('remove'))
      expect(ids(collection)).toEqual(['b'])
    })

    it('reads again when a record was removed and the CMS did not say which: it has no id left to say', async () => {
      const { http, collection } = make([rec('a'), rec('b')])
      await collection.load({})
      http.db.tasks = http.db.tasks.filter((record) => record._id !== 'a')
      collection.hear({ action: 'remove', data: { resource: 'tasks', _id: false, _updatedBy: 'team~grace' } })
      await tick()
      await tick()
      expect(ids(collection)).toEqual(['b'])
    })

    it('does not read what it holds again for a removal of another resource', async () => {
      const { http, collection } = make([rec('a')])
      await collection.load({})
      http.log.length = 0
      collection.hear({ action: 'remove', data: { resource: 'comments', _id: false } })
      await tick()
      expect(http.log).toEqual([])
    })

    it('does not read a change of its own while its write is still out: the answer of the write is the state, and the message can come before it', async () => {
      const { http, collection } = make([rec('a', { title: 'Old' })], { session })
      await collection.load({})
      const release = http.hold('put tasks a {"title":"New"}')
      const changed = collection.update('a', { title: 'New' })
      collection.hear(said('update', { _updatedBy: 'team~ada' }))
      await tick()
      expect(http.log.filter((entry) => entry[0] === 'get')).toHaveLength(0)
      release()
      await changed
      expect(collection.get('a').title).toBe('New')
    })

    it('forgets a record that is gone when it asks for it, and ignores any other fault', async () => {
      const { http, collection } = make([rec('a')])
      await collection.load({})
      http.db.tasks = []
      collection.hear(said('update'))
      await tick()
      expect(collection.get('a')).toBeUndefined()
      collection.put(rec('b'))
      http.get = vi.fn().mockRejectedValue(new ApiError(500, 'down'))
      collection.hear(said('update', { _id: 'b' }))
      await tick()
      expect(collection.get('b')).toBeDefined()
    })

    it('ignores what is about another resource, and what is not a change of a record', async () => {
      const { http, collection } = make([rec('a')])
      await collection.load({})
      collection.hear({ action: 'update', data: { resource: 'comments', _id: 'a' } })
      collection.hear({ action: 'update' })
      collection.hear({ action: 'update', data: { resource: 'tasks' } })
      collection.hear({ action: 'remove', data: { resource: 'comments', _id: 'a' } })
      await tick()
      expect(http.log.filter((entry) => entry[0] === 'get')).toHaveLength(0)
      expect(ids(collection)).toEqual(['a'])
    })

    it('reads again what it had read, when the connection came back: what was said meanwhile was not heard', async () => {
      const { http, collection } = make([rec('a', { project: 'p1' })])
      await collection.load({ project: 'p1' }, { scope: (record) => record.project === 'p1' })
      await collection.load({})
      http.db.tasks.push(rec('b', { project: 'p1' }))
      http.log.length = 0
      collection.hear({ action: 'reconnected' })
      await tick()
      await tick()
      expect(http.log.filter((entry) => entry[0] === 'page').length).toBeGreaterThanOrEqual(2)
      expect(ids(collection)).toEqual(['a', 'b'])
    })

    it('does not fail when what it reads again fails', async () => {
      const { http, collection } = make([rec('a')])
      await collection.load({})
      http.fail = new ApiError(500, 'down')
      await expect(collection.reload()).resolves.toBeUndefined()
    })
  })
})

describe('taskboard: the board', () => {
  const setup = (initial = {}) => {
    const http = fakeHttp({
      people: [rec('ada-id', { name: 'Ada Reader', username: 'ada' }), rec('grace-id', { name: 'Grace Hopper', username: 'grace' })],
      projects: [rec('web', { key: 'WEB', name: 'Website' }), rec('ops', { key: 'OPS', name: 'Operations' })],
      tasks: [
        rec('t1', { ref: 'WEB-1', project: 'web', status: 'todo', position: 2000, title: 'Second', labels: ['bug'], assignee: 'ada-id' }),
        rec('t2', { ref: 'WEB-2', project: 'web', status: 'todo', position: 1000, title: 'First', labels: ['content', 'bug'] }),
        rec('t3', { ref: 'WEB-3', project: 'web', status: 'doing', position: 1000, title: 'Doing', assignee: 'grace-id' }),
        rec('t4', { ref: 'OPS-1', project: 'ops', status: 'todo', position: 1000, title: 'Other project', labels: ['servers'] })
      ],
      comments: [rec('c1', { task: 't1', text: 'later', _createdAt: 200 }), rec('c2', { task: 't1', text: 'earlier', _createdAt: 100 }), rec('c3', { task: 't2', text: 'elsewhere', _createdAt: 50 })],
      ...initial
    })
    const realtime = { on: vi.fn(() => () => {}) }
    const session = { stamp: { value: 'team~ada' }, state: reactive({ user: { username: 'ada', group: 'team' } }) }
    const board = createBoard({ http, realtime, session })
    return { http, realtime, session, board }
  }
  const empty = { text: '', who: [], label: [], due: '' }

  it('has the four columns of a task, in order', () => {
    expect(STATUSES.map((status) => status.value)).toEqual(['todo', 'doing', 'review', 'done'])
  })

  describe('open', () => {
    it('loads the team, the projects and the tasks of the project, and gives the project', async () => {
      const { board } = setup()
      const project = await board.open('WEB')
      expect(project).toMatchObject({ key: 'WEB' })
      expect(board.people.list.value).toHaveLength(2)
      expect(board.projects.list.value).toHaveLength(2)
      // the tasks of the other project were not asked for
      expect(board.tasks.list.value.map((task) => task.ref).sort()).toEqual(['WEB-1', 'WEB-2', 'WEB-3'])
    })

    it('does not load the team and the projects again when another board is opened, and loads the tasks of that board', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      http.log.length = 0
      await board.open('OPS')
      expect(http.log.map((entry) => entry[1])).toEqual(['tasks'])
      expect(board.tasks.list.value.map((task) => task.ref).sort()).toEqual(['OPS-1', 'WEB-1', 'WEB-2', 'WEB-3'])
    })

    it('says that there is no such project, and asks for no task', async () => {
      const { http, board } = setup()
      expect(await board.open('NOPE')).toBeUndefined()
      expect(http.log.some((entry) => entry[1] === 'tasks')).toBe(false)
    })

    it('forgets the tasks of a project that someone removed, when it is opened again', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      http.db.tasks = http.db.tasks.filter((task) => task._id !== 't3')
      await board.open('WEB')
      expect(board.tasks.get('t3')).toBeUndefined()
      expect(board.tasks.get('t4')).toBeUndefined()
    })
  })

  describe('what is derived', () => {
    it('is the person that the signed-in account is, and the account of a person', async () => {
      const { board, session } = setup()
      await board.open('WEB')
      expect(board.me.value).toMatchObject({ name: 'Ada Reader' })
      expect(board.usernameOf('grace-id')).toBe('grace')
      expect(board.usernameOf('nobody')).toBeUndefined()
      session.state.user = { username: 'stranger', group: 'team' }
      expect(board.me.value).toBeNull()
      session.state.user = null
      expect(board.me.value).toBeNull()
    })

    it('is the cards of a column: of that project and that status, in their order, ties by their number', async () => {
      const { board } = setup()
      await board.open('WEB')
      expect(board.column('web', 'todo', empty).map((task) => task.ref)).toEqual(['WEB-2', 'WEB-1'])
      expect(board.column('web', 'doing', empty).map((task) => task.ref)).toEqual(['WEB-3'])
      expect(board.column('web', 'done', empty)).toEqual([])
      board.tasks.put(rec('t5', { ref: 'WEB-10', project: 'web', status: 'doing', position: 1000 }))
      expect(board.column('web', 'doing', empty).map((task) => task.ref)).toEqual(['WEB-10', 'WEB-3'])
    })

    it('is the cards of a column that a filter keeps', async () => {
      const { board } = setup()
      await board.open('WEB')
      expect(board.column('web', 'todo', { ...empty, who: ['ada'] }).map((task) => task.ref)).toEqual(['WEB-1'])
      expect(board.column('web', 'todo', { ...empty, label: ['content'] }).map((task) => task.ref)).toEqual(['WEB-2'])
      expect(board.column('web', 'todo', { ...empty, text: 'first' }).map((task) => task.ref)).toEqual(['WEB-2'])
    })

    it('is the labels of a project, once each, in order', async () => {
      const { board } = setup()
      await board.open('WEB')
      expect(board.labelsOf('web')).toEqual(['bug', 'content'])
      expect(board.labelsOf('ops')).toEqual([])
      expect(board.projectByKey('WEB')).toMatchObject({ _id: 'web' })
      expect(board.projectByKey('NOPE')).toBeUndefined()
    })
  })

  describe('addTask', () => {
    it('makes a task in a column of a project, and the CMS numbers it', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      await board.addTask('web', 'todo', 'A new one')
      expect(http.log.find((entry) => entry[0] === 'post')).toEqual(['post', 'tasks', { project: 'web', status: 'todo', title: 'A new one' }])
    })
  })

  describe('moveTask', () => {
    it('writes the card alone: its column and a place between the neighbours', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      http.log.length = 0
      // t3 (doing) is dropped into todo, between WEB-2 (1000) and WEB-1 (2000)
      const cards = board.column('web', 'todo', empty)
      await board.moveTask('t3', 'todo', cards, 1)
      const writes = http.log.filter((entry) => entry[0] === 'put')
      expect(writes).toEqual([['put', 'tasks', 't3', { status: 'todo', position: 1500 }]])
      expect(board.column('web', 'todo', empty).map((task) => task.ref)).toEqual(['WEB-2', 'WEB-3', 'WEB-1'])
      expect(board.column('web', 'doing', empty)).toEqual([])
    })

    it('moves a card inside its column', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      http.log.length = 0
      await board.moveTask('t1', 'todo', board.column('web', 'todo', empty), 0)
      expect(http.log.filter((entry) => entry[0] === 'put')).toEqual([['put', 'tasks', 't1', { status: 'todo', position: 0 }]])
      expect(board.column('web', 'todo', empty).map((task) => task.ref)).toEqual(['WEB-1', 'WEB-2'])
    })

    it('numbers the column again, then moves the card, when the numbers have no room left', async () => {
      const { http, board } = setup({
        tasks: [
          rec('t1', { ref: 'WEB-1', project: 'web', status: 'todo', position: 1 }),
          rec('t2', { ref: 'WEB-2', project: 'web', status: 'todo', position: 1.0000000001 }),
          rec('t3', { ref: 'WEB-3', project: 'web', status: 'doing', position: 1 })
        ]
      })
      await board.open('WEB')
      http.log.length = 0
      await board.moveTask('t3', 'todo', board.column('web', 'todo', empty), 1)
      const writes = http.log.filter((entry) => entry[0] === 'put').map((entry) => [entry[2], entry[3]])
      expect(writes).toEqual([['t1', { position: STEP }], ['t2', { position: 2 * STEP }], ['t3', { status: 'todo', position: 1500 }]])
      expect(board.column('web', 'todo', empty).map((task) => task.ref)).toEqual(['WEB-1', 'WEB-3', 'WEB-2'])
    })

    it('says why, and leaves the card where it was, when the CMS refuses', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      http.fail = new ApiError(401, 'Not authorized')
      await expect(board.moveTask('t3', 'todo', board.column('web', 'todo', empty), 0)).rejects.toMatchObject({ status: 401 })
      expect(board.tasks.get('t3')).toMatchObject({ status: 'doing', position: 1000 })
    })
  })

  describe('the comments', () => {
    it('reads the comments of a task, and shows them oldest first', async () => {
      const { board } = setup()
      await board.openTask('t1')
      expect(board.commentsOf('t1').map((comment) => comment.text)).toEqual(['earlier', 'later'])
      expect(board.commentsOf('t2')).toEqual([])
    })

    it('forgets the comments that someone removed, when it reads them again', async () => {
      const { http, board } = setup()
      await board.openTask('t1')
      http.db.comments = http.db.comments.filter((comment) => comment._id !== 'c2')
      await board.openTask('t1')
      expect(board.commentsOf('t1').map((comment) => comment.text)).toEqual(['later'])
    })

    it('adds a comment, and does not say who wrote it: the CMS knows', async () => {
      const { http, board } = setup()
      await board.openTask('t1')
      await board.addComment('t1', 'A thought')
      expect(http.log.find((entry) => entry[0] === 'post')).toEqual(['post', 'comments', { task: 't1', text: 'A thought' }])
      expect(board.commentsOf('t1').map((comment) => comment.text)).toEqual(['earlier', 'later', 'A thought'])
    })
  })

  describe('the files', () => {
    it('sends a file to the field of the task, says how far, then reads the task again', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      http.db.tasks[0].files = [{ _id: 'f1' }]
      http.log.length = 0
      const onProgress = vi.fn()
      const signal = new AbortController().signal
      const blob = new Blob(['x'])
      await board.attach('t1', blob, onProgress, signal)
      expect(http.upload).toHaveBeenCalledWith('tasks', 't1', { field: 'files', blob, onProgress, signal })
      expect(http.log).toEqual([['get', 'tasks', 't1']])
      expect(board.tasks.get('t1').files).toEqual([{ _id: 'f1' }])
    })

    it('does not read the task again when the upload fails', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      http.upload.mockRejectedValueOnce(new ApiError(413, 'Too big'))
      http.log.length = 0
      await expect(board.attach('t1', new Blob(['x']))).rejects.toMatchObject({ status: 413 })
      expect(http.log).toEqual([])
    })

    it('takes a file off a task, then reads the task again', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      http.log.length = 0
      await board.detach('t1', 'f 1')
      expect(http.log).toEqual([['delete file', 'tasks', 't1', 'f 1'], ['get', 'tasks', 't1']])
    })
  })

  describe('the projects', () => {
    it('makes a project', async () => {
      const { http, board } = setup()
      await board.open('WEB')
      const project = await board.addProject({ name: 'Mobile', key: 'MOB' })
      expect(project).toMatchObject({ key: 'MOB' })
      expect(http.db.projects.map((one) => one.key)).toContain('MOB')
    })
  })

  it('stops listening to the connection', () => {
    const off = vi.fn()
    const http = fakeHttp()
    const board = createBoard({ http, realtime: { on: () => off }, session: { stamp: { value: null }, state: { user: null } } })
    board.stop()
    expect(off).toHaveBeenCalledTimes(4)
  })
})
