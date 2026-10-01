import { describe, it, expect } from 'vitest'
import VueTableGenerator from '@c/VueTableGenerator.vue'
import { buildColumns, fieldsFromSchema } from '@u/tableModel.js'
import { mountComponent } from './helpers/mountField.js'

const resource = {
  locales: ['enUS'],
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false },
    { field: 'price', input: 'number', label: 'Price', localised: false },
    { field: 'featured', input: 'checkbox', label: 'Featured', localised: false }
  ]
}
const labelOf = (raw) => raw.label
const columns = buildColumns(fieldsFromSchema(resource, 'enUS', labelOf), resource, { showAllLocales: false, labelOf })
const rows = [
  { _id: 'a', name: 'Aurora lamp', price: 49.9, featured: true },
  { _id: 'b', name: 'Basalt mug', price: 12.5, featured: false },
  { _id: 'c', name: 'Cedar shelf', price: 89, featured: false }
]

const grid = (props = {}) => mountComponent(VueTableGenerator, { props: { columns, rows, selected: [], ...props } })
const dataRows = (wrapper) => wrapper.findAll('tr.data-row')

describe('VueTableGenerator (the table grid)', () => {
  it('shows one header per column, then a labelled Actions header', () => {
    const headers = grid().findAll('thead th').map((th) => th.text())
    expect(headers).toContain('Name')
    expect(headers).toContain('Price')
    expect(headers[headers.length - 1]).toBe('Actions')
  })

  it('shows one row per record with the cell values', () => {
    const wrapper = grid()
    expect(dataRows(wrapper)).toHaveLength(3)
    expect(dataRows(wrapper)[0].text()).toContain('Aurora lamp')
    expect(dataRows(wrapper)[1].text()).toContain('12.5')
  })

  it('always shows the edit and delete buttons of every row', () => {
    const wrapper = grid()
    for (const row of dataRows(wrapper)) {
      expect(row.findAll('.row-actions button')).toHaveLength(2)
    }
  })

  it('emits edit and remove with the row', async () => {
    const wrapper = grid()
    const [edit, remove] = dataRows(wrapper)[1].findAll('.row-actions button')
    await edit.trigger('click')
    await remove.trigger('click')
    expect(wrapper.emitted('edit')[0][0]._id).toBe('b')
    expect(wrapper.emitted('remove')[0][0]._id).toBe('b')
  })

  it('opens a row on click', async () => {
    const wrapper = grid()
    await dataRows(wrapper)[2].trigger('click')
    expect(wrapper.emitted('open')[0][0]._id).toBe('c')
  })

  it('selects a row with its checkbox', async () => {
    const wrapper = grid()
    await dataRows(wrapper)[0].get('input.cms-check').trigger('click')
    expect(wrapper.emitted('update:selected')[0][0]).toEqual(['a'])
  })

  it('selects every row from the header checkbox, and marks selected rows', async () => {
    const wrapper = grid()
    await wrapper.get('thead input.cms-check').trigger('change')
    expect(wrapper.emitted('update:selected')[0][0]).toEqual(['a', 'b', 'c'])
    await wrapper.setProps({ selected: ['b'] })
    expect(dataRows(wrapper).map((row) => row.classes().includes('selected'))).toEqual([false, true, false])
    expect(wrapper.get('thead input.cms-check').element.indeterminate).toBe(true)
  })

  it('shows the header checkbox as checked when everything is selected', () => {
    const wrapper = grid({ selected: ['a', 'b', 'c'] })
    expect(wrapper.get('thead input.cms-check').element.checked).toBe(true)
  })

  it('disables the header checkbox when there are no rows', () => {
    expect(grid({ rows: [] }).get('thead input.cms-check').attributes('disabled')).toBeDefined()
  })

  it('asks for a sort when a header is clicked', async () => {
    const wrapper = grid()
    await wrapper.get('thead th .th-btn').trigger('click')
    expect(wrapper.emitted('sort')).toBeTruthy()
  })

  it('shows skeleton rows while loading', () => {
    const wrapper = grid({ loading: true })
    expect(wrapper.findAll('tr.skeleton-row').length).toBeGreaterThan(0)
    expect(dataRows(wrapper)).toHaveLength(0)
  })
})
