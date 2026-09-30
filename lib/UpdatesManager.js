const http = require('http')
const _ = require('lodash')
const WebSocket = require('ws')
const ExpressManager = require('./ExpressManager')
const logger = require('./logger')
const { isTrustedRequest } = require('./util/csrf')

/**
 * @param {string} header - the Cookie header
 * @returns {Object<string, string>}
 */
const parseCookies = (header = '') => {
  const cookies = {}
  header.split(';').forEach((part) => {
    const index = part.indexOf('=')
    if (index > 0) {
      try {
        cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
      } catch {
        // a cookie that is not encoded properly cannot be ours
      }
    }
  })
  return cookies
}

class UpdatesManager extends ExpressManager {
  constructor() {
    super()
    this.pingIntervalDuration = 30000
  }
  init = (cms, options) => {
    if (!options.wsRecordUpdates) {
      return logger.info('wsRecordUpdates is not enabled in configuration, will not send websocket messages on record updates')
    }
    if (!cms.server) {
      return logger.warn('No server for WS')
    }
    // logger.warn('Will init WebSocketServer for record updates')
    this.cms = cms
    const security = cms.security || {}
    // one manager serves every CMS of the process: what depends on the CMS is passed along, not read from `this`
    // (a setting that is undefined must not reach the library, it would replace its default limit)
    cms.wss = new WebSocket.WebSocketServer(_.omitBy({
      server: cms.server,
      maxPayload: security.wsMaxPayload,
      verifyClient: security.wsAuth ? (info, callback) => this.verifyClient(cms, info, callback) : undefined
    }, _.isUndefined))
    cms.wss.on('connection', (ws) => this.onConnection(ws, cms))
  }

  /**
   * Whether the upgrade request comes from a logged in user, in the way the rest of the CMS knows the user: the
   * session cookie (or the JWT) in the JWT login mode, the Authorization header in the Basic mode.
   * @param {object} cms
   * @param {import('http').IncomingMessage} req
   * @returns {Promise<boolean>}
   */
  isLoggedIn = async (cms, req) => {
    const authentication = cms.$authentication
    const options = cms.options
    if (options.disableJwtLogin && options.disableAuthentication) {
      // nobody can log in: there is nothing to check
      return true
    }
    if (!options.disableJwtLogin) {
      req.cookies = parseCookies(req.headers.cookie)
      if (cms._sessionMiddleware) {
        await new Promise((resolve, reject) => cms._sessionMiddleware(req, new http.ServerResponse(req), error => error ? reject(error) : resolve()))
      }
      return !_.isEmpty(await authentication.getUserFromToken(req))
    }
    const match = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '')
    if (!match) {
      return false
    }
    const decoded = Buffer.from(match[1], 'base64').toString()
    const separator = decoded.indexOf(':')
    if (separator < 0) {
      return false
    }
    const { error } = await authentication.authenticate(decoded.slice(0, separator), decoded.slice(separator + 1), req)
    return !error
  }

  verifyClient = async (cms, info, callback) => {
    try {
      if (!isTrustedRequest(info.req, cms.security.allowedOrigins)) {
        return callback(false, 403, 'Forbidden')
      }
      if (!(await this.isLoggedIn(cms, info.req))) {
        return callback(false, 401, 'Unauthorized')
      }
      callback(true)
    } catch (error) {
      logger.error('WebSocket::verifyClient: Error:', error.message)
      callback(false, 401, 'Unauthorized')
    }
  }

  heartbeat = (ws) => {
    if (ws.isAlive === false) {
      logger.info('WebSocket::onPing: Killed a Zombie WebSocket')
      return ws.terminate()
    }
    this.ping(ws)
  }
  onConnection = (ws, cms) => {
    logger.info('WebSocket::onConnection: Client connected')
    ws.isAlive = true
    // a frame above maxPayload, a bad frame or a reset is reported as an error of the socket: unhandled, it would end the process
    ws.on('error', (error) => logger.debug('WebSocket::onError:', error.message))
    const heartbeatInterval = setInterval(() => this.heartbeat(ws), this.pingIntervalDuration)
    ws.on('close', () => {
      logger.info('WebSocket::onClose: Client disconnected')
      clearInterval(heartbeatInterval)
    })
    ws.on('message', (buffer) => {
      try {
        const data = JSON.parse(buffer)
        if (_.get(data, 'action', '???') === 'pong') {
          ws.isAlive = true
          return
        }
        if (_.get(cms, 'security.wsAuth', false)) {
          // what a client sends is not a log line
          logger.debug('Received WS message with action', JSON.stringify(_.get(data, 'action')))
        } else {
          logger.info('Received WS message: ', data)
        }
      } catch (error) {
        logger.error('WebSocket::onMessage: Error:', error)
      }
    })
    this.ping(ws)
  }
  ping = (ws) => {
    ws.isAlive = false
    this.send(ws, { action: 'ping' })
  }
  send = (ws, data) => {
    try {
      ws.send(JSON.stringify(data))
    } catch (error) {
      logger.error('WebSocket::send: Error:', error)
    }
  }
  broadcast = (data, cms = this.cms) => {
    const clients = _.get(cms, 'wss.clients', false)
    if (!clients) {
      return
    }
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, data)
      }
    })
  }
}
exports = module.exports = new UpdatesManager()
