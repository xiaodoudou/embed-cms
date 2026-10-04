
const toArray = require('stream-to-array')
const logger = require('../logger')
const _ = require('lodash')
const stream = require('stream')
const FileType = require('./fileType')
const sharp = require('sharp')
const Limiter = require('./Limiter')
const { parseRecipe, renderRecipe } = require('./cropRecipe')

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

  /**
   * @param {import('stream').Readable} attachmentStream
   * @param {string} resizeOptions `WIDTHxHEIGHT`, `WIDTHxauto` or `autoxHEIGHT`
   * @param {string|false} [forceMimeType=false]
   * @returns {Promise<{stream: import('stream').Readable, mimeType?: string}>} the resized image (sharp); the original when the image cannot be read
   */
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
   * Cuts an image as the crop recipe stored with it says: flipped, turned, cropped, sized and shaped (see util/cropRecipe).
   * @param {stream.Readable} attachmentStream
   * @param {object} cropOptions the recipe, or the coordinates (`data.coordinates`) of the first crop tool
   * @param {{resize?: string}} [options] `resize` is a size asked for the result: WIDTHxHEIGHT, WIDTHxauto or autoxHEIGHT
   * @returns {Promise<{mimeType: string, contentLength: number, stream: stream.Readable, buffer: Buffer}>} the original when the recipe changes nothing
   */
  optimizeAttachment(attachmentStream, cropOptions, options = {}) {
    return this.limiter.run(() => this._optimizeAttachment(attachmentStream, cropOptions, options))
  }

  /**
   * @param {import('stream').Readable} attachmentStream
   * @param {object} cropOptions
   * @param {{resize?: string}} options
   * @returns {Promise<{mimeType: string, contentLength: number, stream: import('stream').Readable, buffer: Buffer}>}
   */
  async _optimizeAttachment(attachmentStream, cropOptions, options) {
    try {
      const buffer = await this.getBufferFromStream(attachmentStream)
      // Validate buffer
      if (!buffer || buffer.length === 0) {
        throw new Error('Input buffer is empty or invalid')
      }
      const recipe = parseRecipe(cropOptions)
      if (!recipe) {
        const fileType = await FileType.fromBuffer(buffer)
        return { mimeType: _.get(fileType, 'mime', 'application/octet-stream'), contentLength: buffer.length, stream: stream.Readable.from(buffer), buffer }
      }
      const result = await renderRecipe(buffer, recipe, options)
      return { mimeType: result.mimeType, contentLength: result.contentLength, stream: stream.Readable.from(result.buffer), buffer: result.buffer }
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

  /**
   * Where smart cropping would put a crop of a given shape, for the crop tool to offer (nothing is cut).
   * @param {import('stream').Readable|Buffer} image
   * @param {number} aspect width over height of the crop
   * @param {{rotate?: number, flipX?: boolean, flipY?: boolean}} [turn] the picture is turned this way first
   * @returns {Promise<{left: number, top: number, width: number, height: number}>} in pixels of the picture as turned; one at a time, through the limiter
   */
  suggestCrop(image, aspect, turn) {
    return this.limiter.run(async () => {
      const buffer = Buffer.isBuffer(image) ? image : await this.getBufferFromStream(image)
      if (!buffer || buffer.length === 0) {
        throw new Error('Input buffer is empty or invalid')
      }
      return require('./smartcrop').suggestCrop(buffer, aspect, turn)
    })
  }

  /**
   * @param {import('stream').Readable} attachmentStream
   * @param {string} targetSize
   * @returns {Promise<object>} see _smartCropAttachment; one at a time, through the limiter
   */
  smartCropAttachment(attachmentStream, targetSize) {
    return this.limiter.run(() => this._smartCropAttachment(attachmentStream, targetSize))
  }

  /**
   * @param {import('stream').Readable} attachmentStream
   * @param {string} targetSize `WIDTHxHEIGHT`, `WIDTHxauto` or `autoxHEIGHT`
   * @returns {Promise<{stream: import('stream').Readable, mimeType: string, cropResult: object}>} the image cropped around its most interesting part (sharp's attention strategy)
   */
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
