const _ = require('lodash')
const logger = require('../../logger')

const GENERIC = { code: 500, message: 'Internal Server Error' }
// errors of multer (uploads) carry a string code
const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: 413,
  LIMIT_FILE_COUNT: 413,
  LIMIT_FIELD_COUNT: 413,
  LIMIT_FIELD_KEY: 413,
  LIMIT_FIELD_VALUE: 413,
  LIMIT_PART_COUNT: 413,
  LIMIT_UNEXPECTED_FILE: 400
}

/**
 * The http status an error should be answered with: its `code` (or `status`) when that is a real
 * error status, 500 otherwise. Database and system errors carry codes such as 11000 or 'ENOENT',
 * which must never reach res.status() (it throws for anything outside 100-599).
 * @param {*} error
 * @returns {number}
 */
const statusFor = (error) => {
  if (_.has(UPLOAD_ERRORS, _.get(error, 'code'))) {
    return UPLOAD_ERRORS[error.code]
  }
  for (const key of ['code', 'status', 'statusCode']) {
    const value = _.get(error, key)
    if (_.isInteger(value) && value >= 400 && value <= 599) {
      return value
    }
  }
  return 500
}

/**
 * Answers a failed request with json.
 * Errors the CMS raises itself ({ code, message } objects) keep their status and message. Anything else,
 * such as an Error thrown by a driver or a library, is logged and answered with a generic 500 so internal
 * details (paths, connection strings, stack traces) never reach the client.
 * @param {import('express').Response} res
 * @param {*} error
 */
const sendError = (res, error) => {
  if (res.headersSent) {
    return res.end()
  }
  const status = statusFor(error)
  if (_.isPlainObject(error)) {
    return res.status(status).json({ code: status, message: _.get(error, 'message', GENERIC.message) })
  }
  logger.error(error)
  if (status === 500) {
    return res.status(500).json(GENERIC)
  }
  return res.status(status).json({ code: status, message: _.get(error, 'message', GENERIC.message) })
}

/**
 * Express error middleware answering with the same json bodies as sendError: the message of a client error (4xx) is
 * kept, anything else is logged and answered generically, so no stack trace or path leaves the server.
 * @param {*} error
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {function} next
 */
const errorMiddleware = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error)
  }
  const status = statusFor(error)
  if (status >= 500) {
    logger.error(error)
    return res.status(status).json({ code: status, message: GENERIC.message })
  }
  return res.status(status).json({ code: status, message: _.get(error, 'message', 'Bad Request') })
}

module.exports = sendError
module.exports.statusFor = statusFor
module.exports.middleware = errorMiddleware
