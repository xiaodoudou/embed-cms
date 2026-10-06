const { expect } = require('chai')
const { DEFAULTS, normalizeMaps, publicMaps, cspSources } = require('../../lib/util/maps')
const securityHeaders = require('../../lib/util/securityHeaders')
const logger = require('../../lib/logger')

const TILES = 'https://tiles.example.com/{z}/{x}/{y}.png?key=abc123'

/** Runs a function with the warnings of the logger kept, answers them. */
const warnings = (fn) => {
  const said = []
  const warn = logger.warn
  logger.warn = (...args) => said.push(args.join(' '))
  try {
    fn()
  } finally {
    logger.warn = warn
  }
  return said
}

/** The policy a request to a CMS configured with these settings gets. */
const policyOf = (settings) => {
  const headers = {}
  securityHeaders(settings)({ secure: false }, { setHeader: (name, value) => { headers[name] = value }, writeHead () {}, removeHeader () {} }, () => {})
  return headers['Content-Security-Policy']
}

describe('maps option (unit)', () => {
  describe('normalizeMaps', () => {
    it('uses OpenStreetMap when nothing is said', () => {
      for (const option of [undefined, null, true, {}, 'osm']) {
        expect(normalizeMaps(option), String(option)).to.deep.equal(DEFAULTS)
      }
      expect(DEFAULTS.tiles.url).to.equal('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
      expect(DEFAULTS.tiles.attribution.text).to.include('OpenStreetMap')
    })

    it('answers a copy, so that nobody changes the defaults', () => {
      const first = normalizeMaps(undefined)
      first.tiles.url = 'https://evil.example.com/{z}/{x}/{y}.png'
      expect(normalizeMaps(undefined).tiles.url).to.equal(DEFAULTS.tiles.url)
      expect(DEFAULTS.tiles.url).to.equal('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    })

    it('has no map when it is turned off', () => {
      expect(normalizeMaps(false)).to.equal(null)
    })

    it('takes the tile server and the search that are given, with the attribution of that server', () => {
      const maps = normalizeMaps({
        tiles: { url: TILES, attribution: { text: '© Example Maps', url: 'https://example.com/legal' }, maxZoom: 17 },
        search: { url: 'https://search.example.com/find' }
      })
      expect(maps.tiles).to.deep.equal({ url: TILES, attribution: { text: '© Example Maps', url: 'https://example.com/legal' }, maxZoom: 17 })
      expect(maps.search).to.deep.equal({ url: 'https://search.example.com/find' })
    })

    it('reads the attribution as a text, and says none for a server that gives none', () => {
      expect(normalizeMaps({ tiles: { url: TILES, attribution: '© Example' } }).tiles.attribution).to.deep.equal({ text: '© Example' })
      expect(normalizeMaps({ tiles: { url: TILES } }).tiles.attribution).to.deep.equal({ text: '' })
    })

    it('keeps the OpenStreetMap search when only the tiles are given, and the other way round', () => {
      expect(normalizeMaps({ tiles: { url: TILES } }).search).to.deep.equal(DEFAULTS.search)
      expect(normalizeMaps({ search: { url: 'https://search.example.com/find' } }).tiles).to.deep.equal(DEFAULTS.tiles)
    })

    it('turns the search off', () => {
      expect(normalizeMaps({ search: false }).search).to.equal(null)
    })

    it('takes an address on this machine over http, and no other http', () => {
      expect(normalizeMaps({ tiles: { url: 'http://localhost:8080/{z}/{x}/{y}.png' } }).tiles.url).to.equal('http://localhost:8080/{z}/{x}/{y}.png')
      const said = warnings(() => {
        expect(normalizeMaps({ tiles: { url: 'http://tiles.example.com/{z}/{x}/{y}.png' } }).tiles.url).to.equal(DEFAULTS.tiles.url)
      })
      expect(said).to.have.length(1)
    })

    it('falls back to the defaults for an address that is not right, and says so once', () => {
      const bad = { tiles: { url: 'https://tiles.example.com/tile.png' }, search: { url: 'javascript:alert(1)' } }
      const said = warnings(() => {
        expect(normalizeMaps(bad).tiles.url).to.equal(DEFAULTS.tiles.url)
        expect(normalizeMaps(bad).search.url).to.equal(DEFAULTS.search.url)
      })
      expect(said).to.have.length(2)
      expect(said[0]).to.include('maps.tiles.url')
      expect(said[1]).to.include('maps.search.url')
    })

    it('refuses addresses and texts that could carry markup or another place', () => {
      for (const url of ['https://tiles.example.com/{z}/{x}/{y}.png"><script>', 'https://tiles.example.com/{z}/{x}/{y} .png', 'https://user@tiles.example.com/{z}/{x}/{y}.png', 'ftp://tiles.example.com/{z}/{x}/{y}.png', '//tiles.example.com/{z}/{x}/{y}.png', 'data:text/html,{z}{x}{y}']) {
        warnings(() => expect(normalizeMaps({ tiles: { url } }).tiles.url, url).to.equal(DEFAULTS.tiles.url))
      }
      expect(normalizeMaps({ tiles: { url: TILES, attribution: '<img src=x onerror=alert(1)>' } }).tiles.attribution).to.deep.equal({ text: '' })
      expect(normalizeMaps({ tiles: { url: TILES, attribution: { text: 'ok', url: 'javascript:alert(1)' } } }).tiles.attribution).to.deep.equal({ text: 'ok' })
      warnings(() => expect(normalizeMaps({ search: { url: 'https://search.example.com/{z}' } }).search.url).to.equal(DEFAULTS.search.url))
    })

    it('keeps the zoom the tiles have within what makes sense', () => {
      expect(normalizeMaps({ tiles: { url: TILES, maxZoom: 99 } }).tiles.maxZoom).to.equal(22)
      expect(normalizeMaps({ tiles: { url: TILES, maxZoom: 'x' } }).tiles.maxZoom).to.equal(DEFAULTS.tiles.maxZoom)
    })
  })

  describe('publicMaps', () => {
    it('tells the admin there is no map when it is turned off', () => {
      expect(publicMaps(null)).to.deep.equal({ enabled: false })
    })

    it('tells the admin the tiles and the search', () => {
      expect(publicMaps(normalizeMaps(undefined))).to.deep.equal({ enabled: true, tiles: DEFAULTS.tiles, search: DEFAULTS.search })
      expect(publicMaps(normalizeMaps({ search: false })).search).to.equal(null)
    })
  })

  describe('content security policy', () => {
    it('is the strict default text when no map is given to it', () => {
      expect(policyOf({})).to.equal(securityHeaders.DEFAULT_CSP)
      expect(policyOf({ maps: null })).to.equal(securityHeaders.DEFAULT_CSP)
      expect(cspSources(null)).to.deep.equal({})
    })

    it('lets through the tile server as images and the search as requests, and nothing else', () => {
      const csp = policyOf({ maps: normalizeMaps(undefined) })
      expect(csp).to.include('img-src \'self\' data: blob: https://tile.openstreetmap.org;')
      expect(csp).to.include('connect-src \'self\' ws: wss: https://nominatim.openstreetmap.org;')
      expect(csp).to.include('script-src \'self\';')
      expect(csp).to.not.match(/unsafe-eval|script-src[^;]*unsafe-inline|script-src[^;]* \*( |;|$)/)
    })

    it('lets through the servers that are given, and not the OpenStreetMap ones', () => {
      const csp = policyOf({ maps: normalizeMaps({ tiles: { url: TILES }, search: { url: 'https://search.example.com:8443/find' } }) })
      expect(csp).to.include('https://tiles.example.com')
      expect(csp).to.include('https://search.example.com:8443')
      expect(csp).to.not.include('openstreetmap')
    })

    it('lets through no search when it is off', () => {
      const csp = policyOf({ maps: normalizeMaps({ search: false }) })
      expect(csp).to.not.include('nominatim')
      expect(csp).to.include('https://tile.openstreetmap.org')
    })

    it('keeps the rest of the policy strict, each directive once', () => {
      const csp = policyOf({ maps: normalizeMaps(undefined) })
      expect(csp).to.include('default-src \'self\'')
      expect(csp).to.include('object-src \'none\'')
      expect(csp).to.include('frame-ancestors \'self\'')
      const names = csp.split('; ').map(directive => directive.split(' ')[0])
      expect(names).to.have.length(new Set(names).size)
    })

    it('uses a policy that is given as it is', () => {
      expect(policyOf({ contentSecurityPolicy: 'default-src \'none\'', maps: normalizeMaps(undefined) })).to.equal('default-src \'none\'')
      expect(policyOf({ contentSecurityPolicy: false, maps: normalizeMaps(undefined) })).to.equal(undefined)
    })
  })
})
