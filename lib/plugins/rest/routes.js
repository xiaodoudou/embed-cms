/*
 * Dynamic resource routes
 */
const fs = require('fs-extra')
const _ = require('lodash')
const url = require('url')
const h = require('../../helpers')

const ImageOptimization = require('../../util/imageOptimization')
const FileType = require('../../util/fileType')
const { parseRecipe, recipeKey } = require('../../util/cropRecipe')
const { normalizeImageMap } = require('../../util/imageMap')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const pAll = require('p-all')

const logger = require('../../logger')
const sendError = require('./sendError')
const { sanitizeFilename } = require('../../util/uploads')
const { secureAttachmentResponse } = require('../../util/attachmentHeaders')

// what a client may change on an attachment through PUT; the rest (_contentType, _size, _md5sum, _id, ...) is the
// server's record of the file
const UPDATABLE_ATTACHMENT_FIELDS = ['_name', 'cropOptions', 'imageMap', 'order', '_payload', '_fields', '_filename', 'dirty']

// the pictures the crop tool can cut: sharp reads them all and writes these
const CROPPABLE_TYPES = /^image\/(jpeg|png|webp|gif)$/

/**
 * @param {object} query the aspect ratio of a crop (`1.5` or `3:2`) and how the picture is turned first
 * @returns {{aspect: number, rotate: number, flipX: boolean, flipY: boolean}}
 * @throws {{code: 400}} when the aspect ratio is missing or is not a ratio
 */
const cropSuggestionQuery = (query) => {
  const ratio = /^(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?$/.exec(String(_.get(query, 'aspect', '')).trim())
  const aspect = ratio ? Number(ratio[1]) / (ratio[2] === undefined ? 1 : Number(ratio[2])) : NaN
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw { code: 400, message: 'aspect must be a ratio: 1.5 or 3:2' }
  }
  const yes = value => _.includes(['true', '1', true], value)
  return { aspect, rotate: _.toInteger(_.get(query, 'rotate', 0)), flipX: yes(query.flipX), flipY: yes(query.flipY) }
}

/**
 * @param {object} req
 * @returns {object} the security settings of the CMS
 */
const securityOf = (req) => _.get(req, 'resource.cms.security', {})
/**
 * @param {object} req
 * @param {object} body
 * @returns {object} the fields of the body an attachment may take: only the safe ones under `safeAttachments`
 */
const attachmentUpdate = (req, body) => {
  const update = securityOf(req).safeAttachments ? _.pick(body, UPDATABLE_ATTACHMENT_FIELDS) : body
  // an image map is checked, and kept as it is cleaned (null takes it away)
  return _.has(update, 'imageMap') ? { ...update, imageMap: normalizeImageMap(update.imageMap) } : update
}

// The attachment fields of the resource of a request, with the pattern of each compiled (lib/util/fieldPathPattern.js): once
// per request, not once per file of every record of a list
const attachmentFieldsOf = (req) => {
  if (!req._attachmentFields) {
    req._attachmentFields = _.compact(_.map(_.get(req, 'resource.options._attachmentFields', {}), (field, pattern) => {
      try {
        return { field, regex: new RegExp(pattern) }
      } catch (error) {
        logger.error(`The pattern ${pattern} of an attachment field of ${req.params.resource} is not a valid regular expression`, error)
        return null
      }
    }))
  }
  return req._attachmentFields
}

/**
 * Reshapes a record (or each record of a list) for the admin: `_attachments` becomes one list per field, each file with its download URL, flagged `dirty` when it no longer fits its field.
 * @param {object|object[]} obj
 * @param {object} req
 */
const injectAttachmentUrl = (obj, req) => {
  if (!obj) {
    return
  } else if (_.isArray(obj)) {
    _.each(obj, (record) => {
      injectAttachmentUrl(record, req)
    })
    return
  }
  const keys = []
  const attachmentFieldsToMerge = {}
  const attachmentsFields = attachmentFieldsOf(req)
  // Ensure _attachments is always an array
  if (!_.isArray(obj._attachments)) {
    obj._attachments = []
  }
  _.each(obj._attachments, (attachment) => {
    const rootPath = `${attachment._name}`
    // the field the attachment belongs to
    const hasField = _.get(_.find(attachmentsFields, ({ regex }) => regex.test(rootPath)), 'field')
    const matches = req.originalUrl.match(/(.*\/api\/[^/]*)/)
    if (matches) {
      const info = url.parse(matches[1])
      attachment.url = [info.pathname,
        obj._id,
        'attachments',
        attachment._id].join('/')
      if (_.get(attachment, 'cropOptions', false)) {
        attachment.cropUrl = `${attachment.url}/cropped`
      }
    }
    const attachments = _.get(attachmentFieldsToMerge, attachment._name, [])
    attachments.push(_.omit(attachment, ['_name']))
    let hasDirtyAttachments = false
    if (hasField && _.get(hasField, 'localised', false) !== false) {
      if (_.endsWith(attachment._name, hasField.field)) {
        const firstLocale = _.get(req, 'resource.options.locales[0]', 'enUS')
        attachment._name = `${attachment._name}.${firstLocale}`
        hasDirtyAttachments = 'forced-localised'
      }
    } else {
      if (hasField && _.split(attachment._name, '.').length > 1 && !_.endsWith(attachment._name, hasField.field)) {
        attachment._name = _.join(_.split(attachment._name, '.').slice(0, -1), '.')
        hasDirtyAttachments = 'forced-unlocalised'
      }
    }
    if (hasDirtyAttachments) {
      _.each(attachments, attachment => attachment.dirty = hasDirtyAttachments)
    }
    if (hasField) {
      const maxCount = _.get(hasField, 'options.maxCount', 0)
      if (maxCount > 0 && attachments.length > maxCount) {
        let i = 1
        _.each(attachments, attachment => {
          if (i > maxCount) {
            attachment.dirty = 'max-count-overpassed'
          }
          i = i + 1
        })
      }
    }
    _.each(attachments, attachment => attachment._isAttachment = true)
    if (_.get(attachment, '_name.length', 0) > 0) {
      _.set(
        attachmentFieldsToMerge,
        attachment._name,
        _.uniqBy(
          _.concat(
            _.get(attachmentFieldsToMerge, attachment._name, []),
            attachments
          ),
          attachment => attachment._id)
      )
      keys.push(attachment._name)
    } else {
      logger.warn('A weird attachment has been found:', {attachment, attachments})
    }
  })
  delete obj._attachments
  _.each(keys, (key)=> {
    const attachments = _.get(attachmentFieldsToMerge, key, [])
    _.set(obj, key, _.orderBy(attachments, ['order'], ['asc']))
  })
}


/**
 * Answers 404 when the stream fails.
 * @param {object} res
 * @param {import('stream').Readable} stream
 */
const handleStreamError = (res, stream) => {
  stream.on('error', (error) => {
    if (error) {
      logger.error(error)
    }
    res.status(404).end()
  })
}

/**
 * Sends a file: its length and type, then the stream.
 * @param {object} res
 * @param {object} result the attachment, with its `stream`
 * @param {boolean} [modifiedAttachment=false] a resized or cropped file carries its own length and type
 */
const returnAttachmentStream = (res, result, modifiedAttachment = false) => {
  result.stream.on('end', () => { res.end() })
  res.set({ 'Content-Length': _.get(result, modifiedAttachment ? 'contentLength' : '_size', 0) })
  let contentType = _.get(result, modifiedAttachment ? 'mimeType' : '_contentType', 'image/jpeg')
  if (!_.isString(contentType)) {
    contentType = 'image/jpeg'
  }
  res.type(contentType)
  res.write('', 'binary')
  result.stream.pipe(res, { end: false })
}


class Routes {
  constructor () {}

  /** GET /api/:resource: the records matching the query, paged; the `numRecords` header when a limit is asked. */
  async list (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      let results
      if (req.options.limit && !_.isEmpty(req.options.query)) {
        // one filtered read serves the count and the page
        const matching = await req.resource.read(req.options.query, _.omit(req.options, ['page', 'limit']))
        res.set('numRecords', matching.length)
        results = h.paginate(matching, req.options)
      } else {
        if (req.options.limit) {
          res.set('numRecords', await req.resource.json.count())
        }
        results = await req.resource.read(req.options.query, req.options)
      }
      _.each(results, (result)=> injectAttachmentUrl(result, req))
      res.json(results)
    } catch (error) {
      return sendError(res, error)
    }
  }

  /** GET /api/:resource/:id: one record, or 404. */
  async find (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      const record = await req.resource.find(req.params.id, req.options)
      if (!record) {
        // the resource API answers an unknown id with nothing, over http it is a 404
        return sendError(res, h.recordNotFoundError(req.resource.name, req.params.id))
      }
      injectAttachmentUrl(record, req)
      res.json(record)
    } catch (error) {
      return sendError(res, error)
    }
  }

  /** POST /api/:resource (JSON): creates a record. */
  async create (req, res) {
    if (!req.is('json')) {
      return res.status(406).send('Not Acceptable')
    }
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      // the files of a record come with its attachments routes (and their right): a record that is sent with `_attachments` would point at files that are not its own
      const record = await req.resource.create(_.omit(req.body, '_attachments'), req.options)
      injectAttachmentUrl(record, req)
      res.json(record)
    } catch (error) {
      if (sendError.isClientError(error)) {
        logger.debug('REST API: record refused:', _.get(error, 'message', error))
      } else {
        logger.error('REST API: Error creating resource record', error)
      }
      return sendError(res, error)
    }
  }

  /** PUT /api/:resource/:id (JSON): updates a record. */
  async update (req, res) {
    if (!req.is('json')) {
      return res.status(406).send('Not Acceptable')
    }
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      const record = await req.resource.update(req.params.id, req.body, req.options)
      injectAttachmentUrl(record, req)
      res.json(record)
    } catch (error) {
      return sendError(res, error)
    }
  }

  /** DELETE /api/:resource/:id. */
  async remove (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      res.json(await req.resource.remove(req.params.id))
    } catch (error) {
      return sendError(res, error)
    }
  }

  /** GET /api/:resource/file/:aid: a file by its id alone. */
  async findFile (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      const result = await req.resource.findFile(req.params.aid)
      // the record of this file is not known here, so its type is not either
      secureAttachmentResponse(res, {}, securityOf(req))
      res.write('', 'binary')
      result.pipe(res)
    } catch (error) {
      return sendError(res, error)
    }
  }

  /** GET /api/:resource/:id/attachments/:aid: a file of a record, resized or smart-cropped on request (`?resize=WxH&smart=true`). */
  async findAttachment (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      const { resize } = req.query
      // a query string value is text: smart=false and smart=0 ask for a plain resize
      const smart = !_.includes([undefined, '', 'false', '0'], req.query.smart)
      const result = await req.resource.findAttachment(req.params.id, req.params.aid, {resize, smart})
      handleStreamError(res, result.stream)
      secureAttachmentResponse(res, { contentType: result._contentType, filename: _.get(result, '_fields._filename', result._filename) }, securityOf(req))
      if (result._oss) {
        let contentType = _.get(result, '_contentType', 'image/jpeg')
        if (!_.isString(contentType)) {
          contentType = 'image/jpeg'
        }
        res.type(contentType)
        return result.stream.pipe(res)
      }
      const resizeOptions = _.get(req.query, 'resize', false)
      const contentType = _.get(result, '_contentType', 'application/octet-stream')
      if (resizeOptions && h.resizeOptionsValid(resizeOptions) && _.includes(['image/jpeg', 'image/gif', 'image/png'], contentType)) {
        // the driver has resized or smart-cropped the image (and cached it under a key of its own): the record's _size is
        // not the size of this copy, so it is sent whole
        const buffer = await ImageOptimization.getBufferFromStream(result.stream)
        res.type(contentType)
        return res.send(buffer)
      }
      returnAttachmentStream(res, result)
    } catch (error) {
      return sendError(res, error)
    }
  }

  /**
   * GET /api/:resource/:id/attachments/:aid/cropped: the image cut as the crop its record stores says (flipped, turned, cropped, sized,
   * shaped: see util/cropRecipe), at the size `?resize=WxH` asks for. Each cut is kept next to the original, under a name made from
   * the recipe and the size; they go when the attachment changes. A file with no crop, or that is not a picture, comes as it is.
   */
  async findCroppedAttachment (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      const result = await req.resource.findAttachment(req.params.id, req.params.aid)
      secureAttachmentResponse(res, { contentType: result._contentType, filename: _.get(result, '_fields._filename', result._filename) }, securityOf(req))
      handleStreamError(res, result.stream)
      const recipe = parseRecipe(_.get(result, 'cropOptions'))
      if (!recipe || !CROPPABLE_TYPES.test(_.get(result, '_contentType', ''))) {
        return returnAttachmentStream(res, result)
      }
      const resize = h.resizeOptionsValid(req.query.resize) ? req.query.resize : undefined
      // a file kept in an object store has no folder here to keep copies in
      const store = result._oss ? null : req.resource.file
      const key = `${req.params.aid}-crop-${recipeKey(recipe, resize)}`
      if (store && store.exists(key)) {
        result.stream.destroy()
        const buffer = await ImageOptimization.getBufferFromStream(store.read(key))
        return res.type(_.get(await FileType.fromBuffer(buffer), 'mime', 'image/jpeg')).send(buffer)
      }
      const { buffer, mimeType } = await ImageOptimization.optimizeAttachment(result.stream, result.cropOptions, { resize })
      if (store) {
        try {
          await pipeline(Readable.from(buffer), store.write(key))
        } catch (error) {
          // the copy is only a saving: the answer does not wait on it
          logger.warn(`Could not keep the cropped copy ${key}:`, error)
        }
      }
      res.type(mimeType).send(buffer)
    } catch (error) {
      return sendError(res, error)
    }
  }

  /**
   * GET /api/:resource/:id/attachments/:aid/crop-suggestion?aspect=1.5&rotate=90&flipX=true: where smart cropping would put a crop of that
   * shape (the crop tool offers it; nothing is cut or kept). `aspect` is width over height or `W:H`; the picture is turned first, and the
   * answer is in pixels of the picture so turned.
   */
  async suggestAttachmentCrop (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      const turn = cropSuggestionQuery(req.query)
      const result = await req.resource.findAttachment(req.params.id, req.params.aid)
      handleStreamError(res, result.stream)
      if (!CROPPABLE_TYPES.test(_.get(result, '_contentType', ''))) {
        result.stream.destroy()
        throw { code: 400, message: 'only a jpeg, png, webp or gif picture can be cropped' }
      }
      res.json(await ImageOptimization.suggestCrop(result.stream, turn.aspect, turn))
    } catch (error) {
      return sendError(res, error)
    }
  }

  /** POST /api/:resource/attachments/crop-suggestion (multipart, the picture as the `image` part, the rest as in GET .../crop-suggestion): the same for a picture that is not stored yet. */
  async suggestUploadedCrop (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      const upload = _.first(req.files)
      if (!upload) {
        throw { code: 400, message: 'missing picture' }
      }
      const turn = cropSuggestionQuery(_.extend({}, req.body, req.query))
      res.json(await ImageOptimization.suggestCrop(await fs.readFile(upload.path), turn.aspect, turn))
    } catch (error) {
      return sendError(res, error)
    }
  }

  /** POST /api/:resource/:id/attachments (multipart): adds the uploaded file under the field the form names. */
  async createAttachment (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    const uploadedAttachment = _.first(req.files)
    if (!uploadedAttachment) {
      return res.status(400).json({ code: 400, message: 'No file uploaded' })
    }
    const strict = securityOf(req).strictUploads
    const params = {
      fields: {},
      contentType: uploadedAttachment.mimetype,
      filename: strict ? sanitizeFilename(uploadedAttachment.originalname) : uploadedAttachment.originalname,
      name: uploadedAttachment.fieldname,
      stream: fs.createReadStream(uploadedAttachment.path)
    }
    try {
      _.each(req.body, (field, key) => {
        if (key === 'cropOptions') {
          try {
            _.set(params, key, _.omit(JSON.parse(field), ['updated']))
          } catch {
            throw { code: 400, message: 'cropOptions must be valid json' }
          }
        } else if (key === 'imageMap') {
          let parsed
          try {
            parsed = JSON.parse(field)
          } catch {
            throw { code: 400, message: 'imageMap must be valid json' }
          }
          params.imageMap = normalizeImageMap(parsed)
        } else if (key === 'order') {
          _.set(params, key, _.toInteger(field))
        } else {
          _.set(params.fields, key, strict && key === '_filename' ? sanitizeFilename(field) : field)
        }
      })
      const result = await req.resource.createAttachment(req.params.id, params)
      res.json(result)
    } catch (error) {
      params.stream.destroy()
      return sendError(res, error)
    }
  }

  /** PUT /api/:resource/:id/attachments(/:aid) (JSON): changes one attachment, or several at once. */
  async updateAttachment (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    if (!req.is('json')) {
      return res.status(406).send('Not Acceptable')
    }
    try {
      if (req.params.aid) {
        const result = await req.resource.updateAttachment(req.params.id, req.params.aid, attachmentUpdate(req, req.body))
        res.json(result)
      } else {
        let attachments = req.body
        if (!_.isArray(attachments)) {
          attachments = [attachments]
        }
        const results = []
        for (const attachment of attachments) {
          results.push(await req.resource.updateAttachment(req.params.id, attachment._id, attachmentUpdate(req, attachment)))
        }
        res.json(results.length === 1 ? _.first(results) : results)
      }
    } catch (error) {
      return sendError(res, error)
    }
  }

  /** DELETE /api/:resource/:id/attachments(/:aid): one attachment, or every attachment of the record. */
  async removeAttachment (req, res) {
    if (!req.resource) {
      return res.status(500).send('resource not found')
    }
    try {
      if (req.params.aid) {
        const result = await req.resource.removeAttachment(req.params.id, req.params.aid)
        res.json(result)
      } else {
        let attachments = req.body
        if (!_.isArray(attachments)) {
          attachments = [attachments]
        }
        const results = await pAll(_.map(attachments, attachment => {
          return async () => await req.resource.removeAttachment(req.params.id, attachment._id)
        }), {concurrency: 5})
        res.json(attachments.length === 1 ? _.first(results) : results)
      }
    } catch (error) {
      return sendError(res, error)
    }
  }
}

exports = module.exports = new Routes()
exports.injectAttachmentUrl = injectAttachmentUrl
