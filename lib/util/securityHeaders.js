const { cspSources } = require('./maps')

// The admin app is a built single page application: scripts and fonts come from its own origin, Vuetify writes
// inline styles at runtime, images may be data: or blob: urls (previews), the record update socket is ws(s).
const SELF = '\'self\''
const DEFAULT_DIRECTIVES = {
  'default-src': [SELF],
  'script-src': [SELF],
  'style-src': [SELF, '\'unsafe-inline\''],
  'img-src': [SELF, 'data:', 'blob:'],
  'font-src': [SELF, 'data:'],
  'media-src': [SELF, 'blob:'],
  'connect-src': [SELF, 'ws:', 'wss:'],
  'object-src': ['\'none\''],
  'base-uri': [SELF],
  'form-action': [SELF],
  'frame-ancestors': [SELF]
}

/**
 * @param {Object<string, string[]>} [extra] more addresses for some directives (the ones of the map, see util/maps.js), added after the default ones
 * @returns {string} the policy: the default one, which with nothing extra is the same text as always
 */
function buildPolicy (extra = {}) {
  const directives = { ...DEFAULT_DIRECTIVES }
  Object.keys(extra).forEach((name) => {
    directives[name] = [...new Set([...(directives[name] || []), ...extra[name]])]
  })
  return Object.keys(directives).map(name => `${name} ${directives[name].join(' ')}`).join('; ')
}

const DEFAULT_CSP = buildPolicy()

/**
 * Middleware that sets the protective response headers.
 * `Strict-Transport-Security` is only sent over https (behind a proxy, set the `trustProxy` option so req.secure
 * is right). X-Powered-By is removed even where a mounted application adds it later.
 * @param {{contentSecurityPolicy?: string|false, maps?: object}} settings - `contentSecurityPolicy`: a policy, or false for none; `maps`: what util/maps.js made of the maps option,
 *   whose tile server and search the default policy lets through (a policy that is given is used as it is)
 * @returns {function(import('express').Request, import('express').Response, function): void}
 */
function securityHeaders (settings = {}) {
  const csp = settings.contentSecurityPolicy === undefined ? buildPolicy(cspSources(settings.maps)) : settings.contentSecurityPolicy
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('X-DNS-Prefetch-Control', 'off')
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
    res.setHeader('X-Download-Options', 'noopen')
    if (csp) {
      res.setHeader('Content-Security-Policy', csp)
    }
    if (req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    }
    const writeHead = res.writeHead
    res.writeHead = function (...args) {
      this.removeHeader('X-Powered-By')
      return writeHead.apply(this, args)
    }
    next()
  }
}

module.exports = securityHeaders
module.exports.buildPolicy = buildPolicy
module.exports.DEFAULT_CSP = DEFAULT_CSP
