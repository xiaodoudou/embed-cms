import { describe, it, expect } from 'vitest'
import SearchField from '@c/records/SearchField.vue'
import { mountComponent } from './helpers/mountField.js'

const field = (props = {}) => mountComponent(SearchField, { props: { placeholder: 'Search', ...props }, attachTo: document.body })

describe('SearchField', () => {
  it('shows the placeholder and uses it as the accessible name', () => {
    const input = field().get('input')
    expect(input.attributes('placeholder')).toBe('Search')
    expect(input.attributes('aria-label')).toBe('Search')
  })

  it('prefers an explicit accessible name', () => {
    expect(field({ ariaLabel: 'Filter records' }).get('input').attributes('aria-label')).toBe('Filter records')
  })

  it('has no clear button while empty, and one with a value', async () => {
    const wrapper = field()
    expect(wrapper.find('.search-clear').exists()).toBe(false)
    await wrapper.setProps({ modelValue: 'lamp' })
    expect(wrapper.find('.search-clear').exists()).toBe(true)
    expect(wrapper.classes()).toContain('has-value')
  })

  it('reports what is typed', async () => {
    const wrapper = field()
    await wrapper.get('input').setValue('aurora')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['aurora'])
  })

  it('clears with the button, tells the parent, and keeps the focus in the field', async () => {
    const wrapper = field({ modelValue: 'lamp' })
    await wrapper.get('.search-clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([''])
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(document.activeElement).toBe(wrapper.get('input').element)
  })

  it('clears on Escape when it has a value, and does not let the key go further', async () => {
    const wrapper = field({ modelValue: 'lamp' })
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    let reachedParent = false
    wrapper.element.parentElement.addEventListener('keydown', () => { reachedParent = true })
    wrapper.get('input').element.dispatchEvent(event)
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(reachedParent).toBe(false)
  })

  it('leaves the field on Escape when it is already empty', async () => {
    const wrapper = field()
    wrapper.get('input').element.focus()
    await wrapper.get('input').trigger('keydown.esc')
    expect(wrapper.emitted('clear')).toBeUndefined()
    expect(document.activeElement).not.toBe(wrapper.get('input').element)
  })
})
