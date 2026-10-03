const _ = require('lodash')

// types a browser may show on the page: they cannot run script in the origin of the CMS
const INLINE = [/^image\/(?!svg)/i, /^audio\//i, /^video\//i, /^application\/pdf$/i, /^text\/plain$/i]
const SANDBOX = 'default-src \'none\'; sandbox'

/**
 * @param {string} name
 * @returns {string} with only printable ASCII, for the plain `filename` of the header
 */
const ascii = (name) => name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')

/**
 * @param {string} [filename]
 * @returns {string} the Content-Disposition of a download: the name in ASCII, and in UTF-8 (RFC 5987) for the browsers that read it
 */
const contentDisposition = (filename) => {
  const name = filename || 'download'
  return `attachment; filename="${ascii(name)}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

/**
 * Makes a response that carries an uploaded file safe to open in a browser, without changing what an application
 * gets when it downloads the file. Types that cannot run script (images except svg, audio, video, pdf, plain text)
 * stay inline; everything else (html, svg, xml, javascript, unknown) is sent as a download with a sandbox policy, so
 * a file uploaded by a user can never run in the origin of the CMS.
 * @param {import('express').Response} res
 * @param {object} file
 * @param {string|false} [file.contentType] - the stored type; unknown when the route does not know the record
 * @param {string} [file.filename]
 * @param {{safeAttachments: boolean, inlineTypes: string[]}} settings - resolved security settings
 */
function secureAttachmentResponse (res, { contentType, filename } = {}, settings) {
  if (!settings || !settings.safeAttachments) {
    return
  }
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const inline = _.isString(contentType) && (INLINE.some(pattern => pattern.test(contentType)) || settings.inlineTypes.includes(contentType.split(';')[0].trim().toLowerCase()))
  if (!inline) {
    res.setHeader('Content-Disposition', contentDisposition(filename))
    res.setHeader('Content-Security-Policy', SANDBOX)
  }
}

module.exports = { secureAttachmentResponse }
