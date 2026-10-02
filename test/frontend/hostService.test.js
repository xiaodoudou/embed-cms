import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { host, useAdmin } from '@s/HostService'
import RequestService from '@s/RequestService'
import LoginService from '@s/LoginService'
import ConfigService from '@s/ConfigService'
import TranslateService from '@s/TranslateService'
import NotificationsService from '@s/NotificationsService'
import DialogService from '@s/DialogService'

// The host object of the admin (window.embedCms.host): each member is checked against the real service it wraps.

afterEach(() => {
  vi.restoreAllMocks()
  LoginService.user = null
  document.documentElement.removeAttribute('data-theme')
  host.kitSheet = null
})

describe('host.api (the records of a resource over REST)', () => {
  const calls = () => {
    return {
      get: vi.spyOn(RequestService, 'get').mockResolvedValue([]),
      post: vi.spyOn(RequestService, 'post').mockResolvedValue({ _id: 'a' }),
      put: vi.spyOn(RequestService, 'put').mockResolvedValue({ _id: 'a' }),
      delete: vi.spyOn(RequestService, 'delete').mockResolvedValue(true)
    }
  }

  it('lists with a query, a page, a limit and a locale', async () => {
    const { get } = calls()
    await host.api('articles').list({ published: true }, { page: 2, limit: 10, locale: 'enUS' })
    const url = new URL(get.mock.calls[0][0], 'http://localhost')
    expect(url.pathname.endsWith('/../api/articles') || url.pathname.endsWith('/api/articles')).toBe(true)
    expect(JSON.parse(url.searchParams.get('query'))).toEqual({ published: true })
    expect([url.searchParams.get('page'), url.searchParams.get('limit'), url.searchParams.get('locale')]).toEqual(['2', '10', 'enUS'])
  })

  it('lists everything with no parameter at all', async () => {
    const { get } = calls()
    await host.api('articles').list()
    expect(get.mock.calls[0][0]).toMatch(/api\/articles$/)
  })

  it('finds, creates, updates and removes', async () => {
    const { get, post, put, delete: del } = calls()
    const articles = host.api('articles')
    await articles.find('a1')
    await articles.create({ title: 'x' })
    await articles.update('a1', { title: 'y' })
    await articles.remove('a1')
    expect(get.mock.calls[0][0]).toMatch(/api\/articles\/a1$/)
    expect(post.mock.calls[0]).toEqual([expect.stringMatching(/api\/articles$/), { title: 'x' }])
    expect(put.mock.calls[0]).toEqual([expect.stringMatching(/api\/articles\/a1$/), { title: 'y' }])
    expect(del.mock.calls[0][0]).toMatch(/api\/articles\/a1$/)
  })
})

describe('host.fetch', () => {
  it('counts a relative URL from the admin page and sends the login cookie', async () => {
    const fetch = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{}'))
    await host.fetch('../dashboard/summary')
    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toMatch(/\/dashboard\/summary$/)
    expect(init.credentials).toBe('same-origin')
  })
})

describe('host.user and host.can', () => {
  it('shows who is logged in, and nothing else of the user record', () => {
    expect(host.user).toBe(null)
    LoginService.user = { username: 'ana', group: 'editors', language: 'enUS', theme: 'dark', password: 'no', _id: 'x' }
    expect(host.user).toEqual({ username: 'ana', group: 'editors', language: 'enUS', theme: 'dark' })
  })

  it('answers the rights of the group of the person', () => {
    LoginService.user = { username: 'ana', group: 'editors', rights: { read: ['articles', 'authors'], update: ['articles'] } }
    expect(host.can('read', 'authors')).toBe(true)
    expect(host.can('update', 'articles')).toBe(true)
    expect(host.can('update', 'authors')).toBe(false)
    expect(host.can('remove', 'articles')).toBe(false)
  })

  it('says no when nobody is logged in or the rights are not known', () => {
    expect(host.can('read', 'articles')).toBe(false)
    LoginService.user = { username: 'ana', group: 'editors' }
    expect(host.can('read', 'articles')).toBe(false)
  })
})

describe('host.config, host.t and host.locale', () => {
  it('give the configuration, the translations and the language of the admin', () => {
    ConfigService.config = { toolbarTitle: 'Newsroom' }
    expect(host.config.toolbarTitle).toBe('Newsroom')
    TranslateService.dict.enUS = { ...TranslateService.dict.enUS, TL_SAVE: 'Save' }
    expect(host.t('TL_SAVE')).toBe('Save')
    expect(host.locale).toBe(TranslateService.locale)
  })
})

describe('host.notify, host.confirm and host.navigate', () => {
  it('shows a toast through the notifications of the admin', () => {
    const send = vi.spyOn(NotificationsService, 'send').mockImplementation(() => {})
    host.notify('Saved', 'success')
    host.notify('Careful')
    expect(send.mock.calls[0]).toEqual(['Saved', 'success', {}])
    expect(send.mock.calls[1][1]).toBe('info')
  })

  it('asks the shared dialog, which resolves to a boolean', async () => {
    const ask = vi.spyOn(DialogService, 'ask').mockResolvedValue(true)
    expect(await host.confirm({ title: 'Delete?' })).toBe(true)
    expect(ask).toHaveBeenCalledWith({ title: 'Delete?' })
  })

  it('opens a resource, or a record, with the address of the admin', () => {
    host.navigate({ resource: 'articles' })
    expect(window.location.hash).toBe('#/?id=articles')
    host.navigate({ resource: 'articles', record: 'mu1' })
    expect(window.location.hash).toBe('#/?id=articles&record=mu1')
  })
})

describe('host.theme, host.icon and host.kitStyles', () => {
  it('follows the theme of the page and says when it changes', async () => {
    host.start()
    expect(host.theme.mode).toBe('light')
    const changed = vi.fn()
    const stop = host.on('theme:changed', changed)
    document.documentElement.setAttribute('data-theme', 'dark')
    await flushPromises()
    await vi.waitFor(() => expect(host.theme.mode).toBe('dark'))
    expect(changed).toHaveBeenCalledWith('dark')
    stop()
    document.documentElement.setAttribute('data-theme', 'light')
    await vi.waitFor(() => expect(host.theme.mode).toBe('light'))
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('says when the language changes', async () => {
    host.start()
    const changed = vi.fn()
    const stop = host.on('locale:changed', changed)
    const before = TranslateService.locale
    TranslateService.locale = before === 'zhCN' ? 'enUS' : 'zhCN'
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1))
    TranslateService.locale = before
    stop()
  })

  it('draws an icon the admin uses, in currentColor, and nothing for an unknown name', () => {
    const svg = host.icon('lockOutline')
    expect(svg).toMatch(/^<svg class="cms-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M[^"]+"\/><\/svg>$/)
    expect(host.icon('noSuchIcon')).toBe('')
  })

  it('hands over the UI kit as a stylesheet to adopt, fetched once', async () => {
    class FakeSheet {
      replaceSync (css) {
        this.css = css
      }
    }
    vi.stubGlobal('CSSStyleSheet', FakeSheet)
    const fetch = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('.cms-link { color: red; }'))
    const first = await host.kitStyles()
    const second = await host.kitStyles()
    expect(first.css).toContain('.cms-link')
    expect(second).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0][0])).toMatch(/kit\.css$/)
    vi.unstubAllGlobals()
  })

  it('gives null where the browser has no constructable stylesheets', async () => {
    vi.stubGlobal('CSSStyleSheet', function () {})
    expect(await host.kitStyles()).toBe(null)
    vi.unstubAllGlobals()
  })
})

describe('host events and useAdmin', () => {
  it('lets the admin say a record was saved or removed, and a plugin listen and stop', () => {
    const saved = vi.fn()
    const stop = host.on('record:saved', saved)
    host.emit('record:saved', { resource: 'articles', record: { _id: 'a' }, created: true })
    stop()
    host.emit('record:saved', { resource: 'articles', record: { _id: 'b' }, created: false })
    expect(saved).toHaveBeenCalledTimes(1)
    expect(saved.mock.calls[0][0].record._id).toBe('a')
  })

  it('gives the host to a component through useAdmin, even outside the app', () => {
    expect(useAdmin()).toBe(host)
  })

  it('is reachable as this.$admin in an options API component (Vue keeps $host for custom elements)', () => {
    const Page = { template: '<p>{{ seen }}</p>', computed: { seen () { return `${typeof this.$admin}/${typeof this.$host}` } } }
    const wrapper = mount(Page, { global: { config: { globalProperties: { $admin: host, $host: host } } } })
    expect(wrapper.text()).toBe('object/undefined')
  })
})
