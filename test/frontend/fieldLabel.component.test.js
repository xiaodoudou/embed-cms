import { describe, it, expect } from 'vitest'
import CustomCheckbox from '@c/fields/CustomCheckbox.vue'
import CustomInput from '@c/fields/CustomInput.vue'
import { mountField } from './helpers/mountField.js'

// the label says whether the field is read-only, with a lock; a disabled field has no icon, it is greyed out with a dashed border
describe('FieldLabel state icon', () => {
  const label = (wrapper) => wrapper.get('.field-label')
  // the icon of the label: the icon component is looked for, since the test environment has no icon set to draw it with
  const icons = (wrapper) => wrapper.findAllComponents({ name: 'VIcon' }).filter((icon) => label(wrapper).element.contains(icon.element))

  it('shows nothing on an editable field', () => {
    const wrapper = mountField(CustomInput, { model: {}, schema: { model: 'title', label: 'Title' } })
    expect(label(wrapper).find('.cms-field-readonly').exists()).toBe(false)
    expect(icons(wrapper)).toHaveLength(0)
  })

  it('shows a lock next to the label of a read-only field, named read-only', () => {
    const wrapper = mountField(CustomCheckbox, { schema: { label: 'Flag', readonly: true } })
    const icon = label(wrapper).find('.cms-field-readonly')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('title')).toBe('Read-only')
    expect(icons(wrapper).map((item) => item.props('icon'))).toEqual(['$lockOutline'])
  })

  it('shows no icon next to the label of a disabled field', () => {
    const wrapper = mountField(CustomInput, { model: {}, schema: { model: 'title', label: 'Title', disabled: true } })
    expect(label(wrapper).find('.cms-field-readonly').exists()).toBe(false)
    expect(icons(wrapper)).toHaveLength(0)
  })

  it('shows no icon when the parent disables the field', () => {
    const wrapper = mountField(CustomInput, { model: {}, schema: { model: 'title', label: 'Title' }, props: { disabled: true } })
    expect(icons(wrapper)).toHaveLength(0)
  })

  it('shows no icon on a field that is both read-only and disabled: disabled wins', () => {
    const wrapper = mountField(CustomInput, { model: {}, schema: { model: 'title', label: 'Title', readonly: true, disabled: true } })
    expect(label(wrapper).find('.cms-field-readonly').exists()).toBe(false)
  })
})
