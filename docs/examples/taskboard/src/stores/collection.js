// The records of one resource, as the app holds them. It is the one thing that knows how a record gets from the CMS to the screen and back:
//
//   - the records are kept by id, in a Map that is replaced, not changed (shallowRef): a screen that shows one card does not look at the others;
//   - a write is shown at once and sent after (optimistic), and taken back, with the reason, if the CMS refuses it;
//   - two writes of one record go one after the other, so that the answer of the first cannot arrive over the second;
//   - a record that is asked for twice at once is asked for once;
//   - what the CMS says over its websocket (someone made, changed, removed a record) is applied, and one's own changes are not loaded again.
import { computed, ref, shallowRef } from 'vue'
import { isAbort } from '../api/http.js'

/**
 * @param {object} options
 * @param {ReturnType<import('../api/http').createHttp>} options.http
 * @param {string} options.resource the name of the resource in the CMS
 * @param {ReturnType<import('../api/realtime').createRealtime>} [options.realtime] where the messages about the records come from
 * @param {ReturnType<import('../api/session').createSession>} [options.session] who is signed in, to know one's own changes
 * @param {number} [options.limit] the size of the pages a list is read in
 */
export function createCollection ({ http, resource, realtime, session, limit = 200 }) {
  const items = shallowRef(new Map())
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref(null)
  /** the records that are being asked for: id → the request */
  const asking = new Map()
  /** the last write of each record: id → the promise, so that the next one waits for it */
  const writing = new Map()
  /** what was loaded, to load it again after a loss of the connection */
  const loads = new Map()
  let temporary = 0

  const path = (id) => `/api/${resource}/${encodeURIComponent(id)}`
  /** the Map is replaced by a copy that has the change: what looks at it is told once */
  const commit = (change) => {
    const next = new Map(items.value)
    change(next)
    items.value = next
  }

  const list = computed(() => [...items.value.values()])
  const get = (id) => items.value.get(id)

  /**
   * Keeps a record that came from the CMS, unless the one held is a newer one (an answer that arrives late).
   * @param {object} record
   * @returns {object} the one that is held
   */
  function put (record) {
    const held = items.value.get(record._id)
    if (held && !held._pending && held._updatedAt > record._updatedAt) {
      return held
    }
    commit((map) => map.set(record._id, record))
    return record
  }

  /**
   * Keeps a page of records that came from the CMS: one change of the Map, whatever the number (a copy for each record would make a long list slow).
   * @param {Array<object>} records
   */
  function keep (records) {
    commit((map) => {
      for (const record of records) {
        const held = map.get(record._id)
        if (!held || held._pending || held._updatedAt <= record._updatedAt) {
          map.set(record._id, record)
        }
      }
    })
  }

  /**
   * Reads the records that match a filter, by pages, and keeps them. What was held for that filter and is not in the answer any more was removed by someone: it is dropped.
   * @param {object} [query] the filter, evaluated by the CMS
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {function(object): boolean} [options.scope] which of the held records the filter is about (to know which have gone): all by default
   */
  async function load (query = {}, { signal, scope = () => true } = {}) {
    loads.set(JSON.stringify(query), { query, scope })
    loading.value = true
    error.value = null
    try {
      const seen = new Set()
      for (let page = 0; ; page++) {
        const { items: records } = await http.page(resource, { query, limit, page }, signal)
        records.forEach((record) => seen.add(record._id))
        keep(records)
        if (records.length < limit) {
          break
        }
      }
      commit((map) => {
        for (const [id, record] of map) {
          if (!record._pending && scope(record) && !seen.has(id)) {
            map.delete(id)
          }
        }
      })
      loaded.value = true
    } catch (caught) {
      if (!isAbort(caught)) {
        error.value = caught
      }
      throw caught
    } finally {
      loading.value = false
    }
  }

  /**
   * One record, from the CMS. Asked twice at once, it is asked once.
   * @param {string} id
   * @returns {Promise<object>}
   */
  function fetch (id) {
    if (!asking.has(id)) {
      asking.set(id, http.get(path(id)).then(put).finally(() => asking.delete(id)))
    }
    return asking.get(id)
  }

  /**
   * Makes a record: it is in the list at once, with a number of its own and `_pending`, and replaced by the record of the CMS when that answers.
   * @param {object} data what is sent
   * @param {object} [shown] what is shown until the CMS answers, over `data` (what the CMS adds is not known yet: a number, a place)
   * @returns {Promise<object>} the record, as the CMS made it (with its number, its id)
   */
  async function create (data, shown = {}) {
    const id = `pending-${++temporary}`
    commit((map) => map.set(id, { ...data, ...shown, _id: id, _pending: true, _createdAt: Date.now(), _updatedAt: Date.now() }))
    try {
      const record = await http.post(`/api/${resource}`, data)
      commit((map) => {
        map.delete(id)
        map.set(record._id, record)
      })
      return record
    } catch (caught) {
      commit((map) => map.delete(id))
      throw caught
    }
  }

  /**
   * Changes a record: shown at once, sent after the writes of that record that came before, taken back if the CMS refuses it and nothing was written after it.
   * @param {string} id
   * @param {object} patch only what changes
   * @returns {Promise<object>} the record as the CMS has it now
   */
  function update (id, patch) {
    const before = items.value.get(id)
    if (!before) {
      return Promise.reject(new Error(`There is no ${resource} ${id} to change`))
    }
    commit((map) => map.set(id, { ...before, ...patch, _pending: true }))
    const previous = writing.get(id) || Promise.resolve()
    const run = previous.catch(() => {}).then(async () => {
      try {
        const record = await http.put(path(id), patch)
        // a write that was asked after this one shows its own state: only the last answer is the state
        if (writing.get(id) === run) {
          commit((map) => map.set(id, record))
        }
        return record
      } catch (caught) {
        if (writing.get(id) === run) {
          commit((map) => map.set(id, before))
        }
        throw caught
      }
    })
    writing.set(id, run)
    run.then(() => {}, () => {}).then(() => {
      if (writing.get(id) === run) {
        writing.delete(id)
      }
    })
    return run
  }

  /**
   * Removes a record: gone at once, back if the CMS refuses.
   * @param {string} id
   */
  async function remove (id) {
    const before = items.value.get(id)
    commit((map) => map.delete(id))
    try {
      await http.delete(path(id))
    } catch (caught) {
      if (before && caught.status !== 404) {
        commit((map) => map.set(id, before))
      }
      throw caught
    }
  }

  /** Reads again what was read, after the connection was lost: what was said meanwhile was not heard. */
  function reload () {
    return Promise.all([...loads.values()].map(({ query, scope }) => load(query, { scope }))).catch(() => {})
  }

  /** One reading again at a time: what is said while it goes is in it, or in the next. */
  let reloading = null
  let again = false
  function reloadSoon () {
    if (reloading) {
      again = true
      return reloading
    }
    reloading = reload().then(() => {
      reloading = null
      if (again) {
        again = false
        return reloadSoon()
      }
      return undefined
    })
    return reloading
  }

  /**
   * What the CMS says over the websocket. One's own writes are not read again: their answer has them.
   * @param {{action: string, data?: {resource: string, _id: string, _updatedBy?: string}}} message
   */
  function hear (message) {
    if (message.action === 'reconnected') {
      reload()
      return
    }
    const data = message.data
    if (!data || data.resource !== resource) {
      return
    }
    // (a message that has no id is a removal or a file: below)
    if (!data._id && message.action !== 'remove') {
      return
    }
    // the CMS says that a record was removed, and not which one (it has no id left to say); and it says a file by the id of the file, not of the record it is on. A message that does
    // not tell which record changed is a reason to read again what is held
    if (message.action === 'remove' || /Attachment$/.test(message.action)) {
      if (message.action === 'remove' && items.value.has(data._id)) {
        commit((map) => map.delete(data._id))
      } else {
        reloadSoon()
      }
      return
    }
    const held = items.value.get(data._id)
    const mine = Boolean(session && data._updatedBy && data._updatedBy === session.stamp.value)
    // a change that is mine is not read: the answer of my write has it (it may even come after the message, so a write that is out counts as well as a record that is held)
    if (mine && message.action === 'update' && (writing.has(data._id) || (held && !held._pending))) {
      return
    }
    if (mine && message.action === 'create' && held && !held._pending) {
      return
    }
    fetch(data._id).catch((caught) => {
      if (caught && caught.status === 404) {
        commit((map) => map.delete(data._id))
      }
    })
  }

  const stop = realtime ? realtime.on(hear) : () => {}

  return { items, list, loading, loaded, error, get, load, fetch, create, update, remove, reload, hear, put, stop }
}
