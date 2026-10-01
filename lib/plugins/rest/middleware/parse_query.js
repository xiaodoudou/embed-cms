const _ = require('lodash')
const sanitizeQuery = require('../../../util/sanitizeQuery')
const sendError = require('../sendError')

exports = module.exports = (req, res, next) => {
  req.options = req.options || {}
  if (_.get(req, 'query.query', false)) {
    let query
    try {
      query = JSON.parse(req.query.query)
    } catch {
      return sendError(res, { code: 400, message: 'query must be valid json' })
    }
    try {
      req.options.query = sanitizeQuery(query, { safeRegex: _.get(req, 'resource.cms.security.safeRegex', false) })
      delete req.query.query
    } catch (err) {
      // a query the CMS refuses is the client's fault: answered here, as json, whatever the security profile
      if (sendError.isClientError(err)) {
        return sendError(res, { code: sendError.statusFor(err), message: err.message })
      }
      return next(err)
    }
  }
  _.extend(req.options, req.query)
  return next()
}
