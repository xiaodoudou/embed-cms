import { describe, it, expect } from 'vitest'
import CustomMultiSelect from '@c/fields/CustomMultiSelect.vue'
import { mountField } from './helpers/mountField.js'

// FormService prepares the schema of a select: the list of options (`values`) and the `selectOptions` the component reads.
// These tests write that prepared schema by hand.
const select = (model = {}, schema = {}, selectOptions = {}) => mountField(CustomMultiSelect, {
  model,
  schema: {
    model: 'status',
    label: 'Status',
    values: ['draft', 'published', 'archived'],
    selectOptions: { chips: true, customLabel: (value) => String(value), ...selectOptions },
    ...schema
  },
  attachTo: document.body
})

describe('CustomMultiSelect (select and multiselect)', () => {
  it('shows the label, the required mark and the hint', () => {
    const wrapper = select({}, { required: true, options: { hint: 'One value from a fixed list' } })
    expect(wrapper.find('.field-label').text()).toContain('Status')
    expect(wrapper.find('.required-mark').exists()).toBe(true)
    expect(wrapper.find('.help-block').text()).toBe('One value from a fixed list')
  })

  it('shows the chosen value as a chip', () => {
    const wrapper = select({ status: 'published' })
    expect(wrapper.find('.v-chip').text()).toBe('published')
  })

  it('shows every value of a multiselect, and how many are chosen', () => {
    const wrapper = select({ status: ['draft', 'archived'] }, {}, { multiple: true })
    expect(wrapper.findAll('.v-chip').map((chip) => chip.text())).toEqual(['draft', 'archived'])
    expect(wrapper.find('.selected-count').text()).toContain('2')
  })

  describe('labels', () => {
    it('shows a readable label instead of the stored value', () => {
      const wrapper = select({}, { options: { labels: { low: 'Low', high: 'High' } } })
      expect(wrapper.vm.customLabel('low')).toBe('Low')
      expect(wrapper.vm.customLabel('medium')).toBe('medium')
    })

    it('takes the label of the current locale when there is one per locale', () => {
      const wrapper = select({}, { locale: 'zhCN', options: { labels: { low: { enUS: 'Low', zhCN: '低' } } } })
      expect(wrapper.vm.customLabel('low')).toBe('低')
    })

    it('falls back to the first label when the locale has none', () => {
      const wrapper = select({}, { locale: 'vi', options: { labels: { low: { enUS: 'Low', zhCN: '低' } } } })
      expect(wrapper.vm.customLabel('low')).toBe('Low')
    })
  })

  describe('values', () => {
    it('stores the id of a record from another resource', () => {
      const wrapper = select()
      expect(wrapper.vm.getValue({ raw: { _id: 'abc', name: 'Alpha' } })).toBe('abc')
      expect(wrapper.vm.getValue({ _value: 'x' })).toBe('x')
      expect(wrapper.vm.getValue('plain')).toBe('plain')
    })

    it('subtitles a record of another resource with its id', () => {
      const wrapper = select({}, { source: 'reference_items' })
      expect(wrapper.vm.subtitleOf({ raw: { _id: 'mu0abc', name: 'Alpha' } })).toBe('mu0abc')
    })

    it('subtitles with a template over the option, and never shows [object Object]', () => {
      const wrapper = select({}, { options: { subtitle: '{{ name }} ({{ group }})' } })
      expect(wrapper.vm.subtitleOf({ raw: { name: 'Alpha', group: 'A' } })).toBe('Alpha (A)')
      expect(wrapper.vm.subtitleOf({ raw: { name: 'Alpha', group: { x: 1 } } })).toBeUndefined()
    })

    it('has no subtitle for a plain value', () => {
      expect(select().vm.subtitleOf('draft')).toBeUndefined()
    })
  })

  describe('validation', () => {
    it('refuses an empty value when required, and accepts one otherwise', () => {
      const required = select({}, { required: true })
      expect(required.vm.validateField('')).not.toBe(true)
      expect(required.vm.validateField([])).not.toBe(true)
      expect(required.vm.validateField(null)).not.toBe(true)
      expect(required.vm.validateField('draft')).toBe(true)
      expect(select().vm.validateField('')).toBe(true)
    })

    it('asks the schema validator about a value', () => {
      const wrapper = select({}, { validator: (value) => value !== 'archived' })
      expect(wrapper.vm.validateField('draft')).toBe(true)
      expect(wrapper.vm.validateField('archived')).not.toBe(true)
    })
  })

  describe('clearing', () => {
    it('lets a single select be cleared, unless it is required, read-only or disabled', () => {
      expect(select().vm.isClearable).toBe(true)
      expect(select({}, { required: true }).vm.isClearable).toBe(false)
      expect(select({}, { readonly: true }).vm.isClearable).toBe(false)
    })

    it('does not offer a clear button on a multiselect (its chips close one by one)', () => {
      expect(select({}, {}, { multiple: true }).vm.isClearable).toBe(false)
    })
  })

  describe('groups', () => {
    const values = [{ _id: '1', kind: 'A' }, { _id: '2', kind: 'A' }, { _id: '3', kind: 'B' }]

    it('lists the options as they come when there is no group field', () => {
      expect(select({}, { values }).vm.listItems).toEqual(values)
    })

    it('puts a heading before each group when options.groupBy names a field', () => {
      const items = select({}, { values, options: { groupBy: 'kind' } }).vm.listItems
      expect(items.length).toBeGreaterThan(values.length)
    })
  })

  describe('select all (list box)', () => {
    it('knows when every option is chosen', () => {
      const wrapper = select({ status: ['draft', 'published', 'archived'] }, {}, { multiple: true })
      expect(wrapper.vm.allOptionsSelected()).toBe(true)
      expect(select({ status: ['draft'] }, {}, { multiple: true }).vm.allOptionsSelected()).toBe(false)
    })
  })

  it('is disabled when disabled', () => {
    expect(select({}, { disabled: true }).get('input').attributes('disabled')).toBeDefined()
  })

  it('is not editable when read-only', () => {
    expect(select({ status: 'draft' }, { readonly: true }).get('input').attributes('readonly')).toBeDefined()
  })
})
