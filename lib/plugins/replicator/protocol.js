

const cap = require('./cap')
const net = require('net')
const crypto = require('crypto')
const dh = require('./diffieHellman')
const safeEqual = require('../../util/safeEqual')

// first character of the frames of the authentication step, so a peer that does not know it can be told apart
const AUTH_MARK = '\u0001'
const NONCE_LENGTH = 64 // hex characters of 32 random bytes
const PROOF_LENGTH = 64 // hex characters of an HMAC-SHA256

const proof = (secret, role, serverNonce, clientNonce) => {
  return crypto.createHmac('sha256', secret).update(`${role}|${serverNonce}|${clientNonce}`).digest('hex')
}

/*
 * Reads one frame: a length byte, then that many characters
 */

const readFrame = function (socket, cb) {
  cap(socket, 1, (buf) => {
    cap(socket, buf.readUInt8(0), frame => cb(frame.toString()))
  })
}

/*
 * Parse protocol headers
 */

const read = function (socket, cb) {
  readFrame(socket, tempName => {
    const id = tempName.substring(0, 8)
    const name = tempName.substring(8)
    cb(name, id)
  })
}

/*
 * Write a frame
 */

const writeFrame = function (socket, text) {
  const length = Buffer.alloc(1)
  length.writeUInt8(text.length, 0)
  socket.write(length)
  socket.write(text)
}

/*
 * Write client protocol headers
 */

const write = function (socket, name, id) {
  writeFrame(socket, `${id}${name}`)
}

/*
 * Server side of the authentication: prove that the client knows the shared secret, and that we do.
 * The client answers the nonce of the server with its own nonce and an HMAC over both; the server answers with an
 * HMAC over both nonces under another role, so neither side can replay what the other sent.
 */

const authenticateClient = function (socket, secret, cb) {
  const serverNonce = crypto.randomBytes(NONCE_LENGTH / 2).toString('hex')
  writeFrame(socket, AUTH_MARK + serverNonce)
  readFrame(socket, frame => {
    const clientNonce = frame.slice(1, 1 + NONCE_LENGTH)
    const received = frame.slice(1 + NONCE_LENGTH)
    const valid = frame.startsWith(AUTH_MARK) && clientNonce.length === NONCE_LENGTH && received.length === PROOF_LENGTH &&
      safeEqual(received, proof(secret, 'client', serverNonce, clientNonce))
    if (!valid) {
      return cb(false)
    }
    writeFrame(socket, proof(secret, 'server', serverNonce, clientNonce))
    cb(true)
  })
}

const authenticateServer = function (socket, secret, cb) {
  readFrame(socket, frame => {
    const serverNonce = frame.slice(1)
    if (!frame.startsWith(AUTH_MARK) || serverNonce.length !== NONCE_LENGTH) {
      // the server did not send a challenge: it does not check secrets, so it cannot be told from an impostor
      return cb(false)
    }
    const clientNonce = crypto.randomBytes(NONCE_LENGTH / 2).toString('hex')
    writeFrame(socket, AUTH_MARK + clientNonce + proof(secret, 'client', serverNonce, clientNonce))
    readFrame(socket, answer => cb(answer.length === PROOF_LENGTH && safeEqual(answer, proof(secret, 'server', serverNonce, clientNonce))))
  })
}

/*
 * Server socket & client socket
 */

module.exports = {
  /**
   * @param {number} port
   * @param {string} id - machine id sent to the peers
   * @param {function(Error|null, net.Socket, string, string)} cb - called with a peer that got through: (null, socket, resource name, peer id)
   * @param {object} [options]
   * @param {string} [options.secret] - shared secret; peers that cannot prove they know it are dropped before they name a resource
   * @returns {net.Server}
   */
  Server (port, id, cb, options = {}) {
    const { secret } = options
    const sockets = new Set()
    const server = net.createServer({ allowHalfOpen: true }, socket => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      socket.setTimeout(30000, () => {
        socket.destroy()
      })
      // a peer that resets the connection must not take the process down
      socket.on('error', () => socket.destroy())
      const named = () => {
        write(socket, '', id)
        read(socket, (name, id) => {
          cb(null, socket, name, id)
        })
      }
      dh(socket, () => {
        if (!secret) {
          return named()
        }
        authenticateClient(socket, secret, (ok) => ok ? named() : socket.destroy())
      })
    }).listen(port)
    /**
     * Stops listening and drops the connections that are still open (the sockets are half open on purpose, so they
     * do not end by themselves when a peer goes away).
     * @returns {Promise<void>}
     */
    server.closeAll = () => new Promise(resolve => {
      sockets.forEach(socket => socket.destroy())
      server.close(() => resolve())
    })
    return server
  },
  Client (host, port, name, id, cb, options = {}) {
    const { secret } = options
    const socket = net.connect(port, host)
    // a peer that stops answering must not keep the replication waiting for ever
    socket.setTimeout(30000, () => socket.destroy())
    let socketError = false
    let finished = false
    const finish = (error, ...args) => {
      if (!finished) {
        finished = true
        cb(error, ...args)
      }
    }

    function onError (err) {
      socketError = true
      finish(err)
    }

    function onClose (hasErrors) {
      if (socketError || hasErrors) {
        return finish('has errors')
      }
      // closed before the handshake was over: the peer refused us (or does not speak this protocol)
      finish(new Error('The replication peer closed the connection during the handshake'))
    }

    const named = () => {
      write(socket, name, id)
      read(socket, (name, id) => {
        socket.removeListener('error', onError)
        socket.removeListener('close', onClose)
        // the handshake is over: the timeout is the business of whoever uses the socket now
        socket.setTimeout(0)
        finished = true
        cb(null, socket, id)
      })
    }

    socket.on('connect', () => {
      dh.client(socket, () => {
        if (!secret) {
          return named()
        }
        authenticateServer(socket, secret, (ok) => {
          if (!ok) {
            finish(new Error('The replication peer did not prove that it knows replication.secret'))
            return socket.destroy()
          }
          named()
        })
      })
    })

    socket.on('error', onError)
    socket.on('close', onClose)
  }
}
