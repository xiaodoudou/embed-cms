/**
 * Sets the cross origin headers of an event stream.
 * '*' is the historic answer for every origin. A list answers only the origins on it (with credentials, which a
 * wildcard cannot carry); an empty list sends no header, so only pages of the same origin can read the stream.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string|string[]} allowed - '*' or a list of origins
 */
function applySseCors (req, res, allowed) {
  if (allowed === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    return
  }
  res.setHeader('Vary', 'Origin')
  const origin = req.headers.origin
  if (origin && Array.isArray(allowed) && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
}

module.exports = applySseCors
