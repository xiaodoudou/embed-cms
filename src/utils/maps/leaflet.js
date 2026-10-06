import _ from 'lodash'

// The map of the geopoint field: Leaflet drawing tiles (OpenStreetMap's, or the server of the `maps` option) with a pin that can be dragged. Leaflet is bundled with the admin and loaded
// only when a map is opened; no script comes from another server. The points that come in and go out are WGS-84, which is what Leaflet and the tiles use.

// how close an address that was found is shown
const FOUND_ZOOM = 15
// a pin drawn in the page (no picture file, so no path for the bundler to break), the point at its tip; its colours are in the style of the dialog (GeoPickerDialog.vue)
const PIN = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40" aria-hidden="true"><path d="M14 1C7 1 1.5 6.5 1.5 13.5C1.5 23 14 39 14 39S26.5 23 26.5 13.5C26.5 6.5 21 1 14 1Z"/><circle cx="14" cy="13.5" r="4.5"/></svg>'

/**
 * @returns {Promise<Object>} Leaflet, with its style sheet
 */
async function loadLeaflet () {
  const [leaflet] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
  return leaflet.default || leaflet
}

/**
 * @param {string} text
 * @returns {string} the text safe to put in HTML
 */
const escapeHtml = text => _.escape(text)

/**
 * @param {{text: string, url?: string}} attribution what the tile server asks to be said
 * @returns {string} the HTML of the credit at the corner of the map: the text, a link when there is an address; nothing for no text
 */
export function attributionHtml (attribution) {
  const text = _.get(attribution, 'text')
  if (!text) {
    return ''
  }
  return attribution.url ? `<a href="${escapeHtml(attribution.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>` : escapeHtml(text)
}

/**
 * @param {string} address the search of the `maps` option
 * @param {string} text what is looked for
 * @param {string} lang `zh` or `en`
 * @returns {string} the address that is asked (Nominatim's: format, one result, the language of the answer)
 */
export function searchAddress (address, text, lang) {
  const url = new URL(address, window.location.href)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  url.searchParams.set('accept-language', lang === 'zh' ? 'zh-CN' : 'en')
  url.searchParams.set('q', text)
  return url.toString()
}

/**
 * @param {Object} options
 * @param {{tiles: {url: string, attribution: Object, maxZoom: number}, search: {url: string}|null}} options.config what the server said of the map (`GET /admin/maps`)
 * @param {HTMLElement} options.container where the map is drawn
 * @param {{center: {lat: number, lng: number}, zoom: number}} options.view what the map shows to begin with
 * @param {string} options.lang `zh` or `en`
 * @param {function({lat: number, lng: number}): void} options.onPick called with the point the person picked (a click, or the pin dropped)
 * @param {Object} [deps] what is replaced in the tests
 * @returns {Promise<{setPoint: Function, search: Function, destroy: Function}>} the map, see maps/index.js
 */
export async function createLeaflet ({ config, container, view, lang, onPick }, { load = loadLeaflet, request = (...args) => window.fetch(...args) } = {}) {
  const L = await load()
  const map = L.map(container, { center: [view.center.lat, view.center.lng], zoom: view.zoom, worldCopyJump: true, attributionControl: false })
  L.control.attribution({ prefix: false }).addTo(map)
  L.tileLayer(config.tiles.url, {
    maxZoom: config.tiles.maxZoom,
    attribution: attributionHtml(config.tiles.attribution),
    // the admin sends no referrer at all; the tile servers of OpenStreetMap refuse a request that does not say which site it comes from, so these say the site and nothing more
    referrerPolicy: 'origin'
  }).addTo(map)
  let marker = null
  const picked = latlng => onPick(_.pick(latlng.wrap ? latlng.wrap() : latlng, ['lat', 'lng']))
  map.on('click', event => picked(event.latlng))

  return {
    setPoint (point, { pan = true } = {}) {
      if (!point) {
        if (marker) {
          marker.remove()
          marker = null
        }
        return
      }
      if (!marker) {
        marker = L.marker([point.lat, point.lng], {
          draggable: true,
          icon: L.divIcon({ className: 'geo-pin', html: PIN, iconSize: [28, 40], iconAnchor: [14, 40] })
        }).addTo(map)
        marker.on('dragend', () => picked(marker.getLatLng()))
      } else {
        marker.setLatLng([point.lat, point.lng])
      }
      if (pan) {
        map.setView([point.lat, point.lng], Math.max(map.getZoom(), FOUND_ZOOM))
      }
    },
    async search (text) {
      if (!config.search) {
        return null
      }
      const response = await request(searchAddress(config.search.url, text, lang), { headers: { Accept: 'application/json' }, referrerPolicy: 'origin' })
      if (!response.ok) {
        throw new Error(`The search answered ${response.status}`)
      }
      const found = _.find(await response.json(), place => _.isFinite(Number(place.lat)) && _.isFinite(Number(place.lon)))
      return found ? { lat: Number(found.lat), lng: Number(found.lon) } : null
    },
    destroy () {
      if (marker) {
        marker.remove()
        marker = null
      }
      map.remove()
    }
  }
}
