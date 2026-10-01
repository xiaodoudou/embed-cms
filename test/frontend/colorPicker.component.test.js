import { describe, it, expect, vi } from 'vitest'
import ColorPicker from '@c/fields/ColorPicker.vue'
import { mountField } from './helpers/mountField.js'

const picker = (model = {}, schema = {}) => mountField(ColorPicker, { model, schema: { model: 'colour', label: 'Colour', ...schema }, attachTo: document.body })

describe('ColorPicker', () => {
  it('shows the label, the hint and the picker', () => {
    const wrapper = picker({}, { options: { hint: 'A colour swatch' } })
    expect(wrapper.find('.field-label').text()).toContain('Colour')
    expect(wrapper.find('.help-block').text()).toBe('A colour swatch')
    expect(wrapper.find('.v-color-picker').exists()).toBe(true)
  })

  it('starts on the colour of the record, or on black', async () => {
    const withValue = picker({ colour: '#f5a623ff' })
    await withValue.vm.$nextTick()
    expect(withValue.vm.color).toBe('#f5a623ff')
    const without = picker({})
    await without.vm.$nextTick()
    expect(without.vm.color).toBe('#000000FF')
  })

  it('does not write the colour it shows by default: a new record is not edited until someone picks', async () => {
    const model = {}
    const wrapper = picker(model)
    await wrapper.vm.$nextTick()
    expect(model.colour).toBeUndefined()
    expect(wrapper.emitted('input')).toBeUndefined()
  })

  it('does not write when the picker only echoes the value it was given', async () => {
    const model = { colour: '#112233FF' }
    const wrapper = picker(model)
    await wrapper.vm.$nextTick()
    wrapper.vm.onPick('#112233ff')
    expect(wrapper.emitted('input')).toBeUndefined()
  })

  it('writes a colour picked by the person', async () => {
    const model = { colour: '#112233FF' }
    const wrapper = picker(model)
    await wrapper.vm.$nextTick()
    wrapper.vm.onPick('#ff0000FF')
    expect(model.colour).toBe('#ff0000FF')
    expect(wrapper.emitted('input')[0]).toEqual(['#ff0000FF', 'colour'])
  })

  it('writes nothing when the field is locked', async () => {
    const model = { colour: '#112233FF' }
    const wrapper = picker(model, { readonly: true })
    await wrapper.vm.$nextTick()
    wrapper.vm.onPick('#ff0000FF')
    expect(model.colour).toBe('#112233FF')
    expect(wrapper.emitted('input')).toBeUndefined()
  })

  it('falls back to hexa for a colour model it does not know, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = picker({}, { outputModel: 'cmyk' })
    expect(wrapper.vm.options.outputModel).toBe('hexa')
    expect(warn).toHaveBeenCalled()
  })
})
