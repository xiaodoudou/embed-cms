import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLeaflet, attributionHtml, searchAddress } from '@u/maps/leaflet'
import { initialView } from '@u/maps'
import MapService from '@s/MapService'
import RequestService from '@s/RequestService'

// The map of the geopoint field, with Leaflet replaced by a small fake: what is asked of it and what comes back from it.

const PARIS = { lat: 48.8566, lng: 2.3522 }
const CONFIG = {
  tiles: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: { text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' }, maxZoom: 19 },
  search: { url: 'https://nominatim.openstreetmap.org/search' }
}

/** @returns {{L: Object, made: Object}} a Leaflet that records what is asked of it */
const fakeLeaflet = () => {
  const made = { markers: [], onMap: {}, zoom: 12 }
  const L = {
    map: (container, options) => {
      const map = {
        container,
        options,
        on: (event, handler) => { made.onMap[event] = handler },
        remove: vi.fn(),
        setView: vi.fn(),
        getZoom: () => made.zoom
      }
      made.map = map
      return map
    },
    control: { attribution: (options) => ({ addTo: () => { made.attributionControl = options } }) },
    tileLayer: (url, options) => {
      made.tiles = { url, options }
      return { addTo: () => { made.tilesAdded = true } }
    },
    divIcon: options => ({ divIcon: options }),
    marker: (latlng, options) => {
      const marker = {
        latlng,
        options,
        handlers: {},
        on (event, handler) { this.handlers[event] = handler },
        addTo () { made.pinAdded = true; return this },
        setLatLng (next) { this.latlng = next },
        getLatLng () { return { lat: this.latlng[0], lng: this.latlng[1] } },
        remove: vi.fn()
      }
      made.markers.push(marker)
      return marker
    }
  }
  return { L, made }
}

describe('initialView', () => {
  it('looks at the point, with the zoom of the field', () => {
    expect(initialView(PARIS, { zoom: 14 })).toEqual({ center: PARIS, zoom: 14 })
  })

  it('looks at the centre of the field when there is no point', () => {
    expect(initialView(undefined, { zoom: 9, center: { lat: 31.2, lng: 121.5 } })).toEqual({ center: { lat: 31.2, lng: 121.5 }, zoom: 9 })
    expect(initialView({ lat: 100, lng: 0 }, { zoom: 9, center: { lat: 31.2, lng: 121.5 } }).center).toEqual({ lat: 31.2, lng: 121.5 })
  })

  it('looks at the world when it has neither', () => {
    expect(initialView(undefined, { zoom: 12 })).toEqual({ center: { lat: 20, lng: 0 }, zoom: 2 })
  })
})

describe('attributionHtml', () => {
  it('writes the credit as a link that opens apart, when there is an address', () => {
    expect(attributionHtml(CONFIG.tiles.attribution)).toBe('<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>')
  })

  it('writes the text alone when there is no address, and nothing when there is no text', () => {
    expect(attributionHtml({ text: '© Example' })).toBe('© Example')
    expect(attributionHtml({ text: '' })).toBe('')
    expect(attributionHtml(undefined)).toBe('')
  })

  it('never lets the text or the address make markup', () => {
    expect(attributionHtml({ text: '<img src=x onerror=alert(1)>', url: 'https://a.example/"><script>' })).toBe('<a href="https://a.example/&quot;&gt;&lt;script&gt;" target="_blank" rel="noopener noreferrer">&lt;img src=x onerror=alert(1)&gt;</a>')
  })
})

describe('searchAddress', () => {
  it('asks for one result as json, in the language of the admin', () => {
    const url = new URL(searchAddress('https://nominatim.openstreetmap.org/search', 'Eiffel Tower', 'en'))
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({ format: 'jsonv2', limit: '1', 'accept-language': 'en', q: 'Eiffel Tower' })
    expect(new URL(searchAddress('https://nominatim.openstreetmap.org/search', '上海', 'zh')).searchParams.get('accept-language')).toBe('zh-CN')
  })

  it('keeps what the address already says, and writes the text so that it cannot add to the question', () => {
    const url = new URL(searchAddress('https://search.example.com/find?key=abc', 'a&limit=50#x', 'en'))
    expect(url.searchParams.get('key')).toBe('abc')
    expect(url.searchParams.get('q')).toBe('a&limit=50#x')
    expect(url.searchParams.get('limit')).toBe('1')
  })
})

describe('the map of Leaflet', () => {
  let L, made, onPick, adapter, request
  const open = async (config = CONFIG, view = { center: PARIS, zoom: 12 }, lang = 'en') => {
    ;({ L, made } = fakeLeaflet())
    onPick = vi.fn()
    request = vi.fn()
    adapter = await createLeaflet({ config, container: document.createElement('div'), view, lang, onPick }, { load: async () => L, request })
    return adapter
  }

  it('draws the map where the view says, with the credit of the tile server only', async () => {
    await open()
    expect(made.map.options).toMatchObject({ center: [PARIS.lat, PARIS.lng], zoom: 12, attributionControl: false })
    expect(made.attributionControl).toEqual({ prefix: false })
  })

  it('draws the tiles of the server, with the zoom and the credit, and says which site asks', async () => {
    await open()
    expect(made.tiles.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(made.tiles.options).toMatchObject({ maxZoom: 19, referrerPolicy: 'origin' })
    expect(made.tiles.options.attribution).toContain('OpenStreetMap contributors')
    expect(made.tilesAdded).toBe(true)
  })

  it('gives a click as a point', async () => {
    await open()
    made.onMap.click({ latlng: { lat: 12.5, lng: -7.25, extra: 1 } })
    expect(onPick).toHaveBeenCalledWith({ lat: 12.5, lng: -7.25 })
  })

  it('brings a point of another copy of the world back to this one', async () => {
    await open()
    made.onMap.click({ latlng: { lat: 10, lng: 200, wrap: () => ({ lat: 10, lng: -160 }) } })
    expect(onPick).toHaveBeenCalledWith({ lat: 10, lng: -160 })
  })

  it('puts a pin that can be dragged where the point is, and moves it', async () => {
    await open()
    adapter.setPoint(PARIS, { pan: false })
    expect(made.markers).toHaveLength(1)
    expect(made.markers[0].latlng).toEqual([PARIS.lat, PARIS.lng])
    expect(made.markers[0].options.draggable).toBe(true)
    expect(made.markers[0].options.icon.divIcon.html).toContain('<svg')
    expect(made.pinAdded).toBe(true)
    adapter.setPoint({ lat: 1, lng: 2 }, { pan: false })
    expect(made.markers).toHaveLength(1)
    expect(made.markers[0].latlng).toEqual([1, 2])
    expect(made.map.setView).not.toHaveBeenCalled()
  })

  it('shows what it was told to pan to, close enough to see, and never zooms out', async () => {
    await open()
    made.zoom = 4
    adapter.setPoint(PARIS)
    expect(made.map.setView).toHaveBeenLastCalledWith([PARIS.lat, PARIS.lng], 15)
    made.zoom = 17
    adapter.setPoint(PARIS)
    expect(made.map.setView).toHaveBeenLastCalledWith([PARIS.lat, PARIS.lng], 17)
  })

  it('gives the place where the pin was dropped', async () => {
    await open()
    adapter.setPoint(PARIS, { pan: false })
    made.markers[0].latlng = [3, 4]
    made.markers[0].handlers.dragend()
    expect(onPick).toHaveBeenCalledWith({ lat: 3, lng: 4 })
  })

  it('takes the pin away for no point', async () => {
    await open()
    adapter.setPoint(PARIS, { pan: false })
    adapter.setPoint(null)
    expect(made.markers[0].remove).toHaveBeenCalledTimes(1)
    adapter.setPoint(null)
    expect(made.markers[0].remove).toHaveBeenCalledTimes(1)
    adapter.setPoint(PARIS, { pan: false })
    expect(made.markers).toHaveLength(2)
  })

  it('searches an address and answers its point', async () => {
    await open()
    request.mockResolvedValue({ ok: true, json: async () => [{ lat: '51.5073', lon: '-0.1276', display_name: 'London' }] })
    expect(await adapter.search('London')).toEqual({ lat: 51.5073, lng: -0.1276 })
    const [address, options] = request.mock.calls[0]
    expect(new URL(address).searchParams.get('q')).toBe('London')
    expect(options).toEqual({ headers: { Accept: 'application/json' }, referrerPolicy: 'origin' })
  })

  it('answers nothing when there is no result, or the result has no place in it', async () => {
    await open()
    request.mockResolvedValue({ ok: true, json: async () => [] })
    expect(await adapter.search('nowhere')).toBeNull()
    request.mockResolvedValue({ ok: true, json: async () => [{ lat: 'x', lon: 'y' }] })
    expect(await adapter.search('nowhere')).toBeNull()
    request.mockResolvedValue({ ok: true, json: async () => ({ error: 'x' }) })
    expect(await adapter.search('nowhere')).toBeNull()
  })

  it('fails when the server of the search refuses', async () => {
    await open()
    request.mockResolvedValue({ ok: false, status: 429 })
    await expect(adapter.search('London')).rejects.toThrow('The search answered 429')
  })

  it('searches nothing when the search is turned off', async () => {
    await open({ ...CONFIG, search: null })
    expect(await adapter.search('London')).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('takes the map down with its pin', async () => {
    await open()
    adapter.setPoint(PARIS, { pan: false })
    adapter.destroy()
    expect(made.markers[0].remove).toHaveBeenCalledTimes(1)
    expect(made.map.remove).toHaveBeenCalledTimes(1)
  })

  it('fails when Leaflet cannot be loaded', async () => {
    await expect(createLeaflet({ config: CONFIG, container: document.createElement('div'), view: { center: PARIS, zoom: 1 }, lang: 'en', onPick: () => {} }, { load: async () => { throw new Error('chunk failed') } })).rejects.toThrow('chunk failed')
  })
})

describe('MapService', () => {
  beforeEach(() => {
    MapService.reset()
    vi.restoreAllMocks()
  })

  it('asks the server once and keeps the answer', async () => {
    const get = vi.spyOn(RequestService, 'get').mockResolvedValue({ enabled: true, ...CONFIG })
    const first = await MapService.load()
    const second = await MapService.load()
    expect(first).toBe(second)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toMatch(/maps$/)
  })

  it('answers that there is no map when the server does not answer, and asks again the next time', async () => {
    const get = vi.spyOn(RequestService, 'get').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ enabled: true, ...CONFIG })
    expect(await MapService.load()).toEqual({ enabled: false })
    expect((await MapService.load()).enabled).toBe(true)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
