const path = require('path')
const fs = require('fs')
const _ = require('lodash')
const OSS = require('ali-oss')
const { Transform } = require('stream')
const logger = require('../logger')

class OSSHelper {
  constructor () {
  }

  /**
   * @param {string} accessKeyId
   * @returns {object} the configuration of the store, from `oss-config-<accessKeyId>.json` in the project; throws when there is none
   */
  getOSSConfig = (accessKeyId) => {
    const ossFilePath = path.resolve(`./oss-config-${accessKeyId}.json`)
    if (!fs.existsSync(ossFilePath)) {
      throw new Error(`OSS config file not found for accessKeyId: ${accessKeyId}`)
    }
    return JSON.parse(fs.readFileSync(ossFilePath, 'utf-8'))
  }

  /**
   * @param {object} context the driver context
   * @param {object} field
   * @returns {string} the key of the file in the store: the configured path with the resource and the record filled in, then the file name
   */
  getOSSFilepath = (context, field) => {
    const ossPath = field.options.oss.path.replace('%{resource}', context.resource.name).replace('%{_id}', context.params.id)
    // the name of the stored attachment first (read, delete), else the name the file is uploaded with: the _filename field,
    // or the name of the uploaded file when there is no such field (the same fallback _createAttachmentImpl uses, so the
    // key the upload goes to is the key the delete removes)
    // basename only: a client supplied '../' must not move the object key out of its folder
    const rawFilename = _.get(context, 'attachment._filename') || _.get(context, 'params.object.fields._filename') || _.get(context, 'params.object.filename', '')
    const filenameFromContext = path.basename(String(rawFilename || '').replaceAll('\\', '/'))
    const filename = _.split(filenameFromContext, '.').shift()
    const extension = _.split(filenameFromContext, '.').pop()
    const ossFilename = `${field.options.oss.filename.replace('%{filename}', filename)}.${extension}`
    return path.join(ossPath, ossFilename).replaceAll('\\', '/')
  }

  /**
   * @param {object} field
   * @returns {object} the ali-oss client of the field; throws without an accessKeyId
   */
  getStore = (field) => {
    const ossOptions = _.get(field, 'options.oss', {})
    if (!_.has(ossOptions, 'accessKeyId')) {
      throw new Error('OSS options must include accessKeyId')
    }
    return new OSS(this.getOSSConfig(ossOptions.accessKeyId))
  }

  /**
   * Uploads the stream of the attachment of the context.
   * @param {object} context the driver context
   * @param {object} field
   * @returns {Promise<{name: string, size: number}>}
   */
  uploadStream = async (context, field) => {
    const store = this.getStore(field)
    const ossFilepath = this.getOSSFilepath(context, field)
    let size = 0
    const counter = new Transform({
      transform(chunk, encoding, callback) {
        size += chunk.length
        callback(null, chunk)
      }
    })
    const countingStream = context.params.object.stream.pipe(counter)
    const result = await store.putStream(ossFilepath, countingStream)
    logger.info(`Successfully uploaded to OSS: ${result.name}`)
    return { ...result, size }
  }

  /**
   * @param {object} context the driver context
   * @param {object} field
   * @returns {Promise<import('stream').Readable>} the file of the attachment of the context
   */
  getStream = async (context, field) => {
    try {
      const store = this.getStore(field)
      const ossFilepath = this.getOSSFilepath(context, field)
      const result = await store.getStream(ossFilepath)
      // the header is text: the size of an attachment is a number everywhere else
      return {stream: result.stream, size: Number(_.get(result, 'res.headers.content-length'))}
    } catch (error) {
      return context.error(error)
    }
  }

  /**
   * Uploads a file (a buffer or a path) to the store.
   * @param {object} context the driver context
   * @param {object} field
   */
  uploadFile = async (context, field) => {
    const store = this.getStore(field)
    const ossFilepath = this.getOSSFilepath(context, field)
    const fileContent = _.get(context, 'params.object.buffer', false) || _.get(context, 'params.object.path', false)
    if (!fileContent) {
      return context.error(new Error('No file content found in buffer or path for uploadFile.'))
    }
    store.put(ossFilepath, fileContent).then((result) => {
      logger.info(`Successfully uploaded to OSS: ${result.name}`)
      context.next()
    }).catch((error) => {
      context.error(error)
    })
  }

  /**
   * @param {object} context the driver context
   * @param {object} field
   * @returns {Promise<object>} the file, in memory
   */
  getFile = async (context, field) => {
    try {
      const store = this.getStore(field)
      const ossFilepath = this.getOSSFilepath(context, field)
      const result = await store.get(ossFilepath)
      context.attachment.buffer = result.content
    } catch (error) {
      return context.error(error)
    }
  }

  /**
   * @param {object} context the driver context
   * @param {object} field
   */
  deleteFile = async (context, field) => {
    const store = this.getStore(field)
    const ossFilepath = this.getOSSFilepath(context, field)
    await store.delete(ossFilepath)
    logger.info(`Successfully deleted from OSS: ${ossFilepath}`)
  }
}

module.exports = OSSHelper
