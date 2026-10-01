/**
 * Replaces the session by a new, empty one (new id, same store), so an id that was known before login is worthless.
 * Does nothing when there is no session middleware.
 * @param {import('express').Request} req
 * @returns {Promise<void>}
 */
const regenerate = (req) => new Promise((resolve, reject) => {
  if (!req.session || typeof req.session.regenerate !== 'function') {
    return resolve()
  }
  req.session.regenerate(error => error ? reject(error) : resolve())
})

/**
 * Destroys the session in its store. Does nothing when there is no session middleware.
 * @param {import('express').Request} req
 * @returns {Promise<void>}
 */
const destroy = (req) => new Promise((resolve, reject) => {
  if (!req.session || typeof req.session.destroy !== 'function') {
    return resolve()
  }
  req.session.destroy(error => error ? reject(error) : resolve())
})

module.exports = { regenerate, destroy }
