import { describe, it, expect, afterEach } from 'vitest'
import BrandLogo from '@c/BrandLogo.vue'
import { mountComponent } from './helpers/mountField.js'

let wrapper
const logo = (props = {}) => (wrapper = mountComponent(BrandLogo, { props }))

afterEach(() => wrapper?.unmount())

describe('BrandLogo (the Node CMS mark)', () => {
  it('shows the mark with the name, as one image for a screen reader', () => {
    logo()
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('Node CMS')
    expect(wrapper.find('svg.brand-mark').exists()).toBe(true)
    expect(wrapper.get('.brand-word').text()).toBe('Node CMS')
  })

  it('hides the drawn parts from a screen reader, so the name is not read twice', () => {
    logo()
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.brand-word').attributes('aria-hidden')).toBe('true')
  })

  it('shows the mark alone', () => {
    logo({ markOnly: true })
    expect(wrapper.find('.brand-word').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.attributes('aria-label')).toBe('Node CMS')
  })

  it('takes another name', () => {
    logo({ name: 'Acme' })
    expect(wrapper.attributes('aria-label')).toBe('Acme')
  })

  it('has a dark-background variant', () => {
    logo()
    expect(wrapper.classes()).not.toContain('on-dark')
    wrapper.unmount()
    logo({ onDark: true })
    expect(wrapper.classes()).toContain('on-dark')
  })
})
