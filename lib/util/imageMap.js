/**
 * @fileoverview The image map of a picture: areas (rectangles, circles, polygons) laid over it, each with a title and a link. It is kept
 * with the attachment as `imageMap` (`{ areas: [...] }`) and comes back with it in the record. The coordinates are fractions (0 to 1) of
 * the width and the height of the picture, so the map is right at any size the picture is shown.
 *
 * An area is `{ id, shape, coords, title, href, ref, target }`:
 *   - `shape: 'rect'`, `coords: [x1, y1, x2, y2]` (two opposite corners)
 *   - `shape: 'circle'`, `coords: [cx, cy, r]` (the radius is a fraction of the width of the picture)
 *   - `shape: 'poly'`, `coords: [x1, y1, x2, y2, x3, y3, ...]` (three points or more)
 *   - `href`: where it links, a web address, `mailto:`, `tel:`, or a path of the site (`/pricing`, `#top`)
 *   - `ref`: or a record it points to, `{ resource, id }` (the site knows what address a record has)
 *   - `target`: `_self` (default) or `_blank`
 */

const _ = require('lodash')
const crypto = require('crypto')

const SHAPES = ['rect', 'circle', 'poly']
const TARGETS = ['_self', '_blank']
const MAX_AREAS = 200
const MAX_POINTS = 100
const MAX_TEXT = 200
const MAX_HREF = 2048
// what a link may start with: a stored link is shown as a link by whoever reads the record, so a `javascript:` or `data:` one is refused
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#|\?)/i

/**
 * @param {string} character
 * @returns {boolean} whether it is a control character (a newline or a tab inside a link is how `java
script:` hides)
 */
const hasControlCharacter = (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127

/**
 * @param {string} message
 * @returns {{code: number, message: string}} an error that answers 400 over http
 */
const invalid = (message) => ({ code: 400, message: `imageMap: ${message}` })

/**
 * @param {*} value
 * @returns {number} a fraction of the picture: a number, 0 to 1, five decimals
 */
const fraction = (value) => {
  const number = typeof value === 'number' ? value : NaN
  if (!Number.isFinite(number)) {
    throw invalid('coordinates are numbers')
  }
  return _.round(_.clamp(number, 0, 1), 5)
}

/**
 * @param {string} shape
 * @param {Array<number>} coords as stored
 * @returns {Array<number>} the coordinates of the shape, in range, a rectangle with its corners in order
 */
function normalizeCoords (shape, coords) {
  if (!_.isArray(coords)) {
    throw invalid('coords is a list of numbers')
  }
  const numbers = _.map(coords, fraction)
  if (shape === 'rect') {
    if (numbers.length !== 4) {
      throw invalid('a rect has four coordinates: x1, y1, x2, y2')
    }
    const [x1, y1, x2, y2] = numbers
    const rect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]
    if (rect[0] === rect[2] || rect[1] === rect[3]) {
      throw invalid('a rect has a width and a height')
    }
    return rect
  }
  if (shape === 'circle') {
    if (numbers.length !== 3 || numbers[2] <= 0) {
      throw invalid('a circle has three coordinates: cx, cy and a radius above 0')
    }
    return numbers
  }
  if (numbers.length < 6 || numbers.length % 2 !== 0 || numbers.length > MAX_POINTS * 2) {
    throw invalid(`a poly has three to ${MAX_POINTS} points, two coordinates each`)
  }
  return numbers
}

/**
 * @param {*} value
 * @param {string} name
 * @param {number} max
 * @returns {string} the text, trimmed
 */
function text (value, name, max) {
  if (_.isNil(value)) {
    return ''
  }
  if (!_.isString(value)) {
    throw invalid(`${name} is a text`)
  }
  const trimmed = value.trim()
  if (trimmed.length > max) {
    throw invalid(`${name} is at most ${max} characters`)
  }
  return trimmed
}

/**
 * @param {*} value the `ref` of an area
 * @returns {{resource: string, id: string}|undefined}
 */
function normalizeRef (value) {
  if (_.isNil(value)) {
    return undefined
  }
  if (!_.isPlainObject(value)) {
    throw invalid('ref is { resource, id }')
  }
  const resource = text(value.resource, 'ref.resource', 100)
  const id = text(value.id, 'ref.id', 100)
  if (!resource && !id) {
    return undefined
  }
  if (!resource || !id) {
    throw invalid('ref is { resource, id }')
  }
  return { resource, id }
}

/**
 * @param {*} area
 * @param {number} index
 * @returns {Object} the area as it is kept
 */
function normalizeArea (area, index) {
  if (!_.isPlainObject(area)) {
    throw invalid(`area ${index + 1} is an object`)
  }
  if (!_.includes(SHAPES, area.shape)) {
    throw invalid(`area ${index + 1}: shape is ${SHAPES.join(', ')}`)
  }
  const href = text(area.href, 'href', MAX_HREF)
  if (href && (!SAFE_HREF.test(href) || _.some(href, hasControlCharacter))) {
    throw invalid('a link starts with http://, https://, mailto:, tel:, / , # or ?')
  }
  if (!_.isNil(area.target) && !_.includes(TARGETS, area.target)) {
    throw invalid(`target is ${TARGETS.join(' or ')}`)
  }
  const id = text(area.id, 'id', 64) || crypto.randomBytes(4).toString('hex')
  return _.omitBy({
    id,
    shape: area.shape,
    coords: normalizeCoords(area.shape, area.coords),
    title: text(area.title, 'title', MAX_TEXT),
    href,
    ref: normalizeRef(area.ref),
    target: area.target || '_self'
  }, value => value === '' || _.isUndefined(value))
}

/**
 * Checks an image map from a client and gives it as it is kept: the known keys only, the coordinates in range, the links safe.
 * @param {*} value `{ areas: [...] }`, as the admin and the API send it (`updated`, a flag of the admin, is dropped)
 * @returns {{areas: Array<Object>}|null} null for no map at all (null, or an empty object)
 * @throws {{code: 400, message: string}} when it is not a map
 */
function normalizeImageMap (value) {
  if (_.isNil(value) || (_.isPlainObject(value) && _.isEmpty(_.omit(value, ['updated'])))) {
    return null
  }
  if (!_.isPlainObject(value) || !_.isArray(value.areas)) {
    throw invalid('is { areas: [...] }')
  }
  if (value.areas.length > MAX_AREAS) {
    throw invalid(`at most ${MAX_AREAS} areas`)
  }
  const areas = _.map(value.areas, normalizeArea)
  const ids = _.uniq(_.map(areas, 'id'))
  if (ids.length !== areas.length) {
    throw invalid('the ids of the areas are all different')
  }
  return { areas }
}

module.exports = { normalizeImageMap, SHAPES, TARGETS, MAX_AREAS }
