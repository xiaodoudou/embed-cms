// What the CMS says over its websocket (`/_updates`) when a record is made, changed or removed: `{ action, data: { resource, _id, _updatedBy } }`, and a `ping` every thirty seconds that
// has to be answered with a `pong` or the connection is closed. The message is short on purpose: it says what changed, not what it became; the app asks for the record.
//
// This keeps the connection: it opens it, answers the pings, opens it again when it is lost (waiting longer each time, not all at the same moment as everyone else), and says
// `reconnected` after a loss, since what was said in the meantime was not heard.
import { ref } from 'vue'

/** @returns {string} the address of the websocket of the CMS that serves this page */
export const socketUrl = (location = globalThis.location) => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/_updates`

/**
 * @param {object} [options]
 * @param {string} [options.url]
 * @param {typeof WebSocket} [options.WebSocketImpl]
 * @param {{setTimeout: function, clearTimeout: function}} [options.timers] a test gives its own
 * @param {function(): number} [options.random] between 0 and 1: spreads the retries
 * @param {number} [options.minDelay] the first wait before trying again, in ms
 * @param {number} [options.maxDelay] the longest
 */
export function createRealtime ({ url, WebSocketImpl = globalThis.WebSocket, timers = { setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a) }, random = Math.random, minDelay = 1000, maxDelay = 15000 } = {}) {
  /** 'closed' (not wanted), 'connecting', 'open', 'waiting' (lost, will try again) */
  const status = ref('closed')
  const listeners = new Set()
  let socket = null
  let timer = null
  let wanted = false
  let attempt = 0
  let hadConnection = false

  const emit = (message) => listeners.forEach((listener) => listener(message))

  /** @returns {number} how long to wait: twice as long each time, up to the longest, spread between half of it and all of it */
  const delay = () => Math.round(Math.min(maxDelay, minDelay * 2 ** attempt) * (0.5 + random() / 2))

  function connect () {
    status.value = 'connecting'
    let opened = false
    const current = new WebSocketImpl(url || socketUrl())
    socket = current
    current.onopen = () => {
      opened = true
      attempt = 0
      status.value = 'open'
      // what was said while it was not connected is lost: whoever listens loads again
      if (hadConnection) {
        emit({ action: 'reconnected' })
      }
      hadConnection = true
    }
    current.onmessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (message && message.action === 'ping') {
        current.send(JSON.stringify({ action: 'pong' }))
      } else if (message && message.action) {
        emit(message)
      }
    }
    current.onerror = () => {}
    current.onclose = () => {
      if (socket === current) {
        socket = null
      }
      if (!wanted) {
        status.value = 'closed'
        return
      }
      status.value = 'waiting'
      const wait = delay()
      attempt += opened ? 0 : 1
      timer = timers.setTimeout(() => {
        timer = null
        if (wanted) {
          connect()
        }
      }, wait)
    }
  }

  return {
    status,
    /** Opens the connection, and keeps it open. */
    start () {
      wanted = true
      if (!socket && !timer) {
        connect()
      }
    },
    /** Closes it, and stops trying. */
    stop () {
      wanted = false
      if (timer) {
        timers.clearTimeout(timer)
        timer = null
      }
      if (socket) {
        socket.close()
      }
      status.value = 'closed'
    },
    /**
     * @param {function(object): void} listener told of each message that is not a ping
     * @returns {function(): void} what takes it away
     */
    on (listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
