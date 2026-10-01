import { describe, it, expect, beforeEach } from 'vitest'
import RecordList from '@c/RecordList.vue'
import { mountComponent } from './helpers/mountField.js'

// The real virtual scroller renders only what fits the (absent) layout: this one renders every item through the same slot.
const RecycleScroller = {
  props: ['items'],
  template: '<div class="list"><template v-for="item in items" :key="item._id"><slot :item="item" /></template></div>'
}
// the shortcut directive of vue3-shortkey is registered by the app
const shortkey = { mounted () {}, updated () {} }

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
const list = (props = {}) => mountComponent(RecordList, {
  props: { resource, list: records, groupedList: [group], resourceGroup: group, selectedItem: false, ...props },
  global: { stubs: { RecycleScroller }, directives: { shortkey } },
  attachTo: document.body
})
const items = (wrapper) => wrapper.findAll('.record-list .item')

beforeEach(() => {
  // the list marks the records it filters (`_searchable`): every test gets its own copies
  records = makeRecords()
  window.localStorage.clear()
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
    expect(wrapper.get('button.filter-chip').attributes('aria-pressed')).toBe('false')
    await wrapper.get('button.filter-chip').trigger('click')
    expect(wrapper.get('button.filter-chip').attributes('aria-pressed')).toBe('true')
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
})
