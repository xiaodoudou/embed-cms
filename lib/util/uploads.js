const fs = require('fs')
const os = require('os')
const path = require('path')
const _ = require('lodash')
const multer = require('multer')

// uploads are kept apart from the rest of the temp folder, readable by the owner only
const UPLOAD_DIR = path.join(os.tmpdir(), 'embed-cms', 'uploads')
const UNITS = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }

/**
 * @param {number|string} value - bytes, or a string such as '10mb'
 * @returns {number|undefined} bytes
 */
function parseSize (value) {
  if (_.isNumber(value)) {
    return value
  }
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(String(value || ''))
  return match ? Math.floor(Number(match[1]) * UNITS[(match[2] || 'b').toLowerCase()]) : undefined
}

/**
 * multer with the limits of the security settings.
 * @param {{limits: {upload: object}}} security - resolved security settings
 * @returns {import('multer').Multer}
 */
function createUpload (security) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 })
  const configured = _.get(security, 'limits.upload', {})
  const limits = _.omitBy({
    fileSize: parseSize(configured.fileSize),
    files: configured.files,
    fields: configured.fields,
    fieldSize: parseSize(configured.fieldSize),
    parts: configured.parts
  }, _.isUndefined)
  return multer({ dest: UPLOAD_DIR, limits })
}

/**
 * Middleware that deletes the files multer stored for the request once the response is over (or the connection
 * dropped), whatever the outcome. Put it before the multer middleware.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {function} next
 */
function cleanupUploads (req, res, next) {
  res.on('close', () => {
    const files = _.compact(_.flatten([req.file, _.isArray(req.files) ? req.files : _.flatten(_.values(req.files))]))
    files.forEach(file => fs.unlink(file.path, () => {}))
  })
  next()
}

/**
 * The last path segment of a client supplied name, without control characters, at most 255 characters long with the
 * extension kept.
 * @param {*} name
 * @returns {string}
 */
function sanitizeFilename (name) {
  const base = String(name === undefined || name === null ? '' : name).replace(/\\/g, '/').split('/').pop()
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!clean || clean === '.' || clean === '..') {
    return 'file'
  }
  if (clean.length <= 255) {
    return clean
  }
  const extension = path.extname(clean).slice(0, 32)
  return clean.slice(0, 255 - extension.length) + extension
}

/**
 * First bytes of a file, enough for type detection.
 * @param {string} file
 * @param {number} [length]
 * @returns {Promise<Buffer>}
 */
async function readHead (file, length = 4100) {
  const handle = await fs.promises.open(file, 'r')
  try {
    const { bytesRead, buffer } = await handle.read(Buffer.alloc(length), 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

module.exports = { createUpload, cleanupUploads, sanitizeFilename, readHead }
