import { describe, it, expect } from 'vitest'
import CustomTextarea from '@c/fields/CustomTextarea.vue'
import { mountField } from './helpers/mountField.js'

describe('CustomTextarea', () => {
  it('shows the label, the required mark and the hint', () => {
    const wrapper = mountField(CustomTextarea, { schema: { label: 'Summary', required: true, options: { hint: 'Long text' } } })
    expect(wrapper.find('.field-label').text()).toContain('Summary')
    expect(wrapper.find('.required-mark').exists()).toBe(true)
    expect(wrapper.find('.help-block').text()).toBe('Long text')
  })

  it('shows the value and writes what is typed into the model', async () => {
    const model = { summary: 'first line\nsecond line' }
    const wrapper = mountField(CustomTextarea, { model, schema: { model: 'summary' } })
    expect(wrapper.get('textarea').element.value).toBe('first line\nsecond line')
    await wrapper.get('textarea').setValue('changed')
    expect(model.summary).toBe('changed')
    expect(wrapper.emitted('input')[0][1]).toBe('summary')
  })

  it('is read-only and says so when locked', () => {
    const wrapper = mountField(CustomTextarea, { model: { summary: 'x' }, schema: { model: 'summary', readonly: true } })
    expect(wrapper.get('textarea').attributes('readonly')).toBeDefined()
    expect(wrapper.find('.cms-field-lock').exists()).toBe(true)
  })

  it('is disabled when disabled', () => {
    const wrapper = mountField(CustomTextarea, { model: { summary: 'x' }, schema: { model: 'summary', disabled: true } })
    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
  })

  it('keeps password managers away', async () => {
    const wrapper = mountField(CustomTextarea, { schema: { label: 'Notes' } })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('textarea').attributes('data-1p-ignore')).toBe('true')
  })
})
