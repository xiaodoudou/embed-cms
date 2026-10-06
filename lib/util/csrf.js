/**
 * @param {string} value
 * @returns {string} escaped for a regular expression
 */
const quote = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// the Cookie header carries one of the cookies of the CMS: its session or its login token
const cookiesOf = (names) => new RegExp(`(?:^|;\\s*)(?:${[names.session, names.jwt].map(quote).join('|')})=`)
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
// routes that change state although they answer GET. Express matches a route whatever the case of its letters (/Admin/changeTheme is the same route), so these do too:
// a pattern that is not case insensitive is a guard that a capital letter walks around.
// (the logout is one: it ends the session and revokes the token, so a foreign page must not be able to send it)
const STATE_CHANGING_GETS = [/^\/admin\/changeTheme(\/|$)/i, /^\/admin\/logout\/?$/i, /^\/importFromRemote\/execute\/?$/i, /^\/import\/execute\/?$/i]

/**
 * @param {string} value an address
 * @returns {string|undefined} its host; nothing for an invalid URL
 */
const hostOf = (value) => {
  try {
    return new URL(value).host
  } catch {
    return undefined
  }
}

/**
 * Decides whether the browser request comes from the site that serves the CMS (or from a listed origin).
 * The Origin header is the strongest signal, then Referer, then Fetch Metadata. A request that carries none of
 * them does not come from a browser page and is accepted.
 * @param {import('express').Request} req
 * @param {string[]} allowedOrigins
 * @returns {boolean}
 */
function isTrustedRequest (req, allowedOrigins) {
  const hosts = [req.headers.host]
  if (req.app && req.app.get('trust proxy') && req.headers['x-forwarded-host']) {
    hosts.push(String(req.headers['x-forwarded-host']).split(',')[0].trim())
  }
  const allowed = (origin) => hosts.includes(hostOf(origin)) || allowedOrigins.some(item => item === origin || hostOf(item) === hostOf(origin))
  const origin = req.headers.origin
  if (origin) {
    return origin !== 'null' && allowed(origin)
  }
  if (req.headers.referer) {
    return allowed(req.headers.referer)
  }
  const site = req.headers['sec-fetch-site']
  return !site || site === 'same-origin' || site === 'none'
}

/**
 * Middleware rejecting cross site requests that ride on the CMS cookies.
 * Only requests that carry one of the cookies are checked: requests authenticated by an explicit header (Basic,
 * x-access-token) are not ambient, so a foreign page cannot make the browser send them.
 * @param {{csrf: string, allowedOrigins: string[]}} security - resolved security settings
 * @returns {function|null} null when the check is off
 */
function csrfGuard (security, names = { session: 'connect.sid', jwt: 'embedCmsJwt' }) {
  if (security.csrf !== 'origin') {
    return null
  }
  const COOKIES = cookiesOf(names)
  return (req, res, next) => {
    const guarded = !SAFE_METHODS.has(req.method) || STATE_CHANGING_GETS.some(pattern => pattern.test(req.path))
    if (!guarded || !COOKIES.test(req.headers.cookie || '') || isTrustedRequest(req, security.allowedOrigins)) {
      return next()
    }
    return res.status(403).json({ code: 403, message: 'Cross-site request rejected' })
  }
}

module.exports = csrfGuard
module.exports.isTrustedRequest = isTrustedRequest
