import { describe, it, expect } from 'vitest'
import TableCell from '@c/records/TableCell.vue'
import { mountComponent } from './helpers/mountField.js'

const cell = (kind, record, extra = {}, helpers = {}) => mountComponent(TableCell, {
  props: { column: { kind, model: 'value', key: 'value', originalModel: 'value', ...extra }, record, helpers }
})

describe('TableCell', () => {
  it('draws a boolean as a labelled check or dash', () => {
    expect(cell('boolean', { value: true }).get('[role=img]').attributes('aria-label')).toBe('Yes')
    expect(cell('boolean', { value: false }).get('[role=img]').attributes('aria-label')).toBe('No')
  })

  it('shows a rating as its icon and "3 / 5", with the icon and the most of the field', () => {
    const field = { options: { max: 10, icon: 'heart' } }
    const wrapper = cell('rating', { value: 7 }, { field })
    expect(wrapper.get('.cell-rating').text()).toBe('7 / 10')
    expect(wrapper.get('.cell-rating').attributes('title')).toBe('7 / 10')
    expect(cell('rating', { value: 2.5 }, { field: {} }).text()).toBe('2.5 / 5')
  })

  it('shows a duration in the units of the field, right aligned like a number', () => {
    const wrapper = cell('duration', { value: 5400 }, { field: { options: { units: ['hours', 'minutes'] } } })
    expect(wrapper.get('.cell-number').text()).toBe('1h 30m')
    expect(cell('duration', { value: 90061 }, { field: { options: { units: ['days', 'hours', 'minutes', 'seconds'] } } }).text()).toBe('1d 1h 1m 1s')
    expect(cell('duration', { value: 0 }, { field: {} }).text()).toBe('0m')
    expect(cell('duration', {}, { field: {} }).find('.cell-empty').exists()).toBe(true)
  })

  it('draws an empty rating as a dash', () => {
    expect(cell('rating', {}, { field: {} }).find('.cell-empty').exists()).toBe(true)
  })

  it('draws an empty value as a dash', () => {
    expect(cell('text', { value: '' }).find('.cell-empty').exists()).toBe(true)
  })

  it('shows the text of a text column', () => {
    expect(cell('text', { value: 'Hello' }).text()).toBe('Hello')
  })

  it('shows the first chips of a list and counts the rest', () => {
    const wrapper = cell('multi', { value: ['a', 'b', 'c', 'd'] })
    expect(wrapper.findAll('.cell-chip').length).toBeGreaterThan(1)
    expect(wrapper.find('.cell-chip.more').text()).toMatch(/^\+\d+$/)
  })

  it('shows a thumbnail when the helper finds an image', () => {
    const wrapper = cell('image', { value: [{}] }, {}, { imageUrl: () => '/api/x/1/attachments/a1?resize=autox64' })
    expect(wrapper.get('img.cell-thumb').attributes('src')).toBe('/api/x/1/attachments/a1?resize=autox64')
  })

  it('shows a placeholder, labelled, when there is no image url', () => {
    const wrapper = cell('image', { value: [{}] }, {}, { imageUrl: () => false })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('.cell-thumb.placeholder').attributes('role')).toBe('img')
  })

  it('draws a colour as a swatch with its value', () => {
    const wrapper = cell('color', { value: '#f5a623' })
    expect(wrapper.get('.swatch').attributes('style')).toContain('rgb(245, 166, 35)')
    expect(wrapper.text()).toContain('#f5a623')
  })

  it('opens a link safely in a new tab', () => {
    const wrapper = cell('link', { value: 'https://example.com/a' })
    const link = wrapper.get('a.cell-link')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('does not make a link of a script url', () => {
    expect(cell('link', { value: 'javascript:alert(1)' }).find('a').exists()).toBe(false)
  })

  it('shows the file name of a file column', () => {
    const wrapper = cell('file', { value: [{}] }, {}, { fileName: () => 'report.pdf' })
    expect(wrapper.text()).toContain('report.pdf')
  })
})
