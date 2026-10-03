import { describe, it, expect } from 'vitest'
import CustomInputTag from '@c/fields/CustomInputTag.vue'
import ResourceService from '@s/ResourceService'
import { mountField } from './helpers/mountField.js'

const tags = (model = {}, schema = {}) => mountField(CustomInputTag, { model, schema: { model: 'tags', label: 'Tags', ...schema }, attachTo: document.body })
const paste = (wrapper, text) => {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  event.clipboardData = { getData: () => text }
  wrapper.vm.onPaste(event)
  return event
}

describe('CustomInputTag (the pillbox)', () => {
  it('shows the label, the required mark and the hint', () => {
    const wrapper = tags({}, { required: true, options: { hint: 'Several values, shown as chips' } })
    expect(wrapper.find('.field-label').text()).toContain('Tags')
    expect(wrapper.find('.required-mark').exists()).toBe(true)
    expect(wrapper.find('.help-block').text()).toBe('Several values, shown as chips')
  })

  it('shows each value of the record as a chip', () => {
    const wrapper = tags({ tags: ['lighting', 'desk'] })
    expect(wrapper.findAll('.v-chip').map((chip) => chip.text())).toEqual(['lighting', 'desk'])
  })

  it('splits a value typed with commas into several tags', () => {
    const wrapper = tags()
    expect(wrapper.vm.processCommaSeparatedValues(['a, b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('leaves a list without commas as it is, and anything that is not a list alone', () => {
    const wrapper = tags()
    expect(wrapper.vm.processCommaSeparatedValues(['a', 'b'])).toEqual(['a', 'b'])
    expect(wrapper.vm.processCommaSeparatedValues(null)).toBe(null)
  })

  it('reports a change with the model path', () => {
    const wrapper = tags()
    wrapper.vm.onChangeData(['x, y'])
    expect(wrapper.emitted('input')[0][1]).toBe('tags')
    expect(wrapper.emitted('input')[0][0]).toEqual(['x', 'y'])
  })

  it('turns pasted comma-separated text into tags, next to the ones already there, without duplicates', () => {
    const wrapper = tags({ tags: ['a'] })
    const event = paste(wrapper, 'a, b ,c,, ')
    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.emitted('input')[0][0]).toEqual(['a', 'b', 'c'])
  })

  it('adds a single pasted word as one tag, unless it is there already', () => {
    const wrapper = tags({ tags: ['a'] })
    paste(wrapper, ' b ')
    paste(wrapper, 'a')
    expect(wrapper.emitted('input')).toHaveLength(1)
    expect(wrapper.emitted('input')[0][0]).toEqual(['a', 'b'])
  })

  it('is not editable when read-only', () => {
    const wrapper = tags({ tags: ['a'] }, { readonly: true })
    expect(wrapper.get('input:not([type=hidden])').attributes('readonly')).toBeDefined()
  })

  it('offers the plugin pages of the admin when the field suggests them', () => {
    window.plugins = [{ displayname: 'Syslog' }, { displayname: 'Dashboard' }, { displayname: 'Syslog' }, {}]
    try {
      expect(tags({}, { options: { suggest: 'adminPlugins' } }).vm.suggestions).toEqual(['Syslog', 'Dashboard'])
      expect(tags().vm.suggestions).toEqual([])
    } finally {
      delete window.plugins
    }
  })

  it('offers the resources of the CMS the person can see, in order, without the system ones, when the field suggests them', () => {
    ResourceService.setSchemas([{ title: 'products' }, { title: '_users' }, { title: 'articles' }, { title: '_sync' }, {}])
    try {
      expect(tags({}, { options: { suggest: 'resources' } }).vm.suggestions).toEqual(['articles', 'products'])
    } finally {
      ResourceService.setSchemas(undefined)
    }
    expect(tags({}, { options: { suggest: 'resources' } }).vm.suggestions).toEqual([])
  })
})
