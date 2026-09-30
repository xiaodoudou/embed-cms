const _ = require('lodash')
const sanitizeQuery = require('../../../util/sanitizeQuery')

exports = module.exports = (req, res, next) => {
  req.options = req.options || {}
  if (_.get(req, 'query.query', false)) {
    try {
      req.options.query = sanitizeQuery(JSON.parse(req.query.query), { safeRegex: _.get(req, 'resource.cms.security.safeRegex', false) })
      delete req.query.query
    } catch (err) {
      return next(err)
    }
  }
  _.extend(req.options, req.query)
  return next()
}
