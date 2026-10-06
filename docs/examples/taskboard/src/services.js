// The services of the app, made once and shared: the HTTP client, the session, the connection of the websocket, the board with its collections, and the messages shown to the person.
// They are made here and handed to the app (`app.provide`), so that a test makes them with a false fetch and a false websocket and nothing else changes.
import { inject, reactive } from 'vue'
import { createHttp } from './api/http.js'
import { createRealtime } from './api/realtime.js'
import { createSession } from './api/session.js'
import { createBoard } from './stores/board.js'

/** The key under which the services are provided to the components. */
export const SERVICES = Symbol('boardwalk-services')

/** @returns {ReturnType<typeof createServices>} the services, in a component */
export const useServices = () => inject(SERVICES)

/**
 * @param {object} [options] what a test replaces
 * @param {object} [options.http] a client to use as it is, instead of making one (a test gives a fake of the REST API)
 * @param {string} [options.base]
 * @param {typeof fetch} [options.fetch]
 * @param {function(): XMLHttpRequest} [options.xhr]
 * @param {typeof WebSocket} [options.WebSocketImpl]
 * @param {object} [options.realtime] more options of the connection
 */
export function createServices ({ http: given, base, fetch, xhr, WebSocketImpl, realtime: realtimeOptions } = {}) {
  // what to do when the CMS says nobody is signed in is the router's to say, and the router needs the services: it says so afterwards
  let whenUnauthorized = () => {}
  const http = given || createHttp({ base, fetch, xhr, onUnauthorized: (error) => whenUnauthorized(error) })
  const session = createSession(http)
  const realtime = createRealtime({ WebSocketImpl, ...realtimeOptions })
  const board = createBoard({ http, realtime, session })

  /** The messages shown to the person, a few seconds: what failed, and what was taken back. */
  const toasts = reactive([])
  let counter = 0
  function notify (text, { seconds = 6 } = {}) {
    const toast = { id: ++counter, text }
    toasts.push(toast)
    setTimeout(() => {
      const index = toasts.findIndex((one) => one.id === toast.id)
      if (index !== -1) {
        toasts.splice(index, 1)
      }
    }, seconds * 1000)
  }

  return { http, session, realtime, board, toasts, notify, onUnauthorized: (callback) => { whenUnauthorized = callback } }
}
