import { describe, it, expect, vi, beforeEach } from 'vitest'
import RequestService from '@s/RequestService'
import TranslateService from '@s/TranslateService'
import ResourceService from '@s/ResourceService'
import ConfigService from '@s/ConfigService'
import LoginService from '@s/LoginService'
import TranslateFilter from '@f/translate'
import TruncateFilter from '@f/truncate'

const respond = (body, { status = 200, ok = status >= 200 && status < 300 } = {}) => ({
  ok,
  status,
  json: async () => body
})

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('RequestService', () => {
  it('GET returns the parsed json and asks for json', async () => {
    fetchMock.mockResolvedValue(respond({ a: 1 }))
    expect(await RequestService.get('/x')).toEqual({ a: 1 })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/x')
    expect(options.method).toBe('GET')
    expect(options.headers).toMatchObject({ Accept: 'application/json', 'Content-Type': 'application/json' })
  })
  it('POST and PUT send the body as json', async () => {
    fetchMock.mockResolvedValue(respond({}))
    await RequestService.post('/x', { name: 'n' })
    await RequestService.put('/x', { name: 'm' })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"name":"n"}' })
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: '{"name":"m"}' })
  })
  it('DELETE sends its method', async () => {
    fetchMock.mockResolvedValue(respond({}))
    await RequestService.delete('/x')
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  })
  it('does not stringify or set a content type for FormData', async () => {
    fetchMock.mockResolvedValue(respond({}))
    const form = new FormData()
    form.append('f', 'v')
    await RequestService.post('/upload', form)
    const options = fetchMock.mock.calls[0][1]
    expect(options.body).toBe(form)
    expect(options.headers).toBeUndefined()
  })
  it('strips its own returnJson flag before calling fetch', async () => {
    fetchMock.mockResolvedValue(respond({}))
    await RequestService.get('/x')
    expect(fetchMock.mock.calls[0][1]).to.not.have.property('returnJson')
  })
  it('throws the parsed error body for an http error when json is requested', async () => {
    fetchMock.mockResolvedValue(respond({ error: 'boom' }, { status: 500 }))
    await expect(RequestService.get('/x')).rejects.toEqual({ error: 'boom' })
  })
  it('surfaces a non-json error page as a parse error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <') } })
    await expect(RequestService.get('/x')).rejects.toThrow(SyntaxError)
  })
  it('uses a code in the json body over the http status', async () => {
    fetchMock.mockResolvedValue(respond({ code: 403, message: 'no' }, { status: 200 }))
    await expect(RequestService.get('/x')).rejects.toEqual({ code: 403, message: 'no' })
  })
  it('accepts every 2xx code', async () => {
    for (const status of [200, 201, 204, 299]) {
      fetchMock.mockResolvedValue(respond({ ok: true }, { status }))
      expect(await RequestService.get('/x')).toEqual({ ok: true })
    }
  })
  it('returns the raw response, and throws on error statuses, when json is not requested', async () => {
    const good = respond({}, { status: 200 })
    fetchMock.mockResolvedValue(good)
    expect(await RequestService.get('/x', false)).toBe(good)
    const bad = respond({}, { status: 404 })
    fetchMock.mockResolvedValue(bad)
    await expect(RequestService.get('/x', false)).rejects.toBe(bad)
  })
  it('propagates network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'))
    await expect(RequestService.get('/x')).rejects.toThrow('network down')
  })
})

describe('TranslateService', () => {
  beforeEach(() => {
    TranslateService.dict = { enUS: { TL_HELLO: 'Hello {{name}}', TL_PLAIN: 'Plain' }, frFR: { TL_HELLO: 'Bonjour {{name}}' } }
    TranslateService.locale = 'enUS'
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns text that is not a translation key untouched', () => {
    expect(TranslateService.get('Just text')).toBe('Just text')
    expect(TranslateService.get('')).toBe('')
  })
  it('looks a key up in the current locale, case-insensitively', () => {
    expect(TranslateService.get('TL_PLAIN')).toBe('Plain')
    expect(TranslateService.get('tl_plain')).toBe('Plain')
  })
  it('renders parameters into the translation', () => {
    expect(TranslateService.get('TL_HELLO', { name: 'Ana' })).toBe('Hello Ana')
    TranslateService.setLocale('frFR')
    expect(TranslateService.get('TL_HELLO', { name: 'Ana' })).toBe('Bonjour Ana')
  })
  it('does not interpret html in parameters as markup', () => {
    expect(TranslateService.get('TL_HELLO', { name: '<b>x</b>' })).toBe('Hello &lt;b&gt;x&lt;&#x2F;b&gt;')
  })
  it('returns the key itself when there is no translation', () => {
    expect(TranslateService.get('TL_MISSING')).toBe('TL_MISSING')
  })
  it('reads the current locale from a locale object', () => {
    expect(TranslateService.get({ enUS: 'English', frFR: 'Français' })).toBe('English')
    TranslateService.setLocale('frFR')
    expect(TranslateService.get({ enUS: 'English', frFR: 'Français' })).toBe('Français')
    expect(TranslateService.get({ enUS: 'English' })).toBe('')
  })
  it('reads a sub key of a locale object when params is a string', () => {
    expect(TranslateService.get({ enUS: { title: 'T' } }, 'title')).toBe('T')
  })
  it('loads the configured locales on init and survives a locale that fails to load', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('config.json')) return respond({ config: { language: { defaultLocale: 'frFR', locales: ['frFR', 'deDE'] } } })
      if (url.endsWith('frFR.json')) return respond({ TL_OK: 'oui' })
      return respond({}, { status: 404 })
    })
    await TranslateService.init()
    expect(TranslateService.locale).toBe('frFR')
    expect(TranslateService.getLocales()).toEqual(['frFR', 'deDE'])
    expect(TranslateService.dict.frFR).toEqual({ TL_OK: 'oui' })
    expect(TranslateService.dict).to.not.have.property('deDE')
  })
  it('the translate filter passes its arguments through', () => {
    expect(TranslateFilter('TL_HELLO', { name: 'Bo' })).toBe('Hello Bo')
  })
})

describe('Truncate filter', () => {
  it('shortens long text and accepts a numeric string length', () => {
    expect(TruncateFilter('abcdefghij', 5)).toBe('ab...')
    expect(TruncateFilter('abcdefghij', '6')).toBe('abc...')
  })
  it('leaves short text alone', () => {
    expect(TruncateFilter('abc', 10)).toBe('abc')
  })
})

describe('ResourceService', () => {
  beforeEach(() => {
    ResourceService.cacheMap = {}
    ResourceService.paragraphs = {}
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  it('caches a resource and returns it', async () => {
    fetchMock.mockResolvedValue(respond([{ _id: '1' }]))
    expect(await ResourceService.cache('articles')).toEqual([{ _id: '1' }])
    expect(ResourceService.get('articles')).toEqual([{ _id: '1' }])
    expect(fetchMock.mock.calls[0][0]).toMatch(/\.\.\/api\/articles$/)
  })
  it('returns undefined for a resource that was never cached', () => {
    expect(ResourceService.get('nothing')).toBeUndefined()
  })
  it('reloads the page when the server says the user was logged out', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, pathname: '/' })
    fetchMock.mockResolvedValue(respond({ userLoggedOut: true }))
    expect(await ResourceService.cache('articles')).toEqual([])
    expect(reload).toHaveBeenCalled()
    expect(ResourceService.cacheMap).to.not.have.property('articles')
    vi.unstubAllGlobals()
  })
  it('indexes paragraph schemas by title', async () => {
    fetchMock.mockResolvedValue(respond([{ title: 'text', schema: [] }, { title: 'image', schema: [1] }]))
    await ResourceService.getAllParagraphs()
    expect(ResourceService.getParagraphSchema('image')).toEqual({ title: 'image', schema: [1] })
    expect(ResourceService.getParagraphSchema('nope')).toBe(false)
  })
  it('finds a resource schema by title', () => {
    ResourceService.setSchemas([{ title: 'a', n: 1 }, { title: 'b', n: 2 }])
    expect(ResourceService.getSchema('b')).toEqual({ title: 'b', n: 2 })
    expect(ResourceService.getSchema('c')).toBeUndefined()
  })
  it('asks for attachments when listing every resource', async () => {
    fetchMock.mockResolvedValue(respond([]))
    await ResourceService.getAll()
    expect(fetchMock.mock.calls[0][0]).toMatch(/resources\?listAttachments=true$/)
  })
})

describe('ConfigService', () => {
  it('loads the config from the server', async () => {
    fetchMock.mockResolvedValue(respond({ version: '1.2.3' }))
    await ConfigService.init()
    expect(ConfigService.config).toEqual({ version: '1.2.3' })
  })
  it('keeps the previous config and does not throw when the request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ConfigService.config = { kept: true }
    fetchMock.mockRejectedValue(new Error('down'))
    await ConfigService.init()
    expect(ConfigService.config).toEqual({ kept: true })
  })
})

describe('LoginService', () => {
  beforeEach(() => {
    LoginService.user = null
    LoginService.logoutCallbackList = []
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('checkPermission looks at the modules of the user group', () => {
    LoginService.user = { group: { modules: ['articles', 'users'] } }
    expect(LoginService.checkPermission('users')).toBe(true)
    expect(LoginService.checkPermission('billing')).toBe(false)
  })
  it('getPlugins returns the plugins of the group the user belongs to', async () => {
    LoginService.user = { group: 'editors' }
    fetchMock.mockResolvedValue(respond([{ name: 'admins', plugins: ['a'] }, { name: 'editors', plugins: ['xlsx'] }]))
    expect(await LoginService.getPlugins()).toEqual(['xlsx'])
  })
  it('getPlugins is empty for an unknown group', async () => {
    LoginService.user = { group: 'ghosts' }
    fetchMock.mockResolvedValue(respond([{ name: 'admins', plugins: ['a'] }]))
    expect(await LoginService.getPlugins()).toEqual([])
  })
  it('getStatus stores and returns the current user', async () => {
    vi.stubGlobal('location', { ...window.location, reload: vi.fn(), pathname: '/' })
    fetchMock.mockResolvedValue(respond({ username: 'ana', uptime: 1 }))
    expect(await LoginService.getStatus()).toMatchObject({ username: 'ana' })
    expect(LoginService.user).toMatchObject({ username: 'ana' })
    vi.unstubAllGlobals()
  })
  it('getStatus returns null instead of throwing when the server is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    expect(await LoginService.getStatus()).toBeNull()
  })
  it('logout clears the user, calls the server, reloads and runs the callbacks', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, pathname: '/' })
    fetchMock.mockResolvedValue(respond({}))
    const callback = vi.fn()
    LoginService.onLogout(callback)
    LoginService.user = { username: 'ana' }
    await LoginService.logout()
    expect(LoginService.user).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toMatch(/logout$/)
    expect(reload).toHaveBeenCalled()
    expect(callback).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('logout still clears the user and runs callbacks when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    const callback = vi.fn()
    LoginService.onLogout(callback)
    LoginService.user = { username: 'ana' }
    await LoginService.logout()
    expect(LoginService.user).toBeNull()
    expect(callback).toHaveBeenCalled()
  })
  it('changeTheme flips the theme, notifies listeners and tells the server', async () => {
    fetchMock.mockResolvedValue(respond({}))
    const listener = vi.fn()
    LoginService.events.on('changed-theme', listener)
    LoginService.user = { theme: 'dark' }
    expect(await LoginService.changeTheme()).toBe('light')
    expect(listener).toHaveBeenCalledWith('light')
    expect(fetchMock.mock.calls[0][0]).toMatch(/changeTheme\/light$/)
    expect(LoginService.user.theme).toBe('light')
  })
})
