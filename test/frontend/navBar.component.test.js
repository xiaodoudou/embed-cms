import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import NavBar from '@c/NavBar.vue'
import ResourceService from '@s/ResourceService'
import NotificationsService from '@s/NotificationsService'
import { mountComponent } from './helpers/mountField.js'
import { groupedList, products } from './helpers/navFixtures.js'

vi.mock('@s/ResourceService', async () => {
  const { default: Emitter } = await import('tiny-emitter')
  return { default: { cache: vi.fn(), get: vi.fn(), menuIcons: vi.fn(() => ({})), events: new Emitter() } }
})

// the system menu is a component of its own (SystemInfo has its own tests); the shortcut directive is registered by the app
const SystemInfo = { name: 'SystemInfo', props: ['config', 'settingsData'], template: '<div class="system-info-stub" />' }
const shortkey = { mounted () {}, updated () {} }

let wrapper
let selectResource
const bar = async (props = {}, slots = {}) => {
  selectResource = vi.fn()
  wrapper = mountComponent(NavBar, {
    props: { groupedList: groupedList(), selectedItem: {}, selectResourceCallback: selectResource, config: { version: '2.6.1' }, ...props },
    slots,
    global: { components: { SystemInfo }, directives: { shortkey }, stubs: { SystemInfo } },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}
const omnibarOpen = () => wrapper.findComponent({ name: 'Omnibar' }).vm.showOmnibar
const press = (init, target = document) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

beforeEach(() => {
  ResourceService.cache.mockReset().mockResolvedValue([])
  ResourceService.get.mockReset().mockReturnValue([])
  document.title = 'node-cms'
})
afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('NavBar (the top bar)', () => {
  describe('the brand', () => {
    it('shows the Node CMS mark when the settings have no logo or title', async () => {
      await bar()
      expect(wrapper.find('.brand .brand-logo').exists()).toBe(true)
      expect(wrapper.find('.brand .logo').exists()).toBe(false)
    })

    it('shows the title from the settings', async () => {
      ResourceService.cache.mockResolvedValue([{ title: 'Acme CMS' }])
      await bar()
      expect(wrapper.find('.brand-title').text()).toBe('Acme CMS')
    })

    it('shows the logo from the settings in front of the title', async () => {
      ResourceService.cache.mockResolvedValue([{ title: 'Acme CMS', logo: [{ url: '/api/_settings/1/attachments/2' }] }])
      await bar()
      const logo = wrapper.get('.brand img.logo')
      expect(logo.attributes('src')).toBe('/api/_settings/1/attachments/2')
      expect(logo.attributes('alt')).toBe('Acme CMS')
      expect(wrapper.find('.brand-title').exists()).toBe(false)
    })

    it('keeps the mark when the settings cannot be read, and says so', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      ResourceService.cache.mockRejectedValue(new Error('down'))
      await bar()
      expect(wrapper.find('.brand .brand-logo').exists()).toBe(true)
      expect(error).toHaveBeenCalled()
    })

    it('follows the settings when they are saved', async () => {
      await bar()
      expect(wrapper.find('.brand-title').exists()).toBe(false)
      ResourceService.get.mockReturnValue([{ title: 'Renamed' }])
      ResourceService.events.emit('cached', '_settings')
      await flushPromises()
      expect(wrapper.find('.brand-title').text()).toBe('Renamed')
    })

    it('ignores other resources being loaded', async () => {
      await bar()
      ResourceService.get.mockReturnValue([{ title: 'Not it' }])
      ResourceService.events.emit('cached', 'products')
      await flushPromises()
      expect(wrapper.find('.brand-title').exists()).toBe(false)
    })

    it('shrinks its brand next to the collapsed rail', async () => {
      await bar({ rail: true })
      expect(wrapper.get('.brand').classes()).toContain('rail')
    })
  })

  describe('the menu button', () => {
    it('asks the app to open or close the navigation, and says whether it is open', async () => {
      await bar()
      const button = wrapper.get('#cms-nav-toggle')
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(button.attributes('aria-controls')).toBe('cms-nav')
      await button.trigger('click')
      expect(wrapper.emitted('toggle-nav')).toHaveLength(1)
      await wrapper.setProps({ navOpen: true })
      expect(button.attributes('aria-expanded')).toBe('true')
    })
  })

  describe('the system menu and the actions', () => {
    it('hands the configuration and the settings to the system menu', async () => {
      ResourceService.cache.mockResolvedValue([{ title: 'Acme' }])
      await bar()
      const info = wrapper.findComponent({ name: 'SystemInfo' })
      expect(info.props('config')).toEqual({ version: '2.6.1' })
      expect(info.props('settingsData')).toMatchObject({ title: 'Acme' })
    })

    it('has no system menu before the configuration is known', async () => {
      await bar({ config: false })
      expect(wrapper.find('.system-info-stub').exists()).toBe(false)
    })

    it('shows what the app puts in its slot, next to the search button', async () => {
      await bar({}, { default: '<span class="locale-stub">EN</span>' })
      expect(wrapper.get('.nav-bar-actions .locale-stub').text()).toBe('EN')
    })
  })

  describe('the quick switcher', () => {
    it('has a search button that names its shortcut', async () => {
      await bar()
      const button = wrapper.get('.search-trigger')
      expect(button.attributes('aria-label')).toBe('Search resources')
      expect(button.get('.search-hint').text()).toBe('Ctrl K')
    })

    it('names the Command key on a Mac', async () => {
      vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
      await bar()
      expect(wrapper.get('.search-hint').text()).toBe('⌘ K')
    })

    it('opens with the button', async () => {
      await bar()
      expect(omnibarOpen()).toBe(false)
      await wrapper.get('.search-trigger').trigger('click')
      await flushPromises()
      expect(omnibarOpen()).toBe(true)
    })

    it('opens and closes with Ctrl+K, and keeps the browser from using the shortcut', async () => {
      await bar()
      const first = press({ key: 'k', ctrlKey: true })
      expect(first.defaultPrevented).toBe(true)
      expect(omnibarOpen()).toBe(true)
      press({ key: 'k', ctrlKey: true })
      expect(omnibarOpen()).toBe(false)
    })

    it('opens with Cmd+K, and with a capital K', async () => {
      await bar()
      press({ key: 'K', metaKey: true })
      expect(omnibarOpen()).toBe(true)
    })

    it('works while a field has the focus', async () => {
      await bar()
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      press({ key: 'k', ctrlKey: true }, input)
      expect(omnibarOpen()).toBe(true)
    })

    it.each([
      ['Ctrl+Shift+K', { key: 'k', ctrlKey: true, shiftKey: true }],
      ['Ctrl+Alt+K', { key: 'k', ctrlKey: true, altKey: true }],
      ['K alone', { key: 'k' }],
      ['Ctrl+J', { key: 'j', ctrlKey: true }]
    ])('leaves %s to the browser', async (name, init) => {
      await bar()
      const event = press(init)
      expect(event.defaultPrevented).toBe(false)
      expect(omnibarOpen()).toBe(false)
    })

    it('opens when another part of the app asks (the collapsed rail)', async () => {
      await bar()
      NotificationsService.openOmnibar()
      await flushPromises()
      expect(omnibarOpen()).toBe(true)
    })

    it('opens the resource that is chosen in it', async () => {
      await bar()
      await wrapper.get('.search-trigger').trigger('click')
      await flushPromises()
      const omnibar = wrapper.findComponent({ name: 'Omnibar' })
      omnibar.vm.search = 'products'
      await flushPromises()
      omnibar.vm.selectResult(0)
      expect(selectResource.mock.calls[0][0].title).toBe(products.title)
    })

    it('stops listening for the shortcut when it goes away', async () => {
      await bar()
      wrapper.unmount()
      wrapper = undefined
      const event = press({ key: 'k', ctrlKey: true })
      expect(event.defaultPrevented).toBe(false)
    })
  })

  it('names the open resource from its display name, or its name', async () => {
    await bar({ selectedItem: { displayname: { enUS: 'Products' }, name: 'products' } })
    expect(wrapper.vm.getSelectedItemName()).toBe('Products')
    wrapper.unmount()
    await bar({ selectedItem: { name: 'raw' } })
    expect(wrapper.vm.getSelectedItemName()).toBe('raw')
  })
})
