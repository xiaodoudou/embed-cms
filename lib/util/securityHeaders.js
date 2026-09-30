// The admin app is a built single page application: scripts and fonts come from its own origin, Vuetify writes
// inline styles at runtime, images may be data: or blob: urls (previews), the record update socket is ws(s).
const DEFAULT_CSP = [
  'default-src \'self\'',
  'script-src \'self\'',
  'style-src \'self\' \'unsafe-inline\'',
  'img-src \'self\' data: blob:',
  'font-src \'self\' data:',
  'media-src \'self\' blob:',
  'connect-src \'self\' ws: wss:',
  'object-src \'none\'',
  'base-uri \'self\'',
  'form-action \'self\'',
  'frame-ancestors \'self\''
].join('; ')

/**
 * Middleware that sets the protective response headers.
 * `Strict-Transport-Security` is only sent over https (behind a proxy, set the `trustProxy` option so req.secure
 * is right). X-Powered-By is removed even where a mounted application adds it later.
 * @param {{contentSecurityPolicy?: string|false}} settings - `contentSecurityPolicy`: a policy, or false for none
 * @returns {function(import('express').Request, import('express').Response, function): void}
 */
function securityHeaders (settings = {}) {
  const csp = settings.contentSecurityPolicy === undefined ? DEFAULT_CSP : settings.contentSecurityPolicy
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
