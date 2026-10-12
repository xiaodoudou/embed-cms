// The websocket upgrades of an HTTP server, shared by the parts of the CMS that need one: the record updates (any
// path, as before) and the replication (a path ending in /_replicator). The ws library cannot share a server between
// two of its servers when one of them takes every path, so each part registers here and one listener routes them.

const http = require('http')

const ROUTES = Symbol('embed-cms upgrade routes')

/**
 * @param {import('http').IncomingMessage} req
 * @returns {string} the path of the request, without the query
 */
function pathnameOf (req) {
  const url = String(req.url || '/')
  const query = url.indexOf('?')
  return query === -1 ? url : url.slice(0, query)
}

/**
 * Routes the upgrades of a server: the first route whose `match` takes the path, else the fallback route, else none
 * (the connection is dropped, as an HTTP server with no upgrade listener does).
 * @param {import('http').Server} server
 * @param {{match?: function(string): boolean, fallback?: boolean, handle: function(object, object, Buffer): void}} route
 * @returns {function(): void} removes the route
 */
function addUpgradeRoute (server, route) {
  if (!server[ROUTES]) {
    const routes = []
    server[ROUTES] = routes
    server.on('upgrade', (req, socket, head) => {
      const pathname = pathnameOf(req)
      const chosen = routes.find((one) => !one.fallback && one.match(pathname)) || routes.find((one) => one.fallback)
      if (!chosen) {
        return socket.destroy()
      }
      chosen.handle(req, socket, head)
    })
  }
  server[ROUTES].push(route)
  return () => {
    const routes = server[ROUTES]
    const index = routes.indexOf(route)
    if (index !== -1) {
      routes.splice(index, 1)
    }
  }
}

/**
 * Answers an upgrade with an HTTP status and closes the connection.
 * @param {import('net').Socket} socket
 * @param {number} status
 */
function refuseUpgrade (socket, status) {
  if (socket.writable) {
    socket.write(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  }
  socket.destroy()
}

module.exports = { addUpgradeRoute, pathnameOf, refuseUpgrade }
