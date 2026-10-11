const crypto = require('crypto')
const WebSocket = require('ws')
const cap = require('./cap')
const safeEqual = require('../../util/safeEqual')
const { addUpgradeRoute } = require('../../util/upgrades')

// The replication protocol, carried over a websocket on the HTTP port of the CMS: a peer connects to the path
// /_replicator next to the REST API (http://site/api/ -> ws://site/_replicator). Both sides prove they know
// replication.secret, then name themselves and the resource, then exchange their changes (lib/db/*/Sync*.js).

const PATH_END = '/_replicator'
// first character of the frames of the authentication step, so a peer that does not know it can be told apart
const AUTH_MARK = '\u0001'
const NONCE_LENGTH = 64 // hex characters of 32 random bytes
const PROOF_LENGTH = 64 // hex characters of an HMAC-SHA256
// a peer that stops answering is dropped, during the handshake and, on the server, during the exchange
const IDLE_TIMEOUT = 30000
// the largest message a peer may send: a record is at most replication.maxRecordBytes (4 MB by default), sent in one message
const MAX_PAYLOAD = 16 * 1024 * 1024

const proof = (secret, role, serverNonce, clientNonce) => {
  return crypto.createHmac('sha256', secret).update(`${role}|${serverNonce}|${clientNonce}`).digest('hex')
}

/**
 * Reads one frame: a length byte, then that many characters.
 * @param {import('stream').Duplex} stream
 * @param {function(string): void} cb
 */
const readFrame = function (stream, cb) {
  cap(stream, 1, (buf) => {
    cap(stream, buf.readUInt8(0), frame => cb(frame.toString()))
  })
}

/**
 * Writes one frame: a length byte, then the text.
 * @param {import('stream').Duplex} stream
 * @param {string} text
 */
const writeFrame = function (stream, text) {
  const length = Buffer.alloc(1)
  length.writeUInt8(text.length, 0)
  stream.write(Buffer.concat([length, Buffer.from(text)]))
}

/**
 * The name of a side: its 8-character machine id, then the resource (empty from the server).
 * @param {import('stream').Duplex} stream
 * @param {function(string, string): void} cb called with (resource name, machine id)
 */
const readName = function (stream, cb) {
  readFrame(stream, frame => cb(frame.substring(8), frame.substring(0, 8)))
}

/**
 * Server side of the authentication: the client proves it knows the shared secret, then the server does. The client
 * answers the nonce of the server with its own nonce and an HMAC over both; the server answers with an HMAC over both
 * nonces under another role, so neither side can replay what the other sent.
 * @param {import('stream').Duplex} stream
 * @param {string} secret
 * @param {function(boolean): void} cb
 */
const authenticateClient = function (stream, secret, cb) {
  const serverNonce = crypto.randomBytes(NONCE_LENGTH / 2).toString('hex')
  writeFrame(stream, AUTH_MARK + serverNonce)
  readFrame(stream, frame => {
    const clientNonce = frame.slice(1, 1 + NONCE_LENGTH)
    const received = frame.slice(1 + NONCE_LENGTH)
    const valid = frame.startsWith(AUTH_MARK) && clientNonce.length === NONCE_LENGTH && received.length === PROOF_LENGTH &&
      safeEqual(received, proof(secret, 'client', serverNonce, clientNonce))
    if (!valid) {
      return cb(false)
    }
    writeFrame(stream, proof(secret, 'server', serverNonce, clientNonce))
    cb(true)
  })
}

/**
 * Client side of the authentication: answers the nonce of the server with the shared secret, and checks the server's answer in turn.
 * @param {import('stream').Duplex} stream
 * @param {string} secret
 * @param {function(boolean): void} cb
 */
const authenticateServer = function (stream, secret, cb) {
  readFrame(stream, frame => {
    const serverNonce = frame.slice(1)
    if (!frame.startsWith(AUTH_MARK) || serverNonce.length !== NONCE_LENGTH) {
      return cb(false)
    }
    const clientNonce = crypto.randomBytes(NONCE_LENGTH / 2).toString('hex')
    writeFrame(stream, AUTH_MARK + clientNonce + proof(secret, 'client', serverNonce, clientNonce))
    readFrame(stream, answer => cb(answer.length === PROOF_LENGTH && safeEqual(answer, proof(secret, 'server', serverNonce, clientNonce))))
  })
}

/**
 * Drops a websocket that has received nothing for a while. It listens to the socket, not to the stream over it, so that
 * reading the stream stays in the hands of the protocol.
 * @param {WebSocket} ws
 * @param {number} ms
 * @returns {function(): void} stops watching
 */
const dropWhenIdle = function (ws, ms) {
  let timer = null
  const reset = () => {
    clearTimeout(timer)
    timer = setTimeout(() => ws.terminate(), ms)
  }
  ws.on('message', reset)
  reset()
  return () => {
    clearTimeout(timer)
    ws.removeListener('message', reset)
  }
}

/**
 * The websocket address of a peer, from the address of its REST API: http://site:9990/cms/api/ -> ws://site:9990/cms/_replicator
 * @param {string} apiUrl
 * @returns {string}
 */
const replicationUrl = function (apiUrl) {
  let url
  try {
    url = new URL(apiUrl)
  } catch {
    throw new Error(`The url of a replication peer is not an address: ${JSON.stringify(apiUrl)}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`The url of a replication peer must start with http:// or https://: ${apiUrl}`)
  }
  const pathname = url.pathname.replace(/\/+$/, '')
  if (!pathname.endsWith('/api')) {
    throw new Error(`The url of a replication peer is the address of its REST API, ending in /api/: ${apiUrl}`)
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = pathname.slice(0, -'/api'.length) + PATH_END
  url.search = ''
  url.hash = ''
  return url.toString()
}

module.exports = {
  PATH_END,
  replicationUrl,
  /**
   * Listens for peers on the HTTP server: an upgrade to a path that ends in /_replicator. A peer has to prove it knows the
   * secret before it can name a resource; without a secret, nothing listens.
   * @param {import('http').Server} httpServer
   * @param {string} id the machine id sent to the peers
   * @param {function(Error|null, import('stream').Duplex, string, string): void} cb called with a peer that got through: (null, stream, resource name, peer id)
   * @param {{secret: string}} options
   * @returns {{close: function(): Promise<void>}}
   */
  Server (httpServer, id, cb, { secret } = {}) {
    if (!secret) {
      throw new Error('replication.secret is required to listen for replication peers')
    }
    const wss = new WebSocket.WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
    const removeRoute = addUpgradeRoute(httpServer, {
      match: (pathname) => pathname.endsWith(PATH_END),
      handle: (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    })
    wss.on('connection', (ws) => {
      // a peer that resets the connection must not take the process down
      ws.on('error', () => ws.terminate())
      dropWhenIdle(ws, IDLE_TIMEOUT)
      const stream = WebSocket.createWebSocketStream(ws)
      stream.on('error', () => stream.destroy())
      authenticateClient(stream, secret, (ok) => {
        if (!ok) {
          return stream.destroy()
        }
        writeFrame(stream, id)
        readName(stream, (name, peerId) => cb(null, stream, name, peerId))
      })
    })
    return {
      /**
       * Stops listening and drops the peers that are still connected.
       * @returns {Promise<void>}
       */
      close: () => new Promise(resolve => {
        removeRoute()
        wss.clients.forEach(ws => ws.terminate())
        wss.close(() => resolve())
      })
    }
  },
  /**
   * Connects to a peer and runs the handshake, then calls back with the stream to replicate over.
   * @param {string} url the websocket address of the peer (replicationUrl)
   * @param {string} name the resource
   * @param {string} id the machine id
   * @param {function(Error|null, import('stream').Duplex=, string=): void} cb
   * @param {{secret: string}} options
   */
  Client (url, name, id, cb, { secret } = {}) {
    let finished = false
    const finish = (error, ...args) => {
      if (!finished) {
        finished = true
        cb(error, ...args)
      }
    }
    if (!secret) {
      return finish(new Error('replication.secret is required to replicate with a peer'))
    }
    const ws = new WebSocket(url, { maxPayload: MAX_PAYLOAD, handshakeTimeout: IDLE_TIMEOUT })
    const stopWatching = dropWhenIdle(ws, IDLE_TIMEOUT)
    ws.on('unexpected-response', (req, res) => {
      finish(new Error(`The replication peer answered ${res.statusCode} at ${url}: is replication.secret set there?`))
      req.destroy()
    })
    ws.on('error', (error) => finish(error))
    ws.on('close', () => finish(new Error('The replication peer closed the connection during the handshake')))
    ws.on('open', () => {
      const stream = WebSocket.createWebSocketStream(ws)
      stream.on('error', (error) => finish(error))
      authenticateServer(stream, secret, (ok) => {
        if (!ok) {
          finish(new Error('The replication peer did not prove that it knows replication.secret'))
          return stream.destroy()
        }
        writeFrame(stream, `${id}${name}`)
        readName(stream, (_name, peerId) => {
          // the handshake is over: how long the exchange may wait is the business of whoever uses the stream now
          stopWatching()
          finish(null, stream, peerId)
        })
      })
    })
  }
}
