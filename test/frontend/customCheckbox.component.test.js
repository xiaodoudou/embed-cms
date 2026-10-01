import { describe, it, expect } from 'vitest'
import CustomCheckbox from '@c/fields/CustomCheckbox.vue'
import { mountField } from './helpers/mountField.js'

const switchOf = (wrapper) => wrapper.get('[role=switch]')

describe('CustomCheckbox (the switch)', () => {
  it('shows an unset value as off', () => {
    const wrapper = mountField(CustomCheckbox, { model: {}, schema: { label: 'Flag' } })
    expect(switchOf(wrapper).attributes('aria-checked')).toBe('false')
  })

  it('shows its label and its hint', () => {
    const wrapper = mountField(CustomCheckbox, { schema: { label: 'Published', options: { hint: 'On or off' } } })
    expect(wrapper.text()).toContain('Published')
    expect(wrapper.find('.help-block').text()).toBe('On or off')
  })

  it('marks a required switch with a star', () => {
    const wrapper = mountField(CustomCheckbox, { schema: { label: 'Terms', required: true } })
    expect(wrapper.find('.required-mark').exists()).toBe(true)
  })

  it('turns on when clicked and reports the value with its model path', async () => {
    const model = {}
    const wrapper = mountField(CustomCheckbox, { model, schema: { model: 'flag' } })
    await switchOf(wrapper).trigger('click')
    expect(model.flag).toBe(true)
    expect(switchOf(wrapper).attributes('aria-checked')).toBe('true')
    expect(wrapper.emitted('input')[0]).toEqual([true, 'flag'])
  })

  it('turns off again on a second click', async () => {
    const model = { flag: true }
    const wrapper = mountField(CustomCheckbox, { model, schema: { model: 'flag' } })
    await switchOf(wrapper).trigger('click')
    expect(model.flag).toBe(false)
  })

  it.each(['space', 'enter'])('toggles with the %s key', async (key) => {
    const model = {}
    const wrapper = mountField(CustomCheckbox, { model, schema: { model: 'flag' } })
    await switchOf(wrapper).trigger(`keydown.${key}`)
    expect(model.flag).toBe(true)
  })

  it('treats null as off', () => {
    const wrapper = mountField(CustomCheckbox, { model: { flag: null }, schema: { model: 'flag' } })
    expect(switchOf(wrapper).attributes('aria-checked')).toBe('false')
  })

  it('does nothing when read-only', async () => {
    const model = { flag: true }
    const wrapper = mountField(CustomCheckbox, { model, schema: { model: 'flag', readonly: true } })
    await switchOf(wrapper).trigger('click')
    expect(model.flag).toBe(true)
    expect(wrapper.emitted('input')).toBeUndefined()
    expect(switchOf(wrapper).attributes('aria-readonly')).toBe('true')
  })

  it('does nothing when disabled, and leaves the tab order', async () => {
    const model = {}
    const wrapper = mountField(CustomCheckbox, { model, schema: { model: 'flag', disabled: true } })
    await switchOf(wrapper).trigger('click')
    expect(model.flag).toBeUndefined()
    expect(switchOf(wrapper).attributes('tabindex')).toBe('-1')
    expect(switchOf(wrapper).attributes('aria-disabled')).toBe('true')
  })
})
