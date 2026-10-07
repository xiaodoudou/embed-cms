// The files of the pages, served by the site itself. Nothing here goes through /api: the site asks the CMS for a file in its own process (`findAttachment`), asks the catalogue whether the
// visitor may read the page it belongs to, and streams it. A file is public or private because of its page and its product, and of the route that sends it, not because of a setting of the CMS.
const { pipeline } = require('stream')
const _ = require('lodash')
const catalog = require('./catalog')

/** The widths a diagram is served at. Only these: a visitor cannot ask for a thousand sizes and fill the disk with resized copies. */
const WIDTHS = [480, 800, 1200]

/**
 * @param {string} name the name the file was uploaded with
 * @returns {string} a Content-Disposition parameter: a plain name for old clients, and the real one (any letters) for the others
 */
function dispositionName (name) {
  const plain = name.replace(/[^\w. -]/g, '_')
  return `filename="${plain}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

/**
 * @param {object} cms
 * @returns {{diagram: function, download: function}} Express handlers for `/…/:product/:version/:page`; they read `req.member`, which the site sets (or not) before them
 */
module.exports = function createMedia (cms) {
  const reads = catalog(cms)
  const pages = () => cms.api()('pages')

  /**
   * @param {object} req
   * @param {string} field `diagram` or `download`
   * @returns {Promise<{page: object, product: object, file: object}|null>} the file of a page that is published, in a version and a product that are, and that this visitor may read; null for
   *   anything else, so that a draft, a missing file and a page for members seen signed out are the same answer
   */
  async function locate (req, field) {
    const { product, version, page } = await reads.resolve(req.params)
    const file = page && catalog.canRead(req.member, product, page) && _.find(page._attachments, { _name: field })
    return file ? { product, version, page, file } : null
  }

  /** Streams an attachment. An error on the way ends the answer: the status is already sent, so there is nothing else to say. */
  function send (res, attachment, file, disposition) {
    const filename = _.get(file, '_fields._filename') || file._name
    res.set({ 'Content-Type': attachment._contentType, 'Content-Disposition': `${disposition}; ${dispositionName(filename)}` })
    pipeline(attachment.stream, res, () => {})
  }

  /** What may keep a copy: the file of a public page of a public product, a shared cache too; anything for members, nobody's but the browser's of that member. */
  const keep = ({ product, page }, seconds) => (product.membersOnly || page.membersOnly ? 'private, no-store' : `public, max-age=${seconds}`)

  return {
    /** `/figures/:product/:version/:page?w=800`: the diagram of a page, resized to one of WIDTHS */
    diagram: async (req, res, next) => {
      try {
        const width = req.query.w === undefined ? 800 : Number(req.query.w)
        if (!WIDTHS.includes(width)) {
          return res.status(400).type('text').send(`w is one of ${WIDTHS.join(', ')}`)
        }
        const found = await locate(req, 'diagram')
        if (!found) {
          return next()
        }
        // the file has a new id when it is replaced, so the tag changes with it: a browser that has the picture is told 304 without the file being opened
        res.set({ ETag: `"${found.file._id}-${width}"`, 'Cache-Control': keep(found, 86400) })
        if (req.fresh) {
          return res.sendStatus(304)
        }
        const attachment = await pages().findAttachment(found.page._id, found.file._id, { resize: `${width}xauto` })
        return send(res, attachment, found.file, 'inline')
      } catch (error) {
        return next(error)
      }
    },
    /** `/pdf/:product/:version/:page`: the PDF version of a page */
    download: async (req, res, next) => {
      try {
        const found = await locate(req, 'download')
        if (!found) {
          return next()
        }
        res.set('Cache-Control', keep(found, 3600))
        const attachment = await pages().findAttachment(found.page._id, found.file._id)
        return send(res, attachment, found.file, 'attachment')
      } catch (error) {
        return next(error)
      }
    }
  }
}

module.exports.WIDTHS = WIDTHS
module.exports.dispositionName = dispositionName
