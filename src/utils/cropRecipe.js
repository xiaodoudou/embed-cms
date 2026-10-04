import _ from 'lodash'

// The crop of an image is kept with it as a recipe (its `cropOptions`) and cut by the API when the image is asked for (lib/util/cropRecipe.js
// says how, and in which order: flipped, turned, cropped, sized, shaped). This is the admin's side of it: what the crop tool offers, and how
// its state becomes a recipe and a recipe becomes its state again.

// the shapes offered when a field names none; `free` and `original` are not ratios but ways to choose one
export const DEFAULT_RATIOS = ['free', 'original', '1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '9:16']
export const FORMATS = ['jpeg', 'png', 'webp']
const MAX_SIDE = 8192
const MAX_PIXELS = 50e6

/**
 * @param {number|string|Array<number>|{width: number, height: number}} value 1.5, '3:2', '3/2', [3, 2] or { width: 3, height: 2 }
 * @returns {number|null} width over height, null when it is not a ratio
 */
export function parseRatio (value) {
  const positive = (number) => _.isFinite(number) && number > 0 ? number : null
  if (_.isNumber(value)) {
    return positive(value)
  }
  if (_.isArray(value) && value.length === 2) {
    const [width, height] = [Number(value[0]), Number(value[1])]
    return positive(width) && positive(height) ? width / height : null
  }
  if (_.isPlainObject(value)) {
    const [width, height] = [Number(value.width), Number(value.height)]
    return positive(width) && positive(height) ? width / height : null
  }
  if (_.isString(value)) {
    const pair = /^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/.exec(value)
    if (pair) {
      return positive(Number(pair[1])) && positive(Number(pair[2])) ? Number(pair[1]) / Number(pair[2]) : null
    }
    return /^\s*\d+(?:\.\d+)?\s*$/.test(value) ? positive(Number(value)) : null
  }
  return null
}

/**
 * @param {Object} schema the field: `width` and `height` together (or the first crop tool's `crop`) fix the size of the result, so its shape
 * @returns {{width: number, height: number}|null}
 */
export function fixedSize (schema) {
  const source = _.get(schema, 'width') && _.get(schema, 'height') ? schema : _.get(schema, 'crop')
  const [width, height] = [Number(_.get(source, 'width')), Number(_.get(source, 'height'))]
  return width > 0 && height > 0 ? { width, height } : null
}

/**
 * @param {Object} schema the field
 * @returns {number|null} the one ratio the crop may have (a fixed size, else the `aspectRatio` option), null when the person chooses
 */
export function lockedRatio (schema) {
  const size = fixedSize(schema)
  return size ? size.width / size.height : parseRatio(_.get(schema, 'aspectRatio'))
}

/**
 * @typedef {Object} RatioChoice
 * @property {string} key what is kept in the recipe to say which was chosen: free, original, or the ratio as written (3:2)
 * @property {'free'|'original'|'ratio'} kind
 * @property {number|null} ratio width over height, null for free and original (the picture decides)
 * @property {string} label
 */

/**
 * @param {Object} schema the field: `aspectRatios` lists the choices (ratios as 1.5, '3:2', [3, 2] or { ratio, label }, and 'free' and 'original')
 * @returns {Array<RatioChoice>} what the person may choose from; the usual ratios when the field names none
 */
export function ratioChoices (schema) {
  const declared = _.get(schema, 'aspectRatios')
  const list = _.isArray(declared) && declared.length ? declared : DEFAULT_RATIOS
  return _.compact(_.map(list, (item) => {
    if (item === 'free' || item === 'original') {
      return { key: item, kind: item, ratio: null, label: item }
    }
    const spec = _.isPlainObject(item) && _.has(item, 'ratio') ? item.ratio : item
    const ratio = parseRatio(spec)
    if (!ratio) {
      return null
    }
    const key = _.isString(spec) ? spec.replace(/\s+/g, '') : `${_.round(ratio, 4)}`
    return { key, kind: 'ratio', ratio, label: _.get(item, 'label', key) }
  }))
}

/**
 * @param {{width: number, height: number}} kept the part of the picture kept
 * @param {Object|null} output the size, maximum sizes and format of the result
 * @returns {{width: number, height: number}} what size the result has (the same arithmetic as the server, lib/util/cropRecipe.js)
 */
export function resultSize (kept, output) {
  let { width, height } = kept
  if (output) {
    if (output.width && output.height) {
      ({ width, height } = output)
    } else if (output.width) {
      height = Math.round(height * output.width / width)
      width = output.width
    } else if (output.height) {
      width = Math.round(width * output.height / height)
      height = output.height
    }
    if (output.maxWidth || output.maxHeight) {
      const scale = Math.min(output.maxWidth ? output.maxWidth / width : 1, output.maxHeight ? output.maxHeight / height : 1, 1)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * @param {Object} state what the crop tool holds
 * @param {{left: number, top: number, width: number, height: number}} state.rect the part kept, in pixels of the picture once flipped and turned
 * @param {{rotate: number, flipX: boolean, flipY: boolean}} state.transforms
 * @param {'rect'|'circle'} state.shape
 * @param {Object} state.output size, maximums, format and quality of the result
 * @param {string} state.ratio the key of the ratio chosen (kept to offer it again)
 * @returns {Object} the crop options to keep with the attachment: only what is not the default, and `updated`, which makes the record editor send it
 */
export function buildRecipe ({ rect, transforms = {}, shape = 'rect', output = {}, ratio }) {
  const recipe = {
    left: Math.max(0, Math.round(rect.left)),
    top: Math.max(0, Math.round(rect.top)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  }
  const turn = ((Math.round(_.get(transforms, 'rotate', 0) / 90) % 4) + 4) % 4 * 90
  if (turn) {
    recipe.rotate = turn
  }
  if (transforms.flipX) {
    recipe.flipX = true
  }
  if (transforms.flipY) {
    recipe.flipY = true
  }
  if (shape === 'circle') {
    recipe.shape = 'circle'
  }
  const kept = _.omitBy(_.pick(output, ['width', 'height', 'maxWidth', 'maxHeight', 'format', 'quality']), value => !value)
  if (!_.isEmpty(kept)) {
    recipe.output = kept
  }
  if (ratio) {
    recipe.ratio = ratio
  }
  recipe.updated = true
  return recipe
}

/**
 * @param {Object} cropOptions what an attachment keeps: a recipe, or the coordinates the first crop tool stored (`data.coordinates`)
 * @returns {{rect: Object|null, transforms: {rotate: number, flipX: boolean, flipY: boolean}, shape: string, output: Object, ratio: string}} the state of the tool
 */
export function readRecipe (cropOptions) {
  const source = _.isPlainObject(_.get(cropOptions, 'data.coordinates')) ? cropOptions.data.coordinates : cropOptions
  const [width, height] = [Number(_.get(source, 'width')), Number(_.get(source, 'height'))]
  return {
    rect: width > 0 && height > 0 ? { left: Number(_.get(source, 'left')) || 0, top: Number(_.get(source, 'top')) || 0, width, height } : null,
    transforms: {
      rotate: ((Math.round(Number(_.get(cropOptions, 'rotate')) / 90 || 0) % 4) + 4) % 4 * 90,
      flipX: _.get(cropOptions, 'flipX') === true,
      flipY: _.get(cropOptions, 'flipY') === true
    },
    shape: _.get(cropOptions, 'shape') === 'circle' ? 'circle' : 'rect',
    output: _.isPlainObject(_.get(cropOptions, 'output')) ? { ...cropOptions.output } : {},
    ratio: _.isString(_.get(cropOptions, 'ratio')) ? cropOptions.ratio : ''
  }
}

/**
 * @param {Object} cropOptions what an attachment keeps
 * @returns {boolean} whether it cuts anything: a crop, a turn, a flip, a shape or a size (what is stored for "no crop" is just `{ updated: true }`)
 */
export function hasCrop (cropOptions) {
  const state = readRecipe(cropOptions)
  return !!(state.rect || state.transforms.rotate || state.transforms.flipX || state.transforms.flipY || state.shape === 'circle' || !_.isEmpty(state.output))
}

/**
 * @param {Object} schema the field
 * @returns {boolean} whether the field has the crop tool: a crop image field, or an image field with the `crop` option of the first crop tool
 */
export function canCrop (schema) {
  return _.get(schema, 'input') === 'cropimage' || !!_.get(schema, 'crop')
}

/**
 * @param {Object} attachment
 * @returns {boolean} whether the crop tool can cut it: not an svg (a drawing, cut by no one here)
 */
export function isCroppable (attachment) {
  const name = _.toLower(_.get(attachment, '_filename', '') || _.get(attachment, '_fields._filename', '') || _.get(attachment, 'file.name', ''))
  return !_.includes(_.toLower(_.get(attachment, '_contentType', '') || _.get(attachment, 'file.type', '')), 'svg') && !_.endsWith(name, '.svg')
}

/**
 * @param {Object} cropOptions what an attachment keeps
 * @returns {string} a short text that changes when the crop does, to put in an address so that a browser does not show the old cut
 */
export function cropVersion (cropOptions) {
  const text = JSON.stringify(_.omit(cropOptions, ['updated']))
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}
