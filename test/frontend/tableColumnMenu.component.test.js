import { describe, it, expect } from 'vitest'
import TableColumnMenu from '@c/records/TableColumnMenu.vue'
import { mountComponent } from './helpers/mountField.js'

const columns = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'price', label: 'Price', kind: 'number' },
  { key: 'photo', label: 'Photo', kind: 'image' }
]

describe('TableColumnMenu (the Columns button)', () => {
  it('counts the visible columns out of all of them', () => {
    const wrapper = mountComponent(TableColumnMenu, { props: { columns, prefs: {} }, attachTo: document.body })
    expect(wrapper.get('.tool-count').text()).toMatch(/^\d+\/3$/)
  })

  it('counts fewer when the preferences hide a column', () => {
    const all = mountComponent(TableColumnMenu, { props: { columns, prefs: { hidden: [] } }, attachTo: document.body })
    const hidden = mountComponent(TableColumnMenu, { props: { columns, prefs: { hidden: ['price'] } }, attachTo: document.body })
    expect(all.get('.tool-count').text()).toBe('3/3')
    expect(hidden.get('.tool-count').text()).toBe('2/3')
  })

  it('names itself for assistive technology and announces a popup', () => {
    const wrapper = mountComponent(TableColumnMenu, { props: { columns, prefs: {} }, attachTo: document.body })
    const button = wrapper.get('button.table-tool')
    expect(button.attributes('aria-label')).toBe('Columns')
    expect(button.attributes('aria-haspopup')).toBe('dialog')
    expect(button.attributes('aria-expanded')).toBe('false')
  })
})
