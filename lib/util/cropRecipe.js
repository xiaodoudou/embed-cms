/**
 * @fileoverview The crop of the admin's crop tool, kept as a recipe next to the original picture (the attachment's `cropOptions`)
 * and cut on request: the original is never touched, and the same recipe gives the same image whatever the size asked for.
 *
 * A recipe is, in the order it is applied to the picture (as a browser shows it, EXIF orientation included):
 *   1. `flipX`, `flipY`: mirrored
 *   2. `rotate`: 0, 90, 180 or 270 degrees clockwise
 *   3. `left`, `top`, `width`, `height`: the part kept, in pixels of the picture at that point (the first crop tool stored
 *      these under `data.coordinates`; that form is read too)
 *   4. `output`: the size and the format of the result (see below)
 *   5. `shape`: `circle` leaves the corners transparent
 */

const _ = require('lodash')
const crypto = require('crypto')
const sharp = require('sharp')

const FORMATS = ['jpeg', 'png', 'webp', 'gif']
// a recipe is data from a client: the picture it asks for is never larger than this
const MAX_SIDE = 8192
const MAX_PIXELS = 50e6

/**
 * @typedef {Object} CropRecipe
 * @property {{left: number, top: number, width: number, height: number}|null} rect the part kept; null keeps the whole picture
 * @property {0|90|180|270} rotate
 * @property {boolean} flipX
 * @property {boolean} flipY
 * @property {'rect'|'circle'} shape
 * @property {{width?: number, height?: number, maxWidth?: number, maxHeight?: number, format?: string, quality?: number}|null} output
 *   `width` and `height` give the size of the result (one alone keeps the aspect ratio); `maxWidth` and `maxHeight` only
 *   shrink; `format` is jpeg, png, webp or gif (the format of the original when unset); `quality` 1 to 100 (jpeg and webp)
 */

/**
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @returns {number|undefined} the value as a whole number in range, undefined when it is not a number
 */
function whole (value, min, max) {
  const number = Math.round(Number(value))
  return Number.isFinite(number) && value !== null && value !== '' && typeof value !== 'boolean' ? _.clamp(number, min, max) : undefined
}

/**
 * @param {*} output the output part of a recipe, from a client
 * @returns {CropRecipe['output']} what can be used of it, null when nothing
 */
function parseOutput (output) {
  if (!_.isPlainObject(output)) {
    return null
  }
  const result = _.omitBy({
    width: whole(output.width, 1, MAX_SIDE),
    height: whole(output.height, 1, MAX_SIDE),
    maxWidth: whole(output.maxWidth, 1, MAX_SIDE),
    maxHeight: whole(output.maxHeight, 1, MAX_SIDE),
    format: _.includes(FORMATS, output.format) ? output.format : undefined,
    quality: whole(output.quality, 1, 100)
  }, _.isUndefined)
  return _.isEmpty(result) ? null : result
}

/**
 * @param {*} cropOptions what an attachment stores
 * @returns {CropRecipe|null} the recipe, null when there is nothing to do (no crop, no turn, no change of size or shape)
 */
function parseRecipe (cropOptions) {
  if (!_.isPlainObject(cropOptions)) {
    return null
  }
  const source = _.isPlainObject(_.get(cropOptions, 'data.coordinates')) ? cropOptions.data.coordinates : cropOptions
  // a part with no size (0, a missing number) is no part: the whole picture is kept
  const side = value => Number(value) > 0 ? whole(value, 1, 1e6) : undefined
  const width = side(source.width)
  const height = side(source.height)
  const turns = Math.round(Number(cropOptions.rotate) / 90)
  const recipe = {
    rect: width && height ? { left: whole(source.left, 0, 1e6) || 0, top: whole(source.top, 0, 1e6) || 0, width, height } : null,
    rotate: Number.isFinite(turns) ? ((turns % 4) + 4) % 4 * 90 : 0,
    flipX: cropOptions.flipX === true,
    flipY: cropOptions.flipY === true,
    shape: cropOptions.shape === 'circle' ? 'circle' : 'rect',
    output: parseOutput(cropOptions.output)
  }
  const nothing = !recipe.rect && !recipe.rotate && !recipe.flipX && !recipe.flipY && recipe.shape === 'rect' && !recipe.output
  return nothing ? null : recipe
}

/**
 * @param {CropRecipe} recipe
 * @param {string} [resize] a size asked for the result: WIDTHxHEIGHT, WIDTHxauto or autoxHEIGHT
 * @returns {string} a short name for this recipe and size, for the cache file of the result
 */
function recipeKey (recipe, resize) {
  return crypto.createHash('sha1').update(JSON.stringify([recipe, resize || ''])).digest('hex').slice(0, 16)
}

/**
 * @param {string} [resize]
 * @returns {{width: number|null, height: number|null}|null} the size of a resize option, null when it is not one (a side that is `auto` is null)
 */
function parseResize (resize) {
  const match = /^(\d{1,5}|auto)x(\d{1,5}|auto)$/.exec(String(resize || ''))
  if (!match || (match[1] === 'auto' && match[2] === 'auto')) {
    return null
  }
  const side = value => value === 'auto' ? null : _.clamp(Number(value), 1, MAX_SIDE)
  return { width: side(match[1]), height: side(match[2]) }
}

/**
 * The size of the result: what the part kept measures, changed by the output of the recipe, then by the size asked for.
 * @param {{width: number, height: number}} kept
 * @param {CropRecipe['output']} output
 * @param {string} [resize]
 * @returns {{width: number, height: number}}
 */
function resultSize (kept, output, resize) {
  let { width, height } = kept
  const fit = (target) => {
    if (target.width && target.height) {
      width = target.width
      height = target.height
    } else if (target.width) {
      height = Math.round(height * target.width / width)
      width = target.width
    } else if (target.height) {
      width = Math.round(width * target.height / height)
      height = target.height
    }
  }
  if (output) {
    fit(output)
    if (output.maxWidth || output.maxHeight) {
      const scale = Math.min(output.maxWidth ? output.maxWidth / width : 1, output.maxHeight ? output.maxHeight / height : 1, 1)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }
  }
  fit(parseResize(resize) || {})
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Puts a picture the way the admin shows it: its EXIF orientation applied, then the recipe's flips and turn.
 * (A flip that comes with no turn would be applied after the extract by sharp, so the flips are a stage of their own.)
 * @param {import('sharp').Sharp} image
 * @param {Pick<CropRecipe, 'rotate'|'flipX'|'flipY'>} recipe
 * @returns {Promise<import('sharp').Sharp>}
 */
async function orient (image, recipe) {
  let turned = image.autoOrient()
  if (!recipe.flipX && !recipe.flipY) {
    return recipe.rotate ? turned.rotate(recipe.rotate) : turned
  }
  turned = turned.flip(recipe.flipY).flop(recipe.flipX)
  if (recipe.rotate) {
    turned = turned.rotate(recipe.rotate)
  }
  const { data, info } = await turned.raw().toBuffer({ resolveWithObject: true })
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
}

/**
 * @param {Pick<CropRecipe, 'rotate'>} recipe
 * @param {import('sharp').Metadata} meta the metadata of the original
 * @returns {{width: number, height: number}} the size of the picture once oriented (an EXIF orientation of 5 to 8 and a turn of 90 or 270 each lay it on its side)
 */
function orientedSize (recipe, meta) {
  const exifSideways = (meta.orientation || 1) >= 5
  const turnedSideways = recipe.rotate === 90 || recipe.rotate === 270
  return exifSideways !== turnedSideways ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height }
}

/**
 * @param {CropRecipe['rect']} rect
 * @param {{width: number, height: number}} size the picture
 * @returns {{left: number, top: number, width: number, height: number}} the rect inside the picture, at least a pixel
 */
function fitRect (rect, size) {
  const left = _.clamp(rect.left, 0, size.width - 1)
  const top = _.clamp(rect.top, 0, size.height - 1)
  return { left, top, width: _.clamp(rect.width, 1, size.width - left), height: _.clamp(rect.height, 1, size.height - top) }
}

/**
 * @param {string|undefined} wanted the format of the recipe
 * @param {import('sharp').Metadata} meta the original
 * @param {boolean} circle a round result needs transparency
 * @returns {string} jpeg, png, webp or gif
 */
function formatOf (wanted, meta, circle) {
  const format = wanted || (_.includes(FORMATS, meta.format) ? meta.format : meta.hasAlpha ? 'png' : 'jpeg')
  return circle && !_.includes(['png', 'webp'], format) ? 'png' : format
}

/**
 * Cuts a picture as a recipe says.
 * @param {Buffer} buffer the original
 * @param {CropRecipe} recipe
 * @param {{resize?: string}} [options] `resize` is a size asked for the result (WIDTHxHEIGHT, WIDTHxauto or autoxHEIGHT)
 * @returns {Promise<{buffer: Buffer, mimeType: string, contentLength: number, width: number, height: number}>}
 */
async function renderRecipe (buffer, recipe, { resize } = {}) {
  const meta = await sharp(buffer).metadata()
  const circle = recipe.shape === 'circle'
  const format = formatOf(_.get(recipe, 'output.format'), meta, circle)
  let image = await orient(sharp(buffer), recipe)
  const size = orientedSize(recipe, meta)
  const kept = recipe.rect ? fitRect(recipe.rect, size) : { left: 0, top: 0, ...size }
  if (recipe.rect) {
    image = image.extract(kept)
  }
  const target = resultSize(kept, recipe.output, resize)
  if (target.width !== kept.width || target.height !== kept.height) {
    image = image.resize(target.width, target.height, { fit: 'cover' })
  }
  if (circle) {
    const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${target.width}" height="${target.height}"><ellipse cx="${target.width / 2}" cy="${target.height / 2}" rx="${target.width / 2}" ry="${target.height / 2}"/></svg>`
    image = image.ensureAlpha().composite([{ input: Buffer.from(mask), blend: 'dest-in' }])
  } else if (format === 'jpeg') {
    image = image.flatten({ background: '#ffffff' })
  }
  const quality = _.get(recipe, 'output.quality', 85)
  if (format === 'jpeg') {
    image = image.jpeg({ quality, mozjpeg: true })
  } else if (format === 'png') {
    image = image.png({ compressionLevel: 9, adaptiveFiltering: true })
  } else if (format === 'webp') {
    image = image.webp({ quality })
  } else {
    image = image.gif()
  }
  const { data, info } = await image.toBuffer({ resolveWithObject: true })
  return { buffer: data, mimeType: `image/${format}`, contentLength: data.length, width: info.width, height: info.height }
}

module.exports = { parseRecipe, recipeKey, renderRecipe, resultSize, orient, fitRect }
