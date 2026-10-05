const _ = require('lodash')
const logger = require('../logger')

// The map of the geopoint field, where a point is picked: Leaflet (bundled with the admin) drawing the tiles of OpenStreetMap, and the search of Nominatim. Nothing needs a key.
// The `maps` option can point both at another server (a tile server of your own, a provider with a key in its address), or be `false` for no map at all.

const DEFAULTS = {
  tiles: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: { text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
    maxZoom: 19
  },
  search: { url: 'https://nominatim.openstreetmap.org/search' }
}

const seen = new WeakMap()
// an address of a server: https, or http on this machine, with no quotes, spaces or brackets other than the {z}, {x} and {y} of a tile address
const ADDRESS = /^(https:\/\/[A-Za-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1))(:\d{1,5})?\/[A-Za-z0-9_./?&=%:~+,;@!*-]*(\{[xyz]\}[A-Za-z0-9_./?&=%:~+,;@!*-]*)*$/
const TILE_PLACES = ['{z}', '{x}', '{y}']
// a line of plain text: no tags, no quotes, no control characters
const TEXT = /^[^<>"\p{Cc}]{1,200}$/u

/**
 * @param {*} maps the `maps` option of the CMS: nothing for the OpenStreetMap defaults, `false` for no map, or `{ tiles: { url, attribution, maxZoom }, search: { url } | false }`
 * @returns {{tiles: {url: string, attribution: {text: string, url?: string}, maxZoom: number}, search: {url: string}|null}|null} what is used, checked: the defaults for what is not given
 *   or is not right (the log says what), `search: null` where the search is turned off; null when the map is turned off
 */
function normalizeMaps (maps) {
  if (maps === false) {
    return null
  }
  if (!_.isPlainObject(maps)) {
    return copyDefaults()
  }
  // (the same option is read by the security headers and by the admin: the log says what is wrong with it once)
  if (!seen.has(maps)) {
    seen.set(maps, read(maps))
  }
  return seen.get(maps)
}

/** @returns {Object} a copy of the defaults, so that nobody changes them */
function copyDefaults () {
  return _.cloneDeep(DEFAULTS)
}

/**
 * @param {Object} maps the option
 * @returns {Object} see normalizeMaps
 */
function read (maps) {
  const result = copyDefaults()
  const tiles = maps.tiles
  if (!_.isUndefined(tiles)) {
    if (!_.isPlainObject(tiles) || !ADDRESS.test(_.toString(tiles.url)) || !_.every(TILE_PLACES, place => _.includes(tiles.url, place))) {
      logger.warn('maps.tiles.url is not an address with {z}, {x} and {y} in it (https, or http on this machine): the tiles of OpenStreetMap are used')
    } else {
      result.tiles.url = tiles.url
      // another server is not OpenStreetMap: its attribution is its own, or none
      result.tiles.attribution = TEXT.test(_.toString(_.get(tiles, 'attribution.text', tiles.attribution))) ? { text: _.get(tiles, 'attribution.text', tiles.attribution) } : { text: '' }
      if (ADDRESS.test(_.toString(_.get(tiles, 'attribution.url')))) {
        result.tiles.attribution.url = tiles.attribution.url
      }
      if (_.isInteger(tiles.maxZoom)) {
        result.tiles.maxZoom = _.clamp(tiles.maxZoom, 1, 22)
      }
    }
  }
  if (maps.search === false) {
    result.search = null
  } else if (!_.isUndefined(maps.search)) {
    if (!_.isPlainObject(maps.search) || !ADDRESS.test(_.toString(maps.search.url)) || /[{}]/.test(maps.search.url)) {
      logger.warn('maps.search.url is not an address (https, or http on this machine): the search of OpenStreetMap is used')
    } else {
      result.search = { url: maps.search.url }
    }
  }
  return result
}

/**
 * @param {Object|null} maps what normalizeMaps answered
 * @returns {{enabled: boolean, tiles?: Object, search?: Object|null}} what the admin is told: whether there is a map, the tiles and the search
 */
function publicMaps (maps) {
  return maps ? { enabled: true, tiles: maps.tiles, search: maps.search } : { enabled: false }
}

/**
 * @param {string} address
 * @returns {string|undefined} the origin of an address (`https://tile.openstreetmap.org`)
 */
function originOf (address) {
  const found = /^(https?:\/\/[^/]+)/.exec(_.toString(address))
  return found ? found[1] : undefined
}

/**
 * @param {Object|null} maps what normalizeMaps answered
 * @returns {Object<string, string[]>} the addresses the content security policy must let through for the map, by directive: the tiles are images, the search is a request; nothing
 *   when there is no map
 */
function cspSources (maps) {
  const sources = {}
  const tiles = originOf(_.get(maps, 'tiles.url'))
  if (tiles) {
    sources['img-src'] = [tiles]
  }
  const search = originOf(_.get(maps, 'search.url'))
  if (search) {
    sources['connect-src'] = [search]
  }
  return sources
}

module.exports = { DEFAULTS, normalizeMaps, publicMaps, cspSources }
