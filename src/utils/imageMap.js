import _ from 'lodash'
import Mustache from 'mustache'

// The image map of a picture, in the admin: the areas laid over it and what the map tool does with them. The server keeps and checks them
// (lib/util/imageMap.js says what an area is). The coordinates are fractions (0 to 1) of the width and the height of the picture; a circle
// has its centre and a radius that is a fraction of the width, so that it stays round at any size.

// the smallest side of a rectangle, or radius of a circle, that a drag makes (a click is not an area): a fraction of the picture
export const MIN_SIZE = 0.01
const MIN_POINTS = 3

/**
 * @param {number} value
 * @returns {number} the value, 0 to 1
 */
export const clamp01 = (value) => _.clamp(value, 0, 1)

/**
 * @param {Array<Object>} areas
 * @returns {string} an id that no area has
 */
export function newId (areas) {
  const taken = new Set(_.map(areas, 'id'))
  let n = areas.length + 1
  while (taken.has(`area-${n}`)) {
    n++
  }
  return `area-${n}`
}

/**
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b two opposite corners
 * @returns {Array<number>} the coordinates of the rectangle, corners in order
 */
export function rectFromPoints (a, b) {
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)].map(clamp01)
}

/**
 * @param {{x: number, y: number}} centre
 * @param {{x: number, y: number}} edge a point on the circle
 * @param {{width: number, height: number}} size the picture, in pixels
 * @returns {Array<number>} cx, cy and the radius as a fraction of the width, so that a circle drawn on a wide picture is round, not an ellipse
 */
export function circleFromPoints (centre, edge, size) {
  const radius = Math.hypot((edge.x - centre.x) * size.width, (edge.y - centre.y) * size.height) / size.width
  return [clamp01(centre.x), clamp01(centre.y), _.round(radius, 5)]
}

/**
 * @param {Object} area
 * @param {{width: number, height: number}} size
 * @returns {{left: number, top: number, right: number, bottom: number}} the box around the area, as fractions
 */
export function boundsOf (area, size) {
  const c = area.coords
  if (area.shape === 'rect') {
    return { left: c[0], top: c[1], right: c[2], bottom: c[3] }
  }
  if (area.shape === 'circle') {
    const ry = c[2] * size.width / size.height
    return { left: c[0] - c[2], top: c[1] - ry, right: c[0] + c[2], bottom: c[1] + ry }
  }
  const xs = _.filter(c, (value, i) => i % 2 === 0)
  const ys = _.filter(c, (value, i) => i % 2 === 1)
  return { left: _.min(xs), top: _.min(ys), right: _.max(xs), bottom: _.max(ys) }
}

/**
 * @param {Object} area
 * @param {number} dx a move, as a fraction of the width
 * @param {number} dy as a fraction of the height
 * @param {{width: number, height: number}} size
 * @returns {Object} the area moved, and kept inside the picture whole (a move that would take it out stops at the edge)
 */
export function moveArea (area, dx, dy, size) {
  const box = boundsOf(area, size)
  const x = _.clamp(dx, -box.left, 1 - box.right)
  const y = _.clamp(dy, -box.top, 1 - box.bottom)
  const coords = area.shape === 'rect' ? [area.coords[0] + x, area.coords[1] + y, area.coords[2] + x, area.coords[3] + y]
    : area.shape === 'circle' ? [area.coords[0] + x, area.coords[1] + y, area.coords[2]]
      : _.map(area.coords, (value, i) => value + (i % 2 === 0 ? x : y))
  return { ...area, coords: _.map(coords, value => _.round(clamp01(value), 5)) }
}

/**
 * @param {Object} area
 * @returns {Array<{key: string, x: number, y: number}>} the handles to drag to change it: the corners of a rectangle, the radius of a circle, the points of a polygon
 */
export function handlesOf (area) {
  const c = area.coords
  if (area.shape === 'rect') {
    return [{ key: 'nw', x: c[0], y: c[1] }, { key: 'ne', x: c[2], y: c[1] }, { key: 'se', x: c[2], y: c[3] }, { key: 'sw', x: c[0], y: c[3] }]
  }
  if (area.shape === 'circle') {
    return [{ key: 'r', x: c[0] + c[2], y: c[1] }]
  }
  return _.map(_.chunk(c, 2), ([x, y], i) => ({ key: `p${i}`, x, y }))
}

/**
 * @param {Object} start the area as it was when the drag of the handle began
 * @param {string} key the handle (see handlesOf)
 * @param {{x: number, y: number}} point where it is now
 * @param {{width: number, height: number}} size
 * @returns {Object} the area with the handle there; a rectangle is dragged from the corner opposite to it
 */
export function dragHandle (start, key, point, size) {
  const c = start.coords
  const at = { x: clamp01(point.x), y: clamp01(point.y) }
  if (start.shape === 'rect') {
    const opposite = { nw: { x: c[2], y: c[3] }, ne: { x: c[0], y: c[3] }, se: { x: c[0], y: c[1] }, sw: { x: c[2], y: c[1] } }[key]
    return { ...start, coords: rectFromPoints(opposite, at) }
  }
  if (start.shape === 'circle') {
    return { ...start, coords: circleFromPoints({ x: c[0], y: c[1] }, at, size) }
  }
  const index = Number(key.slice(1))
  return { ...start, coords: _.flatMap(_.chunk(c, 2), (pair, i) => i === index ? [at.x, at.y] : pair).map(value => _.round(value, 5)) }
}

/**
 * @param {Object} area
 * @param {{x: number, y: number}} point
 * @param {{width: number, height: number}} size
 * @returns {boolean} whether the point is inside the area
 */
export function contains (area, point, size) {
  const c = area.coords
  if (area.shape === 'rect') {
    return point.x >= c[0] && point.x <= c[2] && point.y >= c[1] && point.y <= c[3]
  }
  if (area.shape === 'circle') {
    return Math.hypot((point.x - c[0]) * size.width, (point.y - c[1]) * size.height) <= c[2] * size.width
  }
  const points = _.chunk(c, 2)
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if ((yi > point.y) !== (yj > point.y) && point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * @param {Array<Object>} areas
 * @param {{x: number, y: number}} point
 * @param {{width: number, height: number}} size
 * @returns {number} the index of the area on top at that point: the first one wins where areas overlap, as in an HTML image map; -1 for none
 */
export function areaAt (areas, point, size) {
  for (let i = 0; i < areas.length; i++) {
    if (contains(areas[i], point, size)) {
      return i
    }
  }
  return -1
}

/**
 * @param {Object} area a polygon
 * @param {number} index of the point
 * @returns {Object|null} the polygon without it; null when fewer than three points are left (it is not an area any more)
 */
export function removePoint (area, index) {
  const points = _.reject(_.chunk(area.coords, 2), (pair, i) => i === index)
  return points.length < MIN_POINTS ? null : { ...area, coords: _.flatten(points) }
}

/**
 * @param {Object} area
 * @param {{width: number, height: number}} size
 * @returns {boolean} whether it is large enough to be an area, and not what a click makes
 */
export function isBigEnough (area, size) {
  const box = boundsOf(area, size)
  if (area.shape === 'circle') {
    return area.coords[2] >= MIN_SIZE
  }
  return area.shape === 'poly' ? area.coords.length >= MIN_POINTS * 2 : box.right - box.left >= MIN_SIZE && box.bottom - box.top >= MIN_SIZE
}

/**
 * @param {Object} area a polygon
 * @param {number} width of the picture in pixels (the unit of the svg it is drawn in)
 * @param {number} height
 * @returns {string} the points as an svg attribute
 */
export function svgPoints (area, width, height) {
  return _.map(_.chunk(area.coords, 2), ([x, y]) => `${_.round(x * width, 2)},${_.round(y * height, 2)}`).join(' ')
}

/**
 * @param {Object} imageMap what an attachment keeps
 * @returns {Array<Object>} a copy of its areas, each with an id (the ones to edit)
 */
export function readAreas (imageMap) {
  const areas = _.cloneDeep(_.get(imageMap, 'areas', []))
  return _.map(areas, (area, i) => ({ ...area, id: area.id || `area-${i + 1}` }))
}

/**
 * @param {Array<Object>} areas
 * @returns {{areas: Array<Object>, updated: boolean}} what to keep with the picture, with the flag that makes the record editor send it
 */
export function buildMap (areas) {
  return {
    areas: _.map(areas, (area) => _.omitBy({
      id: area.id,
      shape: area.shape,
      coords: _.map(area.coords, value => _.round(value, 5)),
      title: _.trim(area.title),
      href: _.trim(area.href),
      ref: area.ref && area.ref.resource && area.ref.id ? { resource: area.ref.resource, id: area.ref.id } : undefined,
      value: _.trim(area.value),
      target: area.target === '_blank' ? '_blank' : '_self'
    }, value => value === '' || _.isUndefined(value))),
    updated: true
  }
}

/**
 * @param {Object} imageMap
 * @returns {number} how many areas it has
 */
export function countAreas (imageMap) {
  return _.get(imageMap, 'areas.length', 0)
}

/**
 * @param {Object} schema the field: `references` lists the resources a link can point to, `[{ resource, label, title }]` (or just the names): `label` is
 *   a Mustache template that names a record, `title` what the kind of record is called to the person (Page, Product...), translatable
 * @returns {Array<{resource: string, label: string, title: string|Object}>}
 */
export function referencesOf (schema) {
  const list = _.get(schema, 'references', _.get(schema, 'options.references', []))
  return _.compact(_.map(_.isArray(list) ? list : [], (item) => {
    const resource = _.isString(item) ? item : _.get(item, 'resource')
    return _.isString(resource) && resource ? { resource, label: _.get(item, 'label', ''), title: _.get(item, 'title', '') } : null
  }))
}

export const KINDS = ['url', 'record', 'value']

/**
 * @param {Object} schema the field: `links` says what an area can link to (`'url'`, `'record'`, `'value'`, or a list of them); an address, and a record when
 *   the field has `references`, by default
 * @returns {Array<'url'|'record'|'value'>} the kinds of link the person can choose from, in that order; never none (a record needs `references`,
 *   and without them an address is offered in its place)
 */
export function linkKinds (schema) {
  const wanted = _.get(schema, 'links', _.get(schema, 'options.links'))
  const list = _.isString(wanted) ? [wanted] : _.isArray(wanted) ? wanted : ['url', 'record']
  const hasReferences = referencesOf(schema).length > 0
  const kinds = _.filter(KINDS, kind => _.includes(list, kind) && (kind !== 'record' || hasReferences))
  return kinds.length ? kinds : ['url']
}

/**
 * @param {Object} area
 * @param {Array<string>} kinds what the field allows
 * @returns {'url'|'record'|'value'} how the area links: to a record, to a value, to an address; an area that links to nothing yet takes the first kind the field allows
 */
export function kindOf (area, kinds) {
  if (area.ref) {
    return 'record'
  }
  if (_.trim(area.value)) {
    return 'value'
  }
  if (_.trim(area.href)) {
    return 'url'
  }
  return _.first(kinds) || 'url'
}

/**
 * @param {Object} record a record of the resource a link points to
 * @param {{schema?: Array<Object>, locales?: Array<string>}|undefined} resource its definition
 * @param {string} template a Mustache template of the label (`{{title}}`), else the first field of the resource is used
 * @param {string} locale
 * @returns {string} what the record is called in a list: the template, else its first field (of the locale when it has several), else its id
 */
export function recordLabel (record, resource, template, locale) {
  if (template) {
    // the fields that have a language are read in the locale of the person, as the labels of the select fields are
    const flat = _.mapValues(record, value => _.isPlainObject(value) && _.has(value, locale) ? value[locale] : value)
    const rendered = _.trim(Mustache.render(template, flat))
    if (rendered && rendered !== '[object Object]') {
      return rendered
    }
  }
  const first = _.first(_.get(resource, 'schema', []))
  if (first) {
    const localised = _.get(resource, 'locales') && (first.localised || _.isUndefined(first.localised))
    const value = _.get(record, localised ? `${first.field}.${locale}` : first.field)
    if (_.isString(value) && value) {
      return value
    }
  }
  return _.get(record, '_id', '')
}

/**
 * @param {Object} area
 * @returns {string} where it links, as text: its address, else the record it points to, else its value
 */
export function linkText (area) {
  if (area.ref && area.ref.resource && area.ref.id) {
    return `${area.ref.resource}: ${area.ref.id}`
  }
  return area.ref ? '' : area.href || area.value || ''
}

// what a link may start with: the same rule as the server (lib/util/imageMap.js), which refuses the rest
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#|\?)/i

/**
 * @param {string} href
 * @returns {boolean} whether the server takes it as a link: empty, a web address, mail, a phone number, or a path of the site (never javascript: or data:)
 */
export function isSafeHref (href) {
  const text = _.trim(href)
  return !text || (SAFE_HREF.test(text) && !_.some(text, character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) && text.length <= 2048)
}
