import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import Omnibar from '@c/layout/Omnibar.vue'
import NotificationsService from '@s/NotificationsService'
import { mountComponent } from './helpers/mountField.js'
import { groupedList, products, orders, pages, syslog } from './helpers/navFixtures.js'

// the shortcut directive of vue3-shortkey is registered by the app
const shortkey = { mounted () {}, updated () {} }

let wrapper
let selectResource
let statuses
const onStatus = (status) => statuses.push(status)
const menu = () => groupedList().concat([{ name: { enUS: 'System' }, list: [syslog] }])

const omnibar = async (props = {}) => {
  selectResource = vi.fn()
  wrapper = mountComponent(Omnibar, {
    props: { groupedList: menu(), selectedItem: {}, selectResourceCallback: selectResource, ...props },
    global: { directives: { shortkey } },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}
const open = async () => {
  wrapper.vm.showHideOmnibar(true)
  await flushPromises()
}
const field = () => document.body.querySelector('#omnibar input[name=search]')
const typeText = async (text) => {
  field().value = text
  field().dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
const key = async (name, extra = {}) => {
  field().dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...extra }))
  await flushPromises()
}
const rows = () => [...document.body.querySelectorAll('#omnibar-results .list')]
const rowNames = () => rows().map((row) => row.textContent.trim())
const dialog = () => document.body.querySelector('#omnibar [role=dialog]')
const visible = () => dialog() && dialog().style.display !== 'none'

beforeEach(() => {
  statuses = []
  NotificationsService.events.on('omnibar-display-status', onStatus)
})
afterEach(() => {
  NotificationsService.events.off('omnibar-display-status', onStatus)
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('Omnibar (the quick switcher)', () => {
  describe('opening and closing', () => {
    it('is hidden until it is opened, and shows a hint when it opens', async () => {
      await omnibar()
      expect(visible()).toBe(false)
      await open()
      expect(visible()).toBe(true)
      expect(document.body.querySelector('.omnibar-hint')).not.toBe(null)
      expect(dialog().getAttribute('aria-modal')).toBe('true')
    })

    it('focuses the search field when it opens', async () => {
      await omnibar()
      await open()
      expect(document.activeElement).toBe(field())
    })

    it('tells the rest of the app when it opens and closes', async () => {
      await omnibar()
      await open()
      wrapper.vm.showHideOmnibar(false)
      expect(statuses).toEqual([true, false])
    })

    it('closes with Escape, and clears what was typed', async () => {
      await omnibar()
      await open()
      await typeText('pro')
      await key('Escape')
      expect(visible()).toBe(false)
      expect(wrapper.vm.search).toBe('')
    })

    it('closes when the backdrop is clicked', async () => {
      await omnibar()
      await open()
      document.body.querySelector('#omnibar-backdrop').click()
      await flushPromises()
      expect(visible()).toBe(false)
    })

    it('opens with Ctrl+P while it is closed, and leaves the shortcut to the field once it is open', async () => {
      await omnibar()
      expect(wrapper.vm.getShortcuts()).toEqual({ open: ['ctrl', 'p'] })
      wrapper.vm.interactiveSearch({ srcKey: 'open' })
      await flushPromises()
      expect(visible()).toBe(true)
      expect(wrapper.vm.getShortcuts()).toEqual({})
    })

    it('closes with Ctrl+P typed in its field', async () => {
      await omnibar()
      await open()
      await key('p', { ctrlKey: true })
      expect(visible()).toBe(false)
    })
  })

  describe('searching', () => {
    it('finds resources and plugins by name, whatever the case', async () => {
      await omnibar()
      await open()
      await typeText('PRODUCT')
      expect(rowNames()).toEqual(['Products'])
      await typeText('sys')
      expect(rowNames()).toEqual(['Syslog'])
    })

    it('finds a name from its first letters spread out (a fuzzy search)', async () => {
      await omnibar()
      await open()
      await typeText('pgs')
      expect(rowNames()).toContain('Pages')
    })

    it('marks the letters that matched, and cannot be made to run markup', async () => {
      await omnibar()
      await open()
      await typeText('ord')
      expect(rows()[0].querySelector('b')).not.toBe(null)
      expect(rows()[0].querySelector('script')).toBe(null)
    })

    it('says so when nothing matches', async () => {
      await omnibar()
      await open()
      await typeText('zzzzzz')
      expect(rows()).toHaveLength(0)
      expect(document.body.querySelector('.omnibar-empty').textContent).toContain('No results')
    })

    it('shows the hint again when the field is emptied', async () => {
      await omnibar()
      await open()
      await typeText('ord')
      await typeText('')
      expect(rows()).toHaveLength(0)
      expect(document.body.querySelector('.omnibar-hint')).not.toBe(null)
    })

    it('puts the page you are on first', async () => {
      await omnibar({ selectedItem: pages })
      await open()
      await typeText('pa')
      expect(rowNames()[0]).toBe('Pages')
    })

    it('tells apart a resource from a plugin by its icon', async () => {
      await omnibar()
      await open()
      await typeText('s')
      const icons = rows().map((row) => row.querySelector('.v-icon') !== null)
      expect(icons.every(Boolean)).toBe(true)
    })
  })

  describe('choosing', () => {
    it('highlights the first result, moves with the arrow keys and stops at the ends', async () => {
      await omnibar()
      await open()
      await typeText('o')
      expect(rows().length).toBeGreaterThan(2)
      expect(rows()[0].classList.contains('highlighted')).toBe(true)
      await key('ArrowDown')
      expect(rows()[1].classList.contains('highlighted')).toBe(true)
      await key('ArrowUp')
      await key('ArrowUp')
      expect(rows()[0].classList.contains('highlighted')).toBe(true)
      await key('ArrowDown')
      await key('ArrowDown')
      await key('ArrowDown')
      await key('ArrowDown')
      await key('ArrowDown')
      await key('ArrowDown')
      expect(rows()[rows().length - 1].classList.contains('highlighted')).toBe(true)
    })

    it('keeps Tab inside the switcher: it walks the results, and Shift+Tab walks back, instead of leaving for the page behind', async () => {
      await omnibar()
      await open()
      await typeText('o')
      expect(rows().length).toBeGreaterThan(2)
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      field().dispatchEvent(event)
      await flushPromises()
      expect(event.defaultPrevented).toBe(true)
      expect(rows()[1].classList.contains('highlighted')).toBe(true)
      await key('Tab', { shiftKey: true })
      expect(rows()[0].classList.contains('highlighted')).toBe(true)
      expect(visible()).toBe(true)
    })

    it('opens the highlighted result with Enter, and closes', async () => {
      await omnibar()
      await open()
      await typeText('orders')
      await key('Enter')
      expect(selectResource).toHaveBeenCalledTimes(1)
      expect(selectResource.mock.calls[0][0].title).toBe(orders.title)
      expect(visible()).toBe(false)
    })

    it('opens the result that is clicked', async () => {
      await omnibar()
      await open()
      await typeText('product')
      rows()[0].click()
      await flushPromises()
      expect(selectResource.mock.calls[0][0].title).toBe(products.title)
      expect(visible()).toBe(false)
    })

    it('opens a plugin like a resource', async () => {
      await omnibar()
      await open()
      await typeText('syslog')
      await key('Enter')
      expect(selectResource.mock.calls[0][0].title).toBe('Syslog')
    })

    it('only closes when the chosen result is the page that is already open', async () => {
      await omnibar({ selectedItem: undefined })
      await open()
      wrapper.vm.results = []
      await typeText('orders')
      const current = wrapper.vm.results[0].ref
      await wrapper.setProps({ selectedItem: current })
      await key('Enter')
      expect(selectResource).not.toHaveBeenCalled()
      expect(visible()).toBe(false)
    })

    it('does nothing on Enter when there is no result', async () => {
      await omnibar()
      await open()
      await typeText('zzzzzz')
      await key('Enter')
      expect(selectResource).not.toHaveBeenCalled()
      expect(visible()).toBe(true)
    })

    it('starts again from the first result when the text changes', async () => {
      await omnibar()
      await open()
      await typeText('o')
      await key('ArrowDown')
      await key('ArrowDown')
      await typeText('or')
      expect(wrapper.vm.highlightedItem).toBe(0)
    })
  })

  it('follows the menu when it changes', async () => {
    await omnibar()
    await open()
    await typeText('extra')
    expect(rows()).toHaveLength(0)
    await wrapper.setProps({ groupedList: menu().concat([{ name: { enUS: 'More' }, list: [{ title: 'extra', name: 'extra', displayname: { enUS: 'Extra things' }, group: { enUS: 'More' } }] }]) })
    await typeText('extra ')
    await typeText('extra')
    expect(rowNames()).toEqual(['Extra things'])
  })
})
