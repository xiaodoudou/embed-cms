// The names of the two cookies the CMS sets: the JWT of the login page and the session. Browsers share cookies between the
// ports of one host, so two CMS running on localhost used to overwrite and clear each other's login. Each server now names its
// cookies after its `mid` (8 characters, different on every server by contract), and a name written in `session.name` wins.

const clean = (value) => String(value || '').replace(/[^A-Za-z0-9]/g, '')

/**
 * @param {object} options - the CMS options (mid, session.name)
 * @returns {{jwt: string, session: string}}
 */
function cookieNames (options = {}) {
  const suffix = clean(options.mid)
  const configured = options.session && options.session.name
  return {
    jwt: suffix ? `embedCmsJwt-${suffix}` : 'embedCmsJwt',
    session: configured || (suffix ? `embedCmsSid-${suffix}` : 'connect.sid')
  }
}

module.exports = cookieNames
