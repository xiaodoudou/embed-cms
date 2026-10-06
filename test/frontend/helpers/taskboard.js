// What the tests of docs/examples/taskboard share: a fake of the REST API of the CMS that keeps its records in memory (and a log of what was asked), and small helpers.
import { vi } from 'vitest'
import { ApiError } from '../../../docs/examples/taskboard/src/api/http'

export const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
export const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * A fake of the REST API of the CMS: records in memory, `page`, `get`, `post`, `put`, `delete`, and a log of what was asked. `hold` makes a call wait for the test.
 */
export function fakeHttp (initial = {}) {
  const db = { people: [], projects: [], tasks: [], comments: [], ...initial }
  let counter = 0
  const log = []
  const holds = new Map()
  const find = (resource, id) => db[resource].find((record) => record._id === id)
  const parse = (path) => {
    const [, resource, id] = path.match(/^\/api\/(\w+)(?:\/([^/?]+))?/)
    return { resource, id: id && decodeURIComponent(id) }
  }
  const gate = async (key) => {
    if (holds.has(key)) {
      await holds.get(key).promise
    }
  }
  const http = {
    log,
    db,
    /** who is signed in (what the CMS answers to the status of the login), the accounts that can sign in, and the rights of the group */
    user: null,
    accounts: { ada: 'pw' },
    rights: Object.fromEntries(['read', 'create', 'update', 'remove', 'attachments'].map((action) => [action, ['people', 'projects', 'tasks', 'comments']])),
    /** the next call that matches waits for `release()` */
    hold (key) {
      const held = deferred()
      holds.set(key, held)
      return () => { holds.delete(key); held.resolve() }
    },
    fail: null,
    async page (resource, { query = {}, limit, page = 0 } = {}, signal) {
      log.push(['page', resource, query, limit, page])
      await gate(`page ${resource}`)
      if (http.fail) {
        throw http.fail
      }
      const matching = db[resource].filter((record) => Object.entries(query).every(([key, value]) => record[key] === value))
      const items = limit ? matching.slice(page * limit, (page + 1) * limit) : matching
      return { items: items.map((record) => ({ ...record })), total: matching.length, signal }
    },
    async get (path) {
      if (path === '/admin/login') {
        return http.user ? { ...http.user } : {}
      }
      if (path === '/admin/logout') {
        http.user = null
        return { message: 'done' }
      }
      const { resource, id } = parse(path)
      log.push(['get', resource, id])
      await gate(`get ${resource} ${id}`)
      const record = find(resource, id)
      if (!record) {
        throw new ApiError(404, 'Not found')
      }
      return { ...record }
    },
    async post (path, body) {
      if (path === '/admin/login') {
        if (http.accounts[body.username] !== body.password) {
          throw new ApiError(401, 'Not authenticated')
        }
        http.user = { username: body.username, group: 'team', rights: http.rights }
        return { token: 'not-kept' }
      }
      const { resource } = parse(path)
      log.push(['post', resource, body])
      await gate(`post ${resource}`)
      if (http.fail) {
        throw http.fail
      }
      const record = { ...body, _id: `${resource}-${++counter}`, _createdAt: Date.now(), _updatedAt: Date.now() }
      db[resource].push(record)
      return { ...record }
    },
    async put (path, body) {
      const { resource, id } = parse(path)
      log.push(['put', resource, id, body])
      await gate(`put ${resource} ${id} ${JSON.stringify(body)}`)
      if (http.fail) {
        throw http.fail
      }
      const record = find(resource, id)
      Object.assign(record, body, { _updatedAt: record._updatedAt + 1 })
      return { ...record }
    },
    async delete (path) {
      const { resource, id } = parse(path)
      const file = path.match(/\/attachments\/([^/?]+)/)
      if (file) {
        log.push(['delete file', resource, id, decodeURIComponent(file[1])])
        return { done: true }
      }
      log.push(['delete', resource, id])
      await gate(`delete ${resource} ${id}`)
      if (http.fail) {
        throw http.fail
      }
      db[resource] = db[resource].filter((record) => record._id !== id)
      return { done: true }
    },
    upload: vi.fn(async () => ({ _id: 'file-1' }))
  }
  return http
}

export const rec = (id, extra = {}) => ({ _id: id, _updatedAt: 100, _createdAt: 100, ...extra })
