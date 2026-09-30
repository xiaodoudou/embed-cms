const _ = require('lodash')

const CSRF_MODES = ['off', 'origin']
const PASSWORD_SCHEMES = ['legacy', 'scrypt']

/**
 * Whether the process runs in production (NODE_ENV=production).
 * @returns {boolean}
 */
const isProduction = () => process.env.NODE_ENV === 'production'

/**
 * Resolves the `security` block of the configuration into the effective settings.
 *
 * Two profiles exist. `legacy` keeps the behaviour of earlier releases, `hardened` switches on every protection
 * that could change what an existing deployment sees. The profile is `hardened` when NODE_ENV is `production` and
 * `legacy` otherwise, `security.profile` picks one explicitly, and any single setting can still be overridden by
 * its own key (`security.csrf`, `security.localAdmin`, ...).
 * @param {object} [options] - the CMS options
 * @returns {Readonly<object>} effective settings
 * @throws {Error} when a setting has an unsupported value
 */
function resolveSecurity (options = {}) {
  const configured = (options && options.security) || {}
  const profile = ['legacy', 'hardened'].includes(configured.profile) ? configured.profile : (isProduction() ? 'hardened' : 'legacy')
  const hardened = profile === 'hardened'
  const flag = (name, legacy, strong) => configured[name] !== undefined ? configured[name] : (hardened ? strong : legacy)

  const settings = {
    profile,
    hardened,
    // refuse missing, short and published default secrets at boot
    strongSecrets: flag('strongSecrets', false, true),
    // generate strong secrets and keep them in <data>/.secrets.json instead of refusing to boot
    generateSecrets: configured.generateSecrets === true,
    // create the built-in localAdmin account (and accept its published password)
    localAdmin: flag('localAdmin', true, false),
    // scheme for new and rehashed passwords: 'legacy' (PBKDF2-SHA1, 100 rounds) or 'scrypt'
    passwordHash: flag('passwordHash', 'legacy', 'scrypt'),
    // keep password hashes and salts out of the JWT, the login response and find() results
    hideCredentials: flag('hideCredentials', false, true),
    // answer a locked account with 429 and one generic message
    genericLockout: flag('genericLockout', false, true),
    // 'origin': reject cookie authenticated cross site writes
    csrf: flag('csrf', 'off', 'origin'),
    allowedOrigins: Array.isArray(configured.allowedOrigins) ? configured.allowedOrigins : [],
    cookies: {
      httpOnly: hardened,
      sameSite: hardened ? 'lax' : false,
      secure: hardened ? 'auto' : false,
      ...(configured.cookies || {})
    },
    // no session for anonymous and Basic authenticated requests
    strictSessions: flag('strictSessions', false, true),
    // hide secrets from /admin/cms-config and credentials from /admin/config
    redactConfig: flag('redactConfig', false, true),
    // /admin/_groups needs a login, theme names are validated
    strictAdmin: flag('strictAdmin', false, true),
    // protective response headers from lib/util/securityHeaders.js instead of the historic helmet set
    headers: flag('headers', false, true),
    // Content-Security-Policy: a policy string, false for none, undefined for the default policy of the admin app
    contentSecurityPolicy: configured.contentSecurityPolicy,
    // origins that may read the event streams (/api/system, /api/_syslog): '*' or a list, [] for the same origin only
    sseCors: flag('sseCors', '*', []),
    // refuse regular expressions in queries that can backtrack catastrophically
    safeRegex: flag('safeRegex', false, true),
    // answer every failed request with a json body, without stack traces or paths
    uniformErrors: flag('uniformErrors', false, true),
    // send html, svg, xml and script attachments as downloads, ignore attempts to rewrite attachment metadata
    safeAttachments: flag('safeAttachments', false, true),
    inlineTypes: (Array.isArray(configured.inlineTypes) ? configured.inlineTypes : []).map(type => String(type).toLowerCase()),
    // sanitise file names, take the type of an upload from its content, default upload limits
    strictUploads: flag('strictUploads', false, true),
    // importFromRemote only follows urls on the host it imports from (and allowedHosts)
    restrictRemoteUrls: flag('restrictRemoteUrls', false, true),
    // replication: peers must prove they know replication.secret, may only ask for resources this node has, and may only
    // send well formed changes to records of other nodes
    strictReplication: flag('strictReplication', false, true),
    // the record update socket needs a login and a same origin (or listed) page, and is limited in what a client may send
    wsAuth: flag('wsAuth', false, true),
    wsMaxPayload: flag('wsMaxPayload', undefined, 16 * 1024),
    // how long (ms) a password that was verified stays verified in memory, so Basic authentication does not run the hash
    // on every request; 0 turns it off. A password change or a deleted account is noticed at once.
    authCacheTtl: Number.isFinite(configured.authCacheTtl) && configured.authCacheTtl >= 0 ? configured.authCacheTtl : 60000,
    // failed logins tolerated per account and address before the lockout, and its duration in minutes
    blockRetry: options && options.blockRetry !== undefined ? (options.blockRetry || undefined) : (hardened ? { retry: 10, duration: 5 } : undefined)
  }

  const limits = configured.limits || {}
  settings.limits = {
    // 100kb is what every JSON route accepted before this option existed
    json: limits.json || '100kb',
    upload: {
      ...(settings.strictUploads ? { fileSize: '256mb', files: 20, fields: 200, fieldSize: '1mb', parts: 260 } : {}),
      ...(limits.upload || {})
    }
  }
  if (settings.sseCors !== '*' && !_.isArray(settings.sseCors)) {
    throw new Error('security.sseCors must be \'*\' or a list of origins')
  }
  if (!CSRF_MODES.includes(settings.csrf)) {
    throw new Error(`security.csrf must be one of: ${CSRF_MODES.join(', ')}`)
  }
  if (!PASSWORD_SCHEMES.includes(settings.passwordHash)) {
    throw new Error(`security.passwordHash must be one of: ${PASSWORD_SCHEMES.join(', ')}`)
  }
  return Object.freeze(settings)
}

module.exports = { resolveSecurity }
