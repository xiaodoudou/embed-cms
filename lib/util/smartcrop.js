/**
 * @fileoverview Smart cropping: a resize to another aspect ratio that keeps the most interesting part of the picture
 * instead of its centre. It uses the attention strategy of sharp (libvips), which looks for skin tones, saturated colours
 * and detail: no model to load, nothing to download, no dependency beyond sharp.
 */

const _ = require('lodash')
const sharp = require('sharp')
const { orient } = require('./cropRecipe')

/**
 * The output size for a resize option: 'WIDTHxHEIGHT', 'WIDTHxauto' or 'autoxHEIGHT' ('auto' keeps the aspect ratio,
 * 'autoxauto' keeps the original size).
 * @param {{width: number, height: number}} image
 * @param {string} targetSize
 * @returns {{targetWidth: number, targetHeight: number}}
 */
function getSizes (image, targetSize) {
  const [width, height] = String(targetSize).split('x')
  const number = (value, name) => {
    const result = _.toNumber(value)
    if (_.isNaN(result) || result <= 0) {
      throw new Error(`Invalid ${name} in "${targetSize}": use WIDTHxHEIGHT, WIDTHxauto or autoxHEIGHT`)
    }
    return result
  }
  if (width === 'auto' && height === 'auto') {
    return { targetWidth: image.width, targetHeight: image.height }
  }
  if (width === 'auto') {
    const targetHeight = number(height, 'height')
    return { targetWidth: Math.round(targetHeight * image.width / image.height), targetHeight }
  }
  if (height === 'auto') {
    const targetWidth = number(width, 'width')
    return { targetWidth, targetHeight: Math.round(targetWidth * image.height / image.width) }
  }
  return { targetWidth: number(width, 'width'), targetHeight: number(height, 'height') }
}

/**
 * Resizes an image to the target size, cropping around its most interesting part.
 * @param {Buffer} imageBuffer
 * @param {string} targetSize - 'WIDTHxHEIGHT', 'WIDTHxauto' or 'autoxHEIGHT'
 * @returns {Promise<{buffer: Buffer, mimeType: string, contentLength: number, cropResult: {x: number, y: number, width: number, height: number}, originalSize: {width: number, height: number}, targetSize: {width: number, height: number}}>}
 *   cropResult is the part of the original that was kept, in pixels of the original
 */
async function applyCrop (imageBuffer, targetSize) {
  const metadata = await sharp(imageBuffer).metadata()
  const { targetWidth, targetHeight } = getSizes(metadata, targetSize)
  const format = metadata.format || 'jpeg'
  const { data, info } = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'cover', position: sharp.strategy.attention })
    .toFormat(format)
    .toBuffer({ resolveWithObject: true })
  // sharp scales the image to cover the target, then crops; its offsets are in pixels of the scaled image
  return {
    buffer: data,
    mimeType: `image/${format}`,
    contentLength: data.length,
    cropResult: keptWindow(info, metadata, targetWidth, targetHeight),
    originalSize: { width: metadata.width, height: metadata.height },
    targetSize: { width: targetWidth, height: targetHeight }
  }
}

/**
 * @param {import('sharp').OutputInfo} info the result of a resize to the target size
 * @param {{width: number, height: number}} original
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {{x: number, y: number, width: number, height: number}} the part of the original that was kept, in its pixels. sharp scales the
 *   image to cover the target, then crops: its offsets are in pixels of the scaled image
 */
function keptWindow (info, original, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / original.width, targetHeight / original.height)
  return {
    x: Math.round(-(info.cropOffsetLeft || 0) / scale),
    y: Math.round(-(info.cropOffsetTop || 0) / scale),
    width: Math.round(targetWidth / scale),
    height: Math.round(targetHeight / scale)
  }
}

/**
 * Where smart cropping would put a crop of a given shape: the largest window of that aspect ratio that fits the picture, placed on its
 * most interesting part. This is only a suggestion for the crop tool, nothing is cut.
 * @param {Buffer} imageBuffer
 * @param {number} aspect width over height of the window
 * @param {{rotate?: number, flipX?: boolean, flipY?: boolean}} [turn] the picture is put the way the crop tool shows it first (EXIF orientation,
 *   then these), and the window is in pixels of the picture so turned
 * @returns {Promise<{left: number, top: number, width: number, height: number}>}
 */
async function suggestCrop (imageBuffer, aspect, turn = {}) {
  const turned = await orient(sharp(imageBuffer), { rotate: turn.rotate || 0, flipX: !!turn.flipX, flipY: !!turn.flipY })
  const { data, info } = await turned.raw().toBuffer({ resolveWithObject: true })
  const original = { width: info.width, height: info.height }
  const ratio = _.clamp(aspect, 0.05, 20)
  const targetHeight = 200
  const targetWidth = Math.max(1, Math.round(targetHeight * ratio))
  const { info: cut } = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .resize(targetWidth, targetHeight, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer({ resolveWithObject: true })
  const window = keptWindow(cut, original, targetWidth, targetHeight)
  return { left: window.x, top: window.y, width: Math.min(window.width, original.width), height: Math.min(window.height, original.height) }
}

module.exports = { applyCrop, getSizes, suggestCrop }
