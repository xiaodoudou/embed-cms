import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import NavRail from '@c/layout/NavRail.vue'
import NotificationsService from '@s/NotificationsService'
import ResourceService from '@s/ResourceService'
import { mountComponent } from './helpers/mountField.js'
import { groupedList, products, returns, pages, notes } from './helpers/navFixtures.js'

vi.mock('@s/ResourceService', async () => {
  const { default: Emitter } = await import('tiny-emitter')
  return { default: { menuIcons: vi.fn(() => ({})), events: new Emitter() } }
})

let wrapper
let selectResource
const rail = (props = {}) => {
  selectResource = vi.fn()
  wrapper = mountComponent(NavRail, {
    props: { groupedList: groupedList(), selectedItem: {}, selectResourceCallback: selectResource, ...props },
    attachTo: document.body
  })
  return wrapper
}
const badge = (key) => wrapper.get(`[data-group="${key}"]`)
const flyout = () => document.body.querySelector('.rail-flyout')
const flyoutNames = () => [...document.body.querySelectorAll('.rail-flyout-name')].map((name) => name.textContent)
const settle = async () => {
  vi.advanceTimersByTime(500)
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  ResourceService.menuIcons.mockReset().mockReturnValue({})
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('NavRail (the collapsed sidebar)', () => {
  describe('the badges', () => {
    it('has one badge per group, with initials and a label that says how many resources it holds', () => {
      rail()
      expect(badge('shop').text()).toBe('SH')
      expect(badge('shop').attributes('aria-label')).toContain('Shop')
      expect(badge('shop').attributes('aria-label')).toContain('3')
      expect(badge('content').text()).toBe('CO')
    })

    it('gives the same group the same tint every time', () => {
      rail()
      const tint = badge('shop').classes().find((name) => name.startsWith('tint-'))
      wrapper.unmount()
      rail()
      expect(badge('shop').classes()).toContain(tint)
    })

    it('marks the group that holds the open resource as current', () => {
      rail({ selectedItem: pages })
      expect(badge('content').classes()).toContain('current')
      expect(badge('content').attributes('aria-current')).toBeDefined()
      expect(badge('shop').classes()).not.toContain('current')
    })

    it('shows the image chosen in Settings for a group instead of its initials', () => {
      ResourceService.menuIcons.mockReturnValue({ Shop: '/api/_settings/1/attachments/2' })
      rail()
      expect(badge('shop').find('img.rail-image').attributes('src')).toBe('/api/_settings/1/attachments/2')
      expect(badge('content').find('img').exists()).toBe(false)
    })

    it('lists the resources without a group as badges of their own', async () => {
      rail()
      const loose = wrapper.findAll('.rail-loose .rail-badge')
      expect(loose).toHaveLength(1)
      expect(loose[0].attributes('aria-label')).toBe('Notes')
      await loose[0].trigger('click')
      expect(selectResource).toHaveBeenCalledWith(notes)
    })
  })

  describe('a group of one resource is a page', () => {
    it('opens it with a click, without a flyout', async () => {
      rail()
      await badge('settings').trigger('click')
      expect(selectResource).toHaveBeenCalledTimes(1)
      expect(selectResource.mock.calls[0][0].title).toBe('settings')
      expect(flyout()).toBe(null)
      expect(badge('settings').attributes('aria-haspopup')).toBeUndefined()
    })
  })

  describe('the flyout of a group with several resources', () => {
    it('opens on a click and lists the resources in alphabetical order, in front of the page', async () => {
      rail()
      await badge('shop').trigger('click')
      await settle()
      expect(flyout()).not.toBe(null)
      expect(flyout().getAttribute('role')).toBe('menu')
      expect(flyoutNames()).toEqual(['Orders', 'Products', 'Returns'])
      expect(badge('shop').attributes('aria-expanded')).toBe('true')
    })

    it('marks the open resource in the list', async () => {
      rail({ selectedItem: products })
      await badge('shop').trigger('click')
      await settle()
      const selected = [...document.body.querySelectorAll('.rail-flyout-item.selected')].map((item) => item.textContent.trim())
      expect(selected).toEqual(['Products'])
    })

    it('opens the chosen resource and closes', async () => {
      rail()
      await badge('shop').trigger('click')
      await settle()
      document.body.querySelectorAll('.rail-flyout-item')[1].click()
      await settle()
      expect(selectResource).toHaveBeenCalledWith(products)
      expect(flyout()).toBe(null)
    })

    it('closes on a second click on its badge', async () => {
      rail()
      await badge('shop').trigger('click')
      await settle()
      await badge('shop').trigger('click')
      await settle()
      expect(flyout()).toBe(null)
    })

    it('closes on Escape and gives the focus back to its badge', async () => {
      rail()
      await badge('shop').trigger('click')
      await settle()
      flyout().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await settle()
      expect(flyout()).toBe(null)
      expect(document.activeElement).toBe(badge('shop').element)
    })

    it('closes when something else on the page is touched, not when the rail or the flyout is', async () => {
      rail()
      await badge('shop').trigger('click')
      await settle()
      flyout().dispatchEvent(new Event('pointerdown', { bubbles: true }))
      expect(flyout()).not.toBe(null)
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await settle()
      expect(flyout()).toBe(null)
    })

    it('moves between its entries with the arrow keys, wrapping round, and Home and End', async () => {
      rail()
      await badge('shop').trigger('keydown.enter')
      await settle()
      const items = [...document.body.querySelectorAll('.rail-flyout-item')]
      expect(document.activeElement).toBe(items[0])
      flyout().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(items[1])
      flyout().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(items[2])
      flyout().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(items[0])
      flyout().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(items[2])
    })

    it('puts the focus on the open resource when it is opened from the keyboard', async () => {
      rail({ selectedItem: returns })
      await badge('shop').trigger('keydown.enter')
      await settle()
      expect(document.activeElement.textContent).toContain('Returns')
    })
  })

  describe('with the pointer', () => {
    it('opens after a short moment over a badge, and closes shortly after the pointer leaves', async () => {
      rail()
      await badge('shop').trigger('mouseenter')
      expect(flyout()).toBe(null)
      await settle()
      expect(flyout()).not.toBe(null)
      await badge('shop').trigger('mouseleave')
      vi.advanceTimersByTime(100)
      expect(flyout()).not.toBe(null)
      await settle()
      expect(flyout()).toBe(null)
    })

    it('stays open while the pointer is over the flyout', async () => {
      rail()
      await badge('shop').trigger('mouseenter')
      await settle()
      await badge('shop').trigger('mouseleave')
      flyout().dispatchEvent(new Event('mouseenter'))
      await settle()
      expect(flyout()).not.toBe(null)
    })

    it('stays open when it was opened by a click, whatever the pointer does', async () => {
      rail()
      await badge('shop').trigger('click')
      await settle()
      await badge('shop').trigger('mouseleave')
      await settle()
      expect(flyout()).not.toBe(null)
    })

    it('does not open a flyout over a page badge, and closes the one that is open', async () => {
      rail()
      await badge('shop').trigger('mouseenter')
      await settle()
      await badge('settings').trigger('mouseenter')
      await settle()
      expect(flyout()).toBe(null)
    })

    it('moves from one group to the next without waiting', async () => {
      rail()
      await badge('shop').trigger('mouseenter')
      await settle()
      await badge('content').trigger('mouseenter')
      vi.advanceTimersByTime(10)
      await flushPromises()
      expect(flyoutNames()).toEqual(['Pages', 'Posts'])
    })
  })

  describe('the buttons at the top', () => {
    it('asks the app to expand the sidebar', async () => {
      rail()
      await wrapper.get('.rail-top .rail-btn').trigger('click')
      expect(wrapper.emitted('toggle')).toHaveLength(1)
    })

    it('opens the quick switcher, and closes a flyout that was open', async () => {
      rail()
      const opened = vi.fn()
      NotificationsService.events.on('omnibar-open', opened)
      await badge('shop').trigger('click')
      await settle()
      await wrapper.findAll('.rail-top .rail-btn')[1].trigger('click')
      await settle()
      expect(opened).toHaveBeenCalledTimes(1)
      expect(flyout()).toBe(null)
      NotificationsService.events.off('omnibar-open', opened)
    })
  })

  describe('showing where you are', () => {
    it('opens and pins the flyout of the group that holds the open resource', async () => {
      rail({ selectedItem: pages })
      await wrapper.vm.locate()
      await settle()
      expect(flyoutNames()).toEqual(['Pages', 'Posts'])
      expect(badge('content').classes()).toContain('pinned')
    })

    it('does nothing when the open resource has no badge of its own group', async () => {
      rail({ selectedItem: { title: 'unknown' } })
      await wrapper.vm.locate()
      expect(flyout()).toBe(null)
    })
  })

  describe('the rail keyboard', () => {
    it('moves between the buttons with the arrow keys', async () => {
      rail()
      const buttons = wrapper.findAll('button.rail-btn, button.rail-badge')
      buttons[0].element.focus()
      await buttons[0].trigger('keydown', { key: 'ArrowDown' })
      expect(document.activeElement).toBe(buttons[1].element)
    })
  })

  it('stops listening for the settings when it goes away', () => {
    const count = () => (ResourceService.events.e && ResourceService.events.e.cached ? ResourceService.events.e.cached.length : 0)
    const before = count()
    rail()
    expect(count()).toBe(before + 1)
    wrapper.unmount()
    wrapper = undefined
    expect(count()).toBe(before)
  })

  it('refreshes the group images when the settings are loaded', async () => {
    rail()
    expect(badge('shop').find('img').exists()).toBe(false)
    ResourceService.menuIcons.mockReturnValue({ Shop: '/img/shop.png' })
    ResourceService.events.emit('cached', '_settings')
    await flushPromises()
    expect(badge('shop').find('img').attributes('src')).toBe('/img/shop.png')
  })
})
