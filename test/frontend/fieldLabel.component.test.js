import { describe, it, expect } from 'vitest'
import CustomCheckbox from '@c/fields/CustomCheckbox.vue'
import CustomInput from '@c/fields/CustomInput.vue'
import { mountField } from './helpers/mountField.js'

// the label says whether the field is locked: a lock for a disabled field, an eye for a read-only one
describe('FieldLabel state icon', () => {
  const label = (wrapper) => wrapper.get('.field-label')

  it('shows nothing on an editable field', () => {
    const wrapper = mountField(CustomInput, { model: {}, schema: { model: 'title', label: 'Title' } })
    expect(label(wrapper).find('.cms-field-lock').exists()).toBe(false)
    expect(label(wrapper).find('.cms-field-readonly').exists()).toBe(false)
  })

  it('shows an eye next to the label of a read-only field', () => {
    const wrapper = mountField(CustomCheckbox, { schema: { label: 'Flag', readonly: true } })
    expect(label(wrapper).find('.cms-field-readonly').exists()).toBe(true)
    expect(label(wrapper).find('.cms-field-lock').exists()).toBe(false)
  })

  it('shows a lock next to the label of a disabled field', () => {
    const wrapper = mountField(CustomInput, { model: {}, schema: { model: 'title', label: 'Title', disabled: true } })
    expect(label(wrapper).find('.cms-field-lock').exists()).toBe(true)
    expect(label(wrapper).find('.cms-field-readonly').exists()).toBe(false)
  })

  it('shows the lock when the parent disables the field', () => {
    const wrapper = mountField(CustomInput, { model: {}, schema: { model: 'title', label: 'Title' }, props: { disabled: true } })
    expect(label(wrapper).find('.cms-field-lock').exists()).toBe(true)
  })
})
