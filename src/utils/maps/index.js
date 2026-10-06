import { createLeaflet } from '@u/maps/leaflet'
import { normaliseGeopoint } from '@u/geopoint'

// The map of the geopoint field. The points that come in and go out are WGS-84, the field's.

// where a map that has no point and no centre of the field looks: the world
const WORLD_VIEW = { center: { lat: 20, lng: 0 }, zoom: 2 }

/**
 * @param {{lat: number, lng: number}|undefined} point the point of the field, if it has one
 * @param {{center: {lat: number, lng: number}|undefined, zoom: number}} options what the field says (see geopointOptions)
 * @returns {{center: {lat: number, lng: number}, zoom: number}} where the map looks to begin with: at the point, else at the centre of the field, else at the world
 */
export function initialView (point, options) {
  const found = normaliseGeopoint(point)
  if (found) {
    return { center: found, zoom: options.zoom }
  }
  if (options.center) {
    return { center: options.center, zoom: options.zoom }
  }
  return WORLD_VIEW
}

/**
 * Draws the map in an element.
 * @param {Object} options
 * @param {Object} options.config what the server told of the map (`GET /admin/maps`): the tiles and the search
 * @param {HTMLElement} options.container where the map is drawn
 * @param {{center: Object, zoom: number}} options.view where it looks to begin with (see initialView)
 * @param {string} options.lang `zh` or `en`
 * @param {function({lat: number, lng: number}): void} options.onPick called with the point the person picked
 * @returns {Promise<{setPoint: function(Object|null, {pan?: boolean}=): void, search: function(string): Promise<Object|null>, destroy: function(): void}>} the map: it shows (or
 *   removes) the pin of the point, searches an address and answers its point (nothing when there is none), and is taken down. Rejected when Leaflet cannot be loaded.
 */
export function createMapAdapter (options) {
  return createLeaflet(options)
}
