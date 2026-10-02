const _ = require('lodash')
const basicAuth = require('basic-auth-connect')
const logger = require('../../../logger')

/*
 * List permitted HTTP verbs
 */
const methods = {
  POST: 'create',
  GET: 'read',
  HEAD: 'read',
  PUT: 'update',
  DELETE: 'remove'
}

/*
 * Respond with 401 Unauthorized
 */
const unauthorized = function (res) {
  res.statusCode = 401
  res.setHeader('WWW-Authenticate', 'Basic realm="Authorization Required"')
  res.end('Unauthorized')
}

/*
 * Authenticate and authorize a request against resource
 */
const authorize = function (self) {
  // with strict sessions the user of a call is kept on the request only: an anonymous or Basic authenticated call
  // neither creates a session nor replaces the user of the session cookie it may carry
  const strictSessions = !!_.get(self, 'cms.security.strictSessions', false)
  const remember = (req, user) => {
    req.cmsUser = user
    if (!strictSessions) {
      _.set(req, 'session.embedCmsUser', user)
    }
  }
  return [async function (req, res, next) {
    const jwtToken = req.body.token || req.query.token || req.headers['x-access-token'] || _.get(req, ['cookies', self.cms.cookieNames.jwt], false)
    if (!jwtToken && req.headers.authorization) {
      return basicAuth(async (username, password, callback) => {
        const {error, result} = await self.cms.$authentication.authenticate(username, password, req)
        if (error) {
          if (error.retryAfter) {
            res.set('Retry-After', String(error.retryAfter))
          }
          return res.status(error.code).send(error)
        }
        remember(req, result)
        callback(error, result)
      })(req, res, next)
    }
    if (!jwtToken) { // anonymous user
      remember(req, {})
    } else if (await self.cms.$authentication.verifyToken(req, res) === 'userLoggedOut' || res.headersSent) {
      // verifyToken already answered (401/403): do not continue the chain
      return
    } else {
      req.cmsUser = _.get(req, 'session.embedCmsUser', false) || undefined
    }
    next()
  },
  function (req, res, next) {
    try {
      const user = req.cmsUser || _.get(req, 'session.embedCmsUser', false)
      self.cms.$authentication.authorize(user, req.resource, methods[req.method], req.originalUrl.indexOf('/attachments') !== -1, async (error) => {
        if (error) {
          // a refused permission is an answer (401), not a fault
          logger.warn('Request refused (not authorized):', error && error.message ? error.message : error)
          return unauthorized(res)
        }
        let userGroup = _.get(user, 'group', false)
        try {
          userGroup = _.get(await self.cms.$authentication.groups.find({_id: userGroup}), 'name', userGroup)
        } catch (error){
          logger.error('Error:', error)
        }
        // a request without a login is the anonymous visitor (it used to be written "anonymous~false" and shown as "Updated by false")
        const stamp = `${userGroup || 'anonymous'}~${_.get(user, 'username') || 'anonymous'}`
        _.set(req, 'body._updatedBy', stamp)
        // who created a record is written once, on its creation, and never taken from the request: a client cannot choose it
        // or change it later (a file upload is not a record)
        if (req.originalUrl.indexOf('/attachments') === -1) {
          if (req.method === 'POST') {
            _.set(req, 'body._createdBy', stamp)
          } else {
            _.unset(req, 'body._createdBy')
          }
        }
        req.query.user = user || false
        next()
      })
    } catch (error) {
      logger.error('authorize Error: ', error, error.stack)
    }
  }]
}

exports = module.exports = authorize
