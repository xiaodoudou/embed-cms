import { describe, it, expect } from 'vitest'
import CustomInput from '@c/fields/CustomInput.vue'
import { mountField } from './helpers/mountField.js'

describe('CustomInput (text, number, email...)', () => {
  it('shows the label, the hint and the required mark', () => {
    const wrapper = mountField(CustomInput, { schema: { label: 'Name', required: true, options: { hint: 'Names the record' } } })
    expect(wrapper.find('.field-label').text()).toContain('Name')
    expect(wrapper.find('.required-mark').exists()).toBe(true)
    expect(wrapper.find('.help-block').text()).toBe('Names the record')
  })

  it('is a real label pointing at the input, and the input points back at it (no empty Vuetify label in between)', () => {
    const wrapper = mountField(CustomInput, { schema: { label: 'Name' } })
    const label = wrapper.get('label.field-label')
    const input = wrapper.get('input')
    expect(label.attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('aria-labelledby')).toBe(label.attributes('id'))
    expect(wrapper.findAll('label')).toHaveLength(1)
  })

  it('shows the value of the model', () => {
    const wrapper = mountField(CustomInput, { model: { title: 'Hello' }, schema: { model: 'title' } })
    expect(wrapper.get('input').element.value).toBe('Hello')
  })

  it('writes what is typed into the model', async () => {
    const model = {}
    const wrapper = mountField(CustomInput, { model, schema: { model: 'title' } })
    await wrapper.get('input').setValue('typed')
    expect(model.title).toBe('typed')
    expect(wrapper.emitted('input')[0][1]).toBe('title')
  })

  it('stores a number input as a number, not as the text typed', async () => {
    const model = {}
    const wrapper = mountField(CustomInput, { model, schema: { model: 'count', input: 'integer', inputFieldType: 'number' } })
    await wrapper.get('input').setValue('42')
    expect(model.count).toBe(42)
  })

  it('tells password managers to leave the field alone', async () => {
    const wrapper = mountField(CustomInput, { schema: { label: 'Token' } })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const input = wrapper.get('input')
    expect(input.attributes('data-1p-ignore')).toBe('true')
    expect(input.attributes('data-lpignore')).toBe('true')
    expect(input.attributes('autocomplete')).toBe('nope')
  })

  it('asks for a new password, never a saved one, in a password field', async () => {
    const wrapper = mountField(CustomInput, { schema: { label: 'Secret', inputFieldType: 'password' } })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const input = wrapper.get('input')
    expect(input.attributes('autocomplete')).toBe('new-password')
  })

  it('is not editable when read-only, and says so', () => {
    const wrapper = mountField(CustomInput, { model: { title: 'x' }, schema: { model: 'title', readonly: true } })
    expect(wrapper.get('input').attributes('readonly')).toBeDefined()
    expect(wrapper.find('.cms-field-readonly').exists()).toBe(true)
  })
})
