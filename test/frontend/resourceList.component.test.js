import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ResourceList from '@c/ResourceList.vue'
import ResourceService from '@s/ResourceService'
import { mountComponent } from './helpers/mountField.js'
import { groupedList, products, pages, settings, notes } from './helpers/navFixtures.js'

vi.mock('@s/ResourceService', async () => {
  const { default: Emitter } = await import('tiny-emitter')
  return { default: { menuIcons: vi.fn(() => ({})), events: new Emitter() } }
})

// up to three groups are all open by default: this menu has Shop, Content and Settings
const few = () => groupedList().slice(1)

let wrapper
let selectResource
const list = async (props = {}) => {
  selectResource = vi.fn()
  wrapper = mountComponent(ResourceList, {
    props: { groupedList: groupedList(), selectedItem: {}, selectResourceCallback: selectResource, autoSelect: false, ...props },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}
const headings = () => wrapper.findAll('.group-title').map((title) => title.text())
const group = (title) => wrapper.findAll('.resource-group').find((element) => element.find('.group-title').text() === title)
const isOpen = (title) => group(title).classes().includes('is-open')
const linksOf = (title) => group(title).findAll('.resource-link').map((link) => link.text())
const type = async (text) => {
  await wrapper.get('input.search-input').setValue(text)
  await flushPromises()
}

beforeEach(() => {
  window.localStorage.clear()
  ResourceService.menuIcons.mockReset().mockReturnValue({})
})
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('ResourceList (the expanded sidebar)', () => {
  describe('the groups', () => {
    it('shows the groups in their order with Others last, and the resources of each in alphabetical order', async () => {
      await list()
      expect(headings()).toEqual(['Shop', 'Content', 'Settings', 'Others'])
      expect(linksOf('Shop')).toEqual(['Orders', 'Products', 'Returns'])
      expect(linksOf('Content')).toEqual(['Pages', 'Posts'])
    })

    it('orders names with numbers the way a person would', async () => {
      const numbered = [{ name: { enUS: 'Docs' }, list: ['Part 10', 'Part 2', 'part 1'].map((title) => ({ title, name: title, displayname: { enUS: title }, group: { enUS: 'Docs' } })) }]
      await list({ groupedList: numbered })
      expect(linksOf('Docs')).toEqual(['part 1', 'Part 2', 'Part 10'])
    })

    it('opens every group while there are only a few', async () => {
      await list({ groupedList: few() })
      expect(['Shop', 'Content', 'Settings'].map(isOpen)).toEqual([true, true, true])
    })

    it('opens only the group of the open resource (Others, when it has none) once there are four', async () => {
      await list()
      expect(['Shop', 'Content', 'Settings', 'Others'].map(isOpen)).toEqual([false, false, false, true])
    })

    it('opens only the group of the open resource when there are many', async () => {
      const many = Array.from({ length: 5 }, (_, i) => ({ name: { enUS: `G${i}` }, list: [{ title: `r${i}`, name: `r${i}`, displayname: { enUS: `R${i}` }, group: { enUS: `G${i}` } }, { title: `s${i}`, name: `s${i}`, displayname: { enUS: `S${i}` }, group: { enUS: `G${i}` } }] }))
      await list({ groupedList: many, selectedItem: many[2].list[0] })
      expect(many.map((g, i) => isOpen(`G${i}`))).toEqual([false, false, true, false, false])
    })

    it('opens and closes a group when its heading is clicked, and remembers it', async () => {
      await list({ groupedList: few() })
      await group('Shop').get('.group-toggle').trigger('click')
      expect(isOpen('Shop')).toBe(false)
      expect(JSON.parse(window.localStorage.getItem('node-cms.nav.groups'))).toMatchObject({ shop: false })
      wrapper.unmount()
      await list({ groupedList: few() })
      expect(isOpen('Shop')).toBe(false)
      expect(isOpen('Content')).toBe(true)
    })

    it('tells assistive technology which groups are open', async () => {
      await list({ groupedList: few() })
      const toggle = group('Shop').get('.group-toggle')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('false')
    })

    it('closes every group, then opens every group, with the button at the top', async () => {
      await list({ groupedList: few() })
      const button = () => wrapper.get('.nav-head .nav-tool')
      await button().trigger('click')
      expect(['Shop', 'Content', 'Settings'].map(isOpen)).toEqual([false, false, false])
      await button().trigger('click')
      expect(['Shop', 'Content', 'Settings'].map(isOpen)).toEqual([true, true, true])
    })

    it('shows a dot on a closed group that holds the open resource', async () => {
      await list({ selectedItem: pages })
      await group('Content').get('.group-toggle').trigger('click')
      expect(group('Content').find('.group-current-dot').exists()).toBe(true)
      expect(group('Shop').find('.group-current-dot').exists()).toBe(false)
    })

    it('shows the image chosen in Settings next to the group name', async () => {
      ResourceService.menuIcons.mockReturnValue({ Shop: '/api/_settings/1/attachments/2' })
      await list()
      expect(group('Shop').find('img.group-image').attributes('src')).toBe('/api/_settings/1/attachments/2')
      expect(group('Content').find('img').exists()).toBe(false)
    })
  })

  describe('the resources', () => {
    it('opens a resource when it is clicked', async () => {
      await list()
      await group('Shop').findAll('.resource-link')[1].trigger('click')
      expect(selectResource).toHaveBeenCalledWith(products)
    })

    it('marks the open resource', async () => {
      await list({ selectedItem: products })
      expect(group('Shop').findAll('.resource-link.selected').map((link) => link.text())).toEqual(['Products'])
      expect(group('Shop').find('.resource-link.selected').attributes('aria-current')).toBeDefined()
    })

    it('marks an open plugin by its component, not by identity', async () => {
      const plugin = { title: 'Syslog', name: 'Syslog', displayname: 'Syslog', type: 'plugin', pluginComponent: 'Syslog', group: { enUS: 'System' } }
      await list({ groupedList: [{ name: { enUS: 'System' }, list: [plugin] }], selectedItem: { ...plugin } })
      expect(wrapper.find('.resource-link.selected').exists()).toBe(true)
    })

    it('opens the first resource of the first group by itself when nothing is open and it is asked to', async () => {
      await list({ autoSelect: true })
      await flushPromises()
      expect(selectResource).toHaveBeenCalledTimes(1)
      expect(selectResource.mock.calls[0][0].title).toBe(notes.title)
    })

    it('leaves the open resource alone when it is asked to open one', async () => {
      await list({ autoSelect: true, selectedItem: settings })
      expect(selectResource).not.toHaveBeenCalled()
    })

    it('opens the group of a resource that becomes the open one (a link, the switcher, the breadcrumb)', async () => {
      await list({ groupedList: groupedList().concat([{ name: { enUS: 'Extra' }, list: [{ title: 'x', name: 'x', displayname: { enUS: 'X' }, group: { enUS: 'Extra' } }] }]) })
      expect(isOpen('Shop')).toBe(false)
      await wrapper.setProps({ selectedItem: products })
      expect(isOpen('Shop')).toBe(true)
    })
  })

  describe('the filter', () => {
    it('keeps the resources whose name contains the text, in any case, and opens their groups', async () => {
      await list({ groupedList: few() })
      await group('Content').get('.group-toggle').trigger('click')
      expect(isOpen('Content')).toBe(false)
      await type('PO')
      expect(headings()).toEqual(['Content'])
      expect(linksOf('Content')).toEqual(['Posts'])
      expect(isOpen('Content')).toBe(true)
    })

    it('underlines what matched', async () => {
      await list()
      await type('ord')
      expect(group('Shop').find('.resource-link mark').text().toLowerCase()).toBe('ord')
    })

    it('says how many resources match', async () => {
      await list()
      await type('pages')
      expect(wrapper.get('.nav-empty').text()).toMatch(/1/)
      await type('p')
      expect(wrapper.get('.nav-empty').text()).toMatch(/\d/)
    })

    it('says so when nothing matches, and shows no group', async () => {
      await list()
      await type('zzz')
      expect(wrapper.get('.nav-empty').text()).toContain('No')
      expect(headings()).toEqual([])
    })

    it('has no expand all button while it filters', async () => {
      await list()
      expect(wrapper.find('.nav-head .nav-tool').exists()).toBe(true)
      await type('o')
      expect(wrapper.find('.nav-head .nav-tool').exists()).toBe(false)
    })
  })

  describe('showing where you are', () => {
    it('opens the group of the open resource and highlights it for a moment', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      await list({ selectedItem: pages })
      await group('Content').get('.group-toggle').trigger('click')
      expect(isOpen('Content')).toBe(false)
      await wrapper.vm.locate()
      await flushPromises()
      expect(isOpen('Content')).toBe(true)
      expect(wrapper.find('.resource-link.selected.locating').exists()).toBe(true)
      vi.advanceTimersByTime(2000)
      await flushPromises()
      expect(wrapper.find('.resource-link.locating').exists()).toBe(false)
      vi.useRealTimers()
    })

    it('highlights the group while the pointer is on its crumb of the breadcrumb', async () => {
      await list({ selectedItem: pages, crumbHint: 'group' })
      expect(group('Content').find('.group-toggle').classes()).toContain('locating')
      expect(group('Shop').find('.group-toggle').classes()).not.toContain('locating')
    })

    it('highlights the resource while the pointer is on its crumb', async () => {
      await list({ selectedItem: pages, crumbHint: 'resource' })
      expect(group('Content').find('.resource-link.selected').classes()).toContain('locating')
    })
  })

  describe('the keyboard', () => {
    it('moves between the headings and the resources with the arrow keys, and Home and End', async () => {
      await list()
      const focusable = () => [...wrapper.element.querySelectorAll('button.group-toggle, button.resource-link, button.nav-tool')]
      // jsdom has no layout: every button counts as shown
      const spy = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body)
      const first = focusable()[0]
      first.focus()
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(focusable()[1])
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(focusable()[focusable().length - 1])
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(focusable()[0])
      spy.mockRestore()
    })
  })

  describe('the buttons at the top', () => {
    it('asks the app to collapse the sidebar, only when it can be', async () => {
      await list()
      expect(wrapper.find('button[aria-controls="cms-nav"]').exists()).toBe(false)
      wrapper.unmount()
      await list({ collapsible: true })
      await wrapper.get('button[aria-controls="cms-nav"]').trigger('click')
      expect(wrapper.emitted('collapse')).toHaveLength(1)
    })
  })

  it('refreshes the group images when the settings are loaded', async () => {
    await list()
    ResourceService.menuIcons.mockReturnValue({ Shop: '/img/shop.png' })
    ResourceService.events.emit('cached', '_settings')
    await flushPromises()
    expect(group('Shop').find('img.group-image').attributes('src')).toBe('/img/shop.png')
  })
})
