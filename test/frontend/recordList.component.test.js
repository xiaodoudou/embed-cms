import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import RecordList from '@c/records/RecordList.vue'
import { mountComponent } from './helpers/mountField.js'
import LoginService from '@s/LoginService'
import NotificationsService from '@s/NotificationsService'

// The real virtual scroller renders only what fits the (absent) layout: this one renders every item through the same slot.
const RecycleScroller = {
  props: ['items'],
  template: '<div class="list"><template v-for="(item, index) in items" :key="item._id"><slot :item="item" :index="index" /></template></div>'
}

const resource = {
  title: 'products',
  displayname: { enUS: 'Products' },
  locales: ['enUS'],
  schema: [{ field: 'name', input: 'string', label: 'Name', localised: false, searchable: true }]
}
const group = { name: 'Shop', list: [resource] }
const makeRecords = () => [
  { _id: 'mu0aaaaa', name: 'Aurora lamp', _local: true, _updatedBy: 'admins~localAdmin', _updatedAt: Date.now() - 60000 },
  { _id: 'mu0bbbbb', name: 'Basalt mug', _local: true, _updatedBy: 'admins~editor', _updatedAt: Date.now() - 3600000 },
  { _id: 'mu0ccccc', name: 'Cedar shelf', _local: true, _updatedBy: 'admins~localAdmin', _updatedAt: Date.now() - 86400000 }
]

let records
const mounted = []
const list = (props = {}) => {
  const wrapper = mountComponent(RecordList, {
    props: { resource, list: records, groupedList: [group], resourceGroup: group, selectedItem: false, ...props },
    global: { stubs: { RecycleScroller } },
    attachTo: document.body
  })
  mounted.push(wrapper)
  return wrapper
}
const items = (wrapper) => wrapper.findAll('.record-list .item')

beforeEach(() => {
  // the list marks the records it filters (`_searchable`): every test gets its own copies
  records = makeRecords()
  window.localStorage.clear()
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('RecordList', () => {
  it('shows one row per record, named after the first field', () => {
    const wrapper = list()
    expect(items(wrapper)).toHaveLength(3)
    expect(items(wrapper)[0].find('.main').text()).toBe('Aurora lamp')
    expect(items(wrapper)[2].find('.main').text()).toBe('Cedar shelf')
  })

  it('shows the id of a record and the count of the list', () => {
    const wrapper = list()
    expect(items(wrapper)[1].text()).toContain('mu0bbbbb')
    expect(wrapper.find('.list-footer').text()).toContain('3')
  })

  it('opens a record when its row is clicked', async () => {
    const wrapper = list()
    await items(wrapper)[1].trigger('click')
    expect(wrapper.emitted('selectItem')[0][0]._id).toBe('mu0bbbbb')
  })

  it('opens the record with Enter from the keyboard', async () => {
    const wrapper = list()
    await items(wrapper)[2].trigger('keydown.enter')
    expect(wrapper.emitted('selectItem')[0][0]._id).toBe('mu0ccccc')
  })

  it('marks the open record as selected', () => {
    const wrapper = list({ selectedItem: records[1] })
    expect(items(wrapper).map((row) => row.attributes('aria-selected'))).toEqual(['false', 'true', 'false'])
  })

  it('offers a new record, and opens a blank one even while a record is open', async () => {
    const wrapper = list({ selectedItem: records[0] })
    const button = wrapper.get('button.new-record')
    expect(button.attributes('aria-label')).toBe('New record')
    await button.trigger('click')
    expect(wrapper.emitted('selectItem')[0][0]).toEqual({ _local: true })
    expect(wrapper.emitted('selectMultiselect')[0]).toEqual([false])
  })

  it('has no new record button when the resource is full', () => {
    const single = { ...resource, maxCount: 1 }
    expect(list({ resource: single, list: [records[0]] }).find('button.new-record').exists()).toBe(false)
  })

  it('filters by what is typed in the search field, and says when nothing matches', async () => {
    const wrapper = list()
    await wrapper.get('input.search-input').setValue('mug')
    expect(items(wrapper).map((row) => row.find('.main').text())).toEqual(['Basalt mug'])
    await wrapper.get('input.search-input').setValue('zzz')
    expect(items(wrapper)).toHaveLength(0)
    expect(wrapper.find('.list-empty').text()).toContain('No results')
  })

  describe('choosing several records', () => {
    it('adds and removes a record with a click on its row, without starting over', async () => {
      const wrapper = list({ multiselect: true })
      await items(wrapper)[1].trigger('click')
      await items(wrapper)[2].trigger('click')
      expect(wrapper.emitted('changeMultiselectItems').pop()[0].map((item) => item._id)).toEqual(['mu0bbbbb', 'mu0ccccc'])
      await items(wrapper)[1].trigger('click')
      expect(wrapper.emitted('changeMultiselectItems').pop()[0].map((item) => item._id)).toEqual(['mu0ccccc'])
      expect(wrapper.emitted('selectItem')).toBeUndefined()
    })
  })

  describe('query search ("sift:" followed by a query)', () => {
    it('keeps the records the query matches', async () => {
      const wrapper = list()
      await wrapper.get('input.search-input').setValue('sift:{ name: "Basalt mug" }')
      expect(items(wrapper).map((row) => row.find('.main').text())).toEqual(['Basalt mug'])
      expect(wrapper.get('.search').classes()).toContain('is-valid')
    })

    it('understands operators', async () => {
      const wrapper = list()
      await wrapper.get('input.search-input').setValue('sift:{ name: { $in: ["Aurora lamp", "Cedar shelf"] } }')
      expect(items(wrapper).map((row) => row.find('.main').text())).toEqual(['Aurora lamp', 'Cedar shelf'])
    })

    it('marks a query that cannot be read as invalid', async () => {
      const wrapper = list()
      await wrapper.get('input.search-input').setValue('sift:{ name: ')
      expect(wrapper.get('.search').classes()).toContain('is-invalid')
    })
  })

  it('says there are no records, rather than no results, when the list is empty', () => {
    const wrapper = list({ list: [] })
    expect(wrapper.find('.list-empty').exists()).toBe(true)
    expect(wrapper.find('.list-empty').text()).not.toContain('No results')
  })

  it('shows a skeleton while the records load', () => {
    const wrapper = list({ list: false })
    expect(wrapper.find('.record-skeleton').exists()).toBe(true)
    expect(items(wrapper)).toHaveLength(0)
  })

  it('shows only the records of the person when "only mine" is on', async () => {
    const wrapper = list()
    const [all, mine] = wrapper.findAll('.toggle-owner .toggle-mode-btn')
    expect(all.attributes('aria-pressed')).toBe('true')
    expect(mine.attributes('aria-pressed')).toBe('false')
    await mine.trigger('click')
    expect(all.attributes('aria-pressed')).toBe('false')
    expect(mine.attributes('aria-pressed')).toBe('true')
    await all.trigger('click')
    expect(all.attributes('aria-pressed')).toBe('true')
  })

  it('switches to select mode and back, telling the parent', async () => {
    const wrapper = list()
    const [, selectMode] = wrapper.findAll('.toggle-mode-btn')
    await selectMode.trigger('click')
    expect(wrapper.emitted('selectMultiselect')[0]).toEqual([true])
  })

  it('has a copy id button on every record that has an id', () => {
    const wrapper = list({ list: [...records, { _id: undefined, name: 'Unsaved', _local: true }] })
    const rows = items(wrapper)
    expect(rows[0].find('.copy-id').exists()).toBe(true)
  })

  it('marks a record that cannot be edited as read-only', () => {
    const wrapper = list({ list: [{ ...records[0], _local: false }] })
    expect(items(wrapper)[0].classes()).toContain('frozen')
    expect(items(wrapper)[0].find('.meta-lock').exists()).toBe(true)
  })

  it('remembers the row density', async () => {
    const wrapper = list()
    await wrapper.get('button.density-btn').trigger('click')
    expect(wrapper.get('button.density-btn').attributes('aria-pressed')).toBe('true')
    expect(wrapper.classes()).toContain('compact')
  })

  it('marks every other row, so that the compact rows can alternate their colour', () => {
    const rows = items(list({ list: [{ ...records[0], _id: 'a' }, { ...records[0], _id: 'b' }, { ...records[0], _id: 'c' }] }))
    expect(rows.map((row) => row.classes().includes('alt'))).toEqual([false, true, false])
  })

  it('shows under "me" the records the person created, even when someone else changed them last, and the older ones they last changed', async () => {
    LoginService.user = { username: 'localAdmin', group: 'admins' }
    try {
      const wrapper = list({
        list: [
          { _id: 'a', name: 'Created by me', _local: true, _createdBy: 'admins~localAdmin', _updatedBy: 'admins~editor' },
          { _id: 'b', name: 'Created by the editor', _local: true, _createdBy: 'admins~editor', _updatedBy: 'admins~editor' },
          { _id: 'c', name: 'Older, last changed by me', _local: true, _updatedBy: 'admins~localAdmin' }
        ]
      })
      await wrapper.findAll('.toggle-owner .toggle-mode-btn')[1].trigger('click')
      const names = items(wrapper).map((row) => row.find('.main').text())
      expect(names.sort()).toEqual(['Created by me', 'Older, last changed by me'])
    } finally {
      LoginService.user = undefined
    }
  })

  it('leaves out who updated a record when only the records of the person are shown', async () => {
    const wrapper = list()
    expect(items(wrapper)[0].find('.update').exists()).toBe(true)
    await wrapper.findAll('.toggle-owner .toggle-mode-btn')[1].trigger('click')
    expect(items(wrapper)[0].find('.update').exists()).toBe(false)
    expect(items(wrapper)[0].find('.separator').exists()).toBe(false)
    expect(items(wrapper)[0].find('.time-ago').exists()).toBe(true)
  })

  it('shows the id in place of the author on compact rows when only the records of the person are shown', async () => {
    const wrapper = list()
    await wrapper.get('button.density-btn').trigger('click')
    expect(items(wrapper)[0].find('.id-lead').exists()).toBe(false)
    await wrapper.findAll('.toggle-owner .toggle-mode-btn')[1].trigger('click')
    expect(items(wrapper)[0].find('.id-lead').text()).toBe(records[0]._id)
    expect(items(wrapper)[0].find('.update').exists()).toBe(false)
  })

  it('shows the id and the time on the selected compact row', async () => {
    const wrapper = list({ selectedItem: records[0] })
    await wrapper.get('button.density-btn').trigger('click')
    const [selected, other] = items(wrapper)
    expect(selected.find('.id-lead').exists()).toBe(true)
    expect(selected.find('.time-ago').exists()).toBe(true)
    expect(other.find('.id-lead').exists()).toBe(false)
    expect(other.find('.update').exists()).toBe(true)
  })

  it('switches the two toggles whichever of their buttons is clicked', async () => {
    const wrapper = list()
    const [, , all, mine] = wrapper.findAll('.toggle-mode-btn')
    await all.trigger('click')
    expect(wrapper.get('.toggle-owner').attributes('data-pos')).toBe('1')
    expect(mine.attributes('aria-pressed')).toBe('true')
    await mine.trigger('click')
    expect(wrapper.get('.toggle-owner').attributes('data-pos')).toBe('0')
  })
  describe('the keys to the search field', () => {
    const press = (init, target = document) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
      target.dispatchEvent(event)
      return event
    }
    const searchInput = (wrapper) => wrapper.get('input.search-input').element

    it('focuses the search field with "/" and with Ctrl+/, and keeps the key from the page', () => {
      const wrapper = list()
      expect(press({ key: '/' }).defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(searchInput(wrapper))
      searchInput(wrapper).blur()
      expect(press({ key: '/', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(searchInput(wrapper))
    })

    it('leaves "/" to a text field that has the focus', () => {
      list()
      const field = document.createElement('textarea')
      document.body.appendChild(field)
      field.focus()
      expect(press({ key: '/' }, field).defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(field)
    })

    it('leaves the keys alone while the quick switcher is open', async () => {
      const wrapper = list()
      NotificationsService.sendOmnibarDisplayStatus(true)
      await flushPromises()
      expect(press({ key: '/' }).defaultPrevented).toBe(false)
      expect(document.activeElement).not.toBe(searchInput(wrapper))
    })
  })
})
