
const toArray = require('stream-to-array')
const logger = require('../logger')
const _ = require('lodash')
const stream = require('stream')
const FileType = require('./fileType')
const sharp = require('sharp')
const Limiter = require('./limiter')

/**
 * ImageOptimization - Utility class for image optimization and cropping
 */
class ImageOptimization {
  constructor () {
    // image work holds the whole file in memory and keeps every core busy: a burst of requests is worked off a few at a
    // time (configure() replaces this from the options of the CMS)
    this.limiter = new Limiter(4)
  }

  /**
   * @param {object} options
   * @param {number} options.concurrency - image operations at once, 0 for no limit
   * @param {number} [options.maxQueue] - operations allowed to wait
   */
  configure ({ concurrency, maxQueue }) {
    this.limiter = new Limiter(concurrency, maxQueue)
  }

  /**
   * Convert a stream to a buffer
   * @param {stream.Readable} attachmentStream
   * @returns {Promise<Buffer>}
   */
  async getBufferFromStream(attachmentStream) {
    const parts = await toArray(attachmentStream)
    const buffers = _.map(parts, part => _.isBuffer(part) ? part : Buffer.from(part))
    return Buffer.concat(buffers)
  }

  /**
   * Resize an image attachment
   * @param {stream.Readable} attachmentStream
   * @param {string} resizeOptions
   * @param {string|boolean} forceMimeType
   * @returns {Promise<{mimeType: string, contentLength: number, stream: stream.Readable}>}
   */
  resizeAttachment(attachmentStream, resizeOptions, forceMimeType = false) {
    return this.limiter.run(() => this._resizeAttachment(attachmentStream, resizeOptions, forceMimeType))
  }

  async _resizeAttachment(attachmentStream, resizeOptions, forceMimeType = false) {
    try {
      const buffer = await this.getBufferFromStream(attachmentStream)
      // Validate buffer
      if (!buffer || buffer.length === 0) {
        throw new Error('Input buffer is empty or invalid')
      }
      const fileType = await FileType.fromBuffer(buffer)
      const mimeType = forceMimeType || _.get(fileType, 'mime', 'application/octet-stream')
      const sizeParts = _.split(resizeOptions, 'x')
      // logger.info('Will resize image with', sizeParts)
      const [width, height] = _.map(sizeParts, dim => dim === 'auto' ? null : Number(dim))
      // Create Sharp instance
      const sharpInstance = sharp(buffer).resize(width, height)
      // Choose output format based on mimeType and apply optimization
      let outBuffer
      if (mimeType === 'image/jpeg') {
        outBuffer = await sharpInstance.jpeg({quality: 85, mozjpeg: true}).toBuffer()
      } else if (mimeType === 'image/png') {
        outBuffer = await sharpInstance.png({compressionLevel: 9, adaptiveFiltering: true}).toBuffer()
      } else if (mimeType === 'image/webp') {
        outBuffer = await sharpInstance.webp({ quality: 85 }).toBuffer()
      } else if (mimeType === 'image/gif') {
        outBuffer = await sharpInstance.gif().toBuffer()
      } else {
        outBuffer = await sharpInstance.jpeg({ quality: 85, mozjpeg: true }).toBuffer()
      }
      const resultStream = stream.Readable.from(outBuffer)
      const contentLength = Buffer.byteLength(outBuffer)
      return { mimeType, contentLength, stream: resultStream }
    } catch (error) {
      logger.error('Error resizing attachment:', error)
      throw error
    }
  }

  /**
   * Crop and optimize an image attachment
   * @param {stream.Readable} attachmentStream
   * @param {object} cropOptions
   * @returns {Promise<{mimeType: string, contentLength: number, stream: stream.Readable}>}
   */
  optimizeAttachment(attachmentStream, cropOptions) {
    return this.limiter.run(() => this._optimizeAttachment(attachmentStream, cropOptions))
  }

  async _optimizeAttachment(attachmentStream, cropOptions) {
    try {
      const buffer = await this.getBufferFromStream(attachmentStream)
      // Validate buffer
      if (!buffer || buffer.length === 0) {
        throw new Error('Input buffer is empty or invalid')
      }
      const fileType = await FileType.fromBuffer(buffer)
      const mimeType = _.get(fileType, 'mime', 'application/octet-stream')
      logger.warn('Will crop image with', cropOptions)
      if (_.get(cropOptions, 'data.coordinates', false)) {
        cropOptions = cropOptions.data.coordinates
      }
      // Use Sharp for cropping and optimization
      const sharpInstance = sharp(buffer).extract(_.pick(cropOptions, ['left', 'top', 'width', 'height']))
      // Apply format-specific optimization
      let outBuffer
      if (mimeType === 'image/jpeg') {
        outBuffer = await sharpInstance.jpeg({quality: 85,mozjpeg: true,optimiseCoding: true}).toBuffer()
      } else if (mimeType === 'image/png') {
        outBuffer = await sharpInstance.png({compressionLevel: 9,adaptiveFiltering: true}).toBuffer()
      } else if (mimeType === 'image/webp') {
        outBuffer = await sharpInstance.webp({ quality: 85 }).toBuffer()
      } else if (mimeType === 'image/gif') {
        outBuffer = await sharpInstance.gif().toBuffer()
      } else {
        // Default to JPEG for unknown formats
        outBuffer = await sharpInstance.jpeg({ quality: 85, mozjpeg: true }).toBuffer()
      }
      const resultStream = stream.Readable.from(outBuffer)
      const contentLength = Buffer.byteLength(outBuffer)
      return { mimeType, contentLength, stream: resultStream }
    } catch (error) {
      logger.error('Error cropping attachment:', error)
      throw error
    }
  }

  /**
   * Smart crop and optimize an image attachment
   * @param {stream.Readable} attachmentStream
   * @param {string|object} targetSize
   * @param {object} options
   * @returns {Promise<{mimeType: string, contentLength: number, stream: stream.Readable, cropResult: object}>}
   */
  /**
   * Get the width and height of an image from a file path
   * @param {string} filePath - Absolute path to the image file
   * @returns {Promise<{width: number, height: number}|null>}
   */
  async getImageDimensions(filePath) {
    try {
      const metadata = await sharp(filePath).metadata()
      return { width: metadata.width, height: metadata.height }
    } catch (error) {
      logger.error('Failed to get image dimensions:', error)
      return null
    }
  }

  smartCropAttachment(attachmentStream, targetSize) {
    return this.limiter.run(() => this._smartCropAttachment(attachmentStream, targetSize))
  }

  async _smartCropAttachment(attachmentStream, targetSize) {
    try {
      const smartCrop = require('./smartcrop')
      const buffer = await this.getBufferFromStream(attachmentStream)
      // Validate buffer
      if (!buffer || buffer.length === 0) {
        throw new Error('Input buffer is empty or invalid')
      }
      const fileType = await FileType.fromBuffer(buffer)
      const mimeType = _.get(fileType, 'mime', 'application/octet-stream')
      // logger.info('Will smart crop image to', targetSize)
      if (!_.includes(['image/jpeg', 'image/png', 'image/gif'], mimeType)) {
        throw new Error(`Smart crop not supported for ${mimeType}`)
      }
      const result = await smartCrop.applyCrop(buffer, targetSize)
      return {
        mimeType: result.mimeType,
        contentLength: result.contentLength,
        stream: stream.Readable.from(result.buffer),
        cropResult: result.cropResult,
        targetSize: result.targetSize
      }
    } catch (error) {
      logger.error('Error smart cropping attachment:', error)
      throw error
    }
  }
}

module.exports = new ImageOptimization()
