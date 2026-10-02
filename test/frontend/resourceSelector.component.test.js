import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ResourceSelector from '@c/records/ResourceSelector.vue'
import { mountComponent } from './helpers/mountField.js'
import { groupedList, products, orders, notes, syslog } from './helpers/navFixtures.js'

let wrapper
const selector = async (props = {}) => {
  wrapper = mountComponent(ResourceSelector, { props: { resource: products, groupedList: groupedList(), ...props }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const open = async () => {
  await wrapper.get('.resource-selector').trigger('click')
  await flushPromises()
}
const items = () => [...document.body.querySelectorAll('.resources-menu .v-list-item')]

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('ResourceSelector (the title with the list of its group)', () => {
  it('shows the display name of the open resource', async () => {
    await selector()
    expect(wrapper.get('.resource-title').text()).toBe('Products')
  })

  it('falls back to the title of a resource that has no display name', async () => {
    await selector({ resource: { title: 'raw', name: 'raw', group: { enUS: 'Shop' } } })
    expect(wrapper.get('.resource-title').text()).toBe('raw')
  })

  it('is absent when there is no group list or no open resource', async () => {
    await selector({ groupedList: false })
    expect(wrapper.find('.resource-selector').exists()).toBe(false)
    wrapper.unmount()
    await selector({ resource: false })
    expect(wrapper.find('.resource-selector').exists()).toBe(false)
  })

  it('is absent when no group holds the resource', async () => {
    await selector({ resource: { title: 'lost', name: 'lost', group: { enUS: 'Nowhere' } } })
    expect(wrapper.find('.resource-selector').exists()).toBe(false)
  })

  it('says whether its menu is open', async () => {
    await selector()
    const button = wrapper.get('.resource-selector')
    expect(button.attributes('aria-haspopup')).toBe('menu')
    expect(button.attributes('aria-expanded')).toBe('false')
    await open()
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(button.classes()).toContain('opened')
  })

  it('lists the resources of the group of the open one, in the order of the group', async () => {
    await selector()
    await open()
    expect(items().map((item) => item.textContent.trim())).toEqual(['Products', 'Orders', 'Returns'])
    expect(items()[0].classList.contains('selected')).toBe(true)
    expect(items()[1].classList.contains('selected')).toBe(false)
  })

  it('finds the group of a resource that has none (Others)', async () => {
    await selector({ resource: notes })
    await open()
    expect(items().map((item) => item.textContent.trim())).toEqual(['Notes'])
  })

  it('finds the group of a resource whose group is a plain string', async () => {
    await selector({ resource: { ...orders, group: 'Shop' } })
    await open()
    expect(items()).toHaveLength(3)
  })

  it('names a plugin page from its display name', async () => {
    await selector({ resource: syslog, groupedList: [{ name: 'TL_OTHERS', list: [syslog, notes] }] })
    expect(wrapper.get('.resource-title').text()).toBe('Syslog')
  })

  it('opens the resource that is chosen, and closes', async () => {
    const select = vi.fn()
    await selector({ selectCallback: select })
    await open()
    items()[1].click()
    await flushPromises()
    expect(select).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledWith(orders)
    expect(wrapper.get('.resource-selector').attributes('aria-expanded')).toBe('false')
  })

  it('does nothing when the open resource is chosen again', async () => {
    const select = vi.fn()
    await selector({ selectCallback: select })
    await open()
    items()[0].click()
    await flushPromises()
    expect(select).not.toHaveBeenCalled()
  })

  it('sizes its menu for the list view or the sidebar', async () => {
    await selector({ fullWidth: true })
    await open()
    expect(document.body.querySelector('.resources-menu.full-width')).not.toBe(null)
    wrapper.unmount()
    document.body.innerHTML = ''
    await selector()
    await open()
    expect(document.body.querySelector('.resources-menu.sidebar')).not.toBe(null)
  })
})
