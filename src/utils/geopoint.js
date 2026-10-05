import _ from 'lodash'
import TranslateService from '@s/TranslateService'

// The geopoint field: a place on Earth, kept as `{ lat, lng }` in degrees (WGS-84, the system of GPS and of Google Maps). The reading of what is typed or pasted, the rules and the words
// are here, apart from the widget and the maps, so that they are tested without a component.

export const DEFAULT_PRECISION = 6
const MAX_PRECISION = 10
export const DEFAULT_ZOOM = 12
const LIMITS = { lat: 90, lng: 180 }
const HEMISPHERES = { lat: ['N', 'S'], lng: ['E', 'W'] }

/**
 * @param {Object} schema the field
 * @returns {{precision: number, zoom: number, center: {lat: number, lng: number}|undefined}} what the field says: the decimals kept (0 to 10, 6 by default: about 10 cm),
 *   the zoom of a map that shows no point yet (1 to 20), and where that map is centred
 */
export function geopointOptions (schema) {
  const read = key => _.get(schema, key, _.get(schema, `options.${key}`))
  const precision = read('precision')
  const zoom = read('zoom')
  return {
    precision: _.isInteger(precision) ? _.clamp(precision, 0, MAX_PRECISION) : DEFAULT_PRECISION,
    zoom: _.isFinite(zoom) ? _.clamp(Math.round(zoom), 1, 20) : DEFAULT_ZOOM,
    center: normaliseGeopoint(read('center'))
  }
}

/**
 * @param {*} value
 * @returns {{lat: number, lng: number}|undefined} the point when the value is a latitude from -90 to 90 and a longitude from -180 to 180 (numbers), else nothing
 */
export function normaliseGeopoint (value) {
  if (!_.isPlainObject(value) || !_.isFinite(value.lat) || !_.isFinite(value.lng)) {
    return undefined
  }
  return Math.abs(value.lat) <= LIMITS.lat && Math.abs(value.lng) <= LIMITS.lng ? { lat: value.lat, lng: value.lng } : undefined
}

/**
 * @param {number} number degrees
 * @param {number} [precision] the decimals kept
 * @returns {number} the degrees with no more than that many decimals
 */
export function roundCoordinate (number, precision = DEFAULT_PRECISION) {
  const factor = Math.pow(10, precision)
  const rounded = Math.round(number * factor) / factor
  // (a little under zero rounds to -0, which is written -0 by some and 0 by others)
  return rounded === 0 ? 0 : rounded
}

/**
 * @param {number} number degrees
 * @param {number} [precision] the decimals kept
 * @returns {string} the degrees as they are written in a box: rounded, no zeros at the end (48.8566, not 48.856600)
 */
export function formatCoordinate (number, precision = DEFAULT_PRECISION) {
  return _.isFinite(number) ? String(roundCoordinate(number, precision)) : ''
}

/**
 * @param {{lat: number, lng: number}} value
 * @param {number} [precision] the decimals kept
 * @returns {string} `48.8566, 2.3522`, empty for no point
 */
export function formatGeopoint (value, precision = DEFAULT_PRECISION) {
  const point = normaliseGeopoint(value)
  return point ? `${formatCoordinate(point.lat, precision)}, ${formatCoordinate(point.lng, precision)}` : ''
}

/**
 * Reads one coordinate: degrees as a decimal (`48.8566`, `-2.35`, `48,8566`, `48.8566°`), with a letter for the side (`48.8566 N`, `W 2.35`), or in degrees, minutes and seconds
 * (`48°51'24"N`).
 * @param {*} text what was typed
 * @param {'lat'|'lng'} axis
 * @returns {number|undefined|number} the degrees; nothing for an empty text; NaN for what is not a coordinate of that axis (a wrong letter, more than 90 or 180)
 */
export function parseCoordinate (text, axis) {
  let rest = _.trim(_.toString(text))
  if (rest === '') {
    return undefined
  }
  let sign = 1
  const side = /^([NSEW])\s*(?=[\d.,+-])|(?<=[\d.°º'′’"″”])\s*([NSEW])$/i.exec(rest)
  if (side) {
    const letter = _.toUpper(side[1] || side[2])
    if (!_.includes(HEMISPHERES[axis], letter)) {
      return NaN
    }
    rest = _.trim(rest.replace(side[0], ''))
    sign = letter === 'S' || letter === 'W' ? -1 : 1
    if (/^[+-]/.test(rest)) {
      return NaN
    }
  } else if (/[A-Za-z]/.test(rest)) {
    return NaN
  } else if (/^[+-]/.test(rest)) {
    sign = rest[0] === '-' ? -1 : 1
    rest = _.trim(rest.slice(1))
  }
  rest = rest.replace(/[º˚]/g, '°').replace(/[′’]/g, '\'').replace(/[″”]|''/g, '"')
  let degrees
  const decimal = /^(\d+(?:[.,]\d+)?|[.,]\d+)\s*°?$/.exec(rest)
  if (decimal) {
    const number = decimal[1]
    // a comma is the decimal mark of the languages that have it (48,8566), never a thousands mark
    degrees = Number(number.replace(',', '.'))
  } else {
    const dms = /^(\d+)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*'\s*(?:(\d+(?:[.,]\d+)?)\s*"\s*)?)?$/.exec(rest)
    if (!dms) {
      return NaN
    }
    const [minutes, seconds] = [dms[2], dms[3]].map(part => (part ? Number(part.replace(',', '.')) : 0))
    if (minutes >= 60 || seconds >= 60) {
      return NaN
    }
    degrees = Number(dms[1]) + minutes / 60 + seconds / 3600
  }
  if (!_.isFinite(degrees) || degrees > LIMITS[axis]) {
    return NaN
  }
  return degrees === 0 ? 0 : sign * degrees
}

/**
 * Reads a point that was pasted as one text: `48.8566, 2.3522` (what Google Maps copies), `48.8566 2.3522`, `48,8566; 2,3522`, `(48.8566, 2.3522)`, `N48.8566 E2.3522`,
 * `48°51'24"N 2°21'8"E`; with the sides written the longitude may come first.
 * @param {*} text
 * @returns {{lat: number, lng: number}|undefined} the point, nothing when the text is not a pair of coordinates
 */
export function parsePair (text) {
  const clean = _.trim(_.toString(text)).replace(/^[([{]\s*|\s*[)\]}]$/g, '')
  if (clean === '') {
    return undefined
  }
  let parts
  if (_.includes(clean, ';')) {
    parts = clean.split(/\s*;\s*/)
  } else if (/,\s+/.test(clean)) {
    parts = clean.split(/\s*,\s+/)
  } else {
    // sides apart from their number (`N 48.8566 E 2.3522`, `48.8566 N 2.3522 E`) go with it
    const tokens = []
    // a side that comes before its number waits for it
    let waiting = false
    _.each(clean.split(/\s+/), (token) => {
      const isSide = /^[NSEW]$/i.test(token)
      if (waiting) {
        tokens[tokens.length - 1] += ` ${token}`
        waiting = false
      } else if (isSide && tokens.length && !/[NSEW]/i.test(_.last(tokens))) {
        tokens[tokens.length - 1] += ` ${token}`
      } else {
        tokens.push(token)
        waiting = isSide
      }
    })
    parts = tokens.length === 2 ? [...tokens] : clean.split(/\s*,\s*/)
  }
  if (parts.length !== 2) {
    return undefined
  }
  const sided = _.map(parts, part => (/^[EW]\s|[\d"'°º′″]\s*[EW]$|^[EW](?=[\d.+-])/i.test(part) ? 'lng' : 'lat'))
  const [first, second] = sided[0] === 'lng' && sided[1] === 'lat' ? [parts[1], parts[0]] : parts
  const lat = parseCoordinate(first, 'lat')
  const lng = parseCoordinate(second, 'lng')
  return _.isFinite(lat) && _.isFinite(lng) ? { lat, lng } : undefined
}

/**
 * @param {Object} schema the field
 * @param {string} latText what is in the latitude box
 * @param {string} lngText what is in the longitude box
 * @returns {string} what is wrong with the two boxes: nothing in them and required, only one of them, a text that is not a latitude or a longitude; empty when they are fine
 */
export function validateGeopointText (schema, latText, lngText) {
  const t = (key, params) => TranslateService.get(key, params)
  const lat = parseCoordinate(latText, 'lat')
  const lng = parseCoordinate(lngText, 'lng')
  if (_.isUndefined(lat) && _.isUndefined(lng)) {
    return _.get(schema, 'required', false) ? t('TL_FIELD_IS_REQUIRED') : ''
  }
  if (_.isNaN(lat)) {
    return t('TL_INVALID_LATITUDE')
  }
  if (_.isNaN(lng)) {
    return t('TL_INVALID_LONGITUDE')
  }
  return _.isUndefined(lat) || _.isUndefined(lng) ? t('TL_GEOPOINT_BOTH') : ''
}

/**
 * @param {Object} schema the field
 * @param {*} value what the record holds
 * @returns {string|null} what is wrong with it: missing when required, or not a latitude and a longitude; null when it is fine
 */
export function validateGeopoint (schema, value) {
  const t = (key, params) => TranslateService.get(key, params)
  if (_.isNil(value) || value === '') {
    return _.get(schema, 'required', false) ? t('TL_FIELD_IS_REQUIRED') : null
  }
  return normaliseGeopoint(value) ? null : t('TL_INVALID_GEOPOINT')
}
