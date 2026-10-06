import { describe, it, expect } from 'vitest'
import CustomMultiSelect from '@c/fields/CustomMultiSelect.vue'
import { mountField, TranslateService } from './helpers/mountField.js'

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
    expect(select({ status: 'draft' }, { readonly: true }).get('input:not([type=hidden])').attributes('readonly')).toBeDefined()
  })

  describe('records of several resources', () => {
    const ann = { _id: 'authors:a2', _label: 'Ann', _title: 'Authors', _resource: 'authors' }
    const zoe = { _id: 'authors:a1', _label: 'Zoe', _title: 'Authors', _resource: 'authors' }
    const eve = { _id: 'editors:e1', _label: 'Eve', _title: 'Editors', _resource: 'editors' }
    const several = (model = {}, selectOptions = {}) => select(model, { multiSource: true, values: [ann, zoe, eve] }, selectOptions)

    it('shows the record a reference points to, by its label', () => {
      expect(several({ status: { resource: 'authors', id: 'a1' } }).find('.v-chip').text()).toBe('Zoe')
      const wrapper = several({ status: [{ resource: 'editors', id: 'e1' }, { resource: 'authors', id: 'a2' }] }, { multiple: true })
      expect(wrapper.findAll('.v-chip').map(chip => chip.text())).toEqual(['Eve', 'Ann'])
      expect(wrapper.find('.selected-count').text()).toContain('2')
    })

    it('groups the choices by the kind of record, in the order of the field', () => {
      const items = several().vm.listItems
      expect(items.map(item => item.type === 'subheader' ? `# ${item.title}` : item._label)).toEqual(['# Authors', 'Ann', 'Zoe', '# Editors', 'Eve'])
    })

    it('names a choice by its label, and tells the kind of record under it', () => {
      const wrapper = several()
      expect(wrapper.vm.customLabel({ raw: eve })).toBe('Eve')
      expect(wrapper.vm.customLabel({ raw: { type: 'subheader', title: 'Editors' } })).toBe('Editors')
      expect(wrapper.vm.subtitleOf({ raw: eve })).toBeUndefined()
      wrapper.vm.searchText = 'ev'
      expect(wrapper.vm.subtitleOf({ raw: eve })).toBe('Editors')
      expect(wrapper.vm.getValue({ raw: eve })).toBe('editors:e1')
    })

    it('keeps a reference, not the key of the choice, when one is chosen', () => {
      const wrapper = several()
      wrapper.vm.updateSelected('editors:e1')
      expect(wrapper.emitted('input').at(-1)).toEqual([{ resource: 'editors', id: 'e1' }, 'status'])
    })

    it('keeps the references of a multiselect, and nothing when it is cleared', () => {
      const wrapper = several({}, { multiple: true })
      wrapper.vm.updateSelected(['authors:a1', 'editors:e1'])
      expect(wrapper.emitted('input').at(-1)).toEqual([[{ resource: 'authors', id: 'a1' }, { resource: 'editors', id: 'e1' }], 'status'])
      wrapper.vm.updateSelected(null)
      expect(wrapper.emitted('input').at(-1)).toEqual([null, 'status'])
    })

    it('still shows a reference to a record that is gone, by its id and marked as not found', () => {
      const wrapper = several({ status: [{ resource: 'authors', id: 'gone' }] }, { multiple: true })
      expect(wrapper.find('.v-chip').text()).toContain('gone')
      expect(wrapper.find('.v-chip').text()).toContain(TranslateService.get('TL_MAP_RECORD_MISSING'))
    })

    it('chooses every record of every resource with select all', () => {
      const wrapper = several({}, { multiple: true })
      wrapper.vm.onChangeSelectAll()
      expect(wrapper.vm.selection).toEqual(['authors:a2', 'authors:a1', 'editors:e1'])
    })
  })
})
