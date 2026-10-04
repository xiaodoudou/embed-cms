import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ThemeSwitch from '@c/layout/ThemeSwitch.vue'
import PluginPage from '@c/pages/PluginPage.vue'
import LoginService from '@s/LoginService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/LoginService', () => ({ default: { changeTheme: vi.fn(), user: {} } }))

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeSwitch (the dark theme button)', () => {
  const mountSwitch = () => (wrapper = mountComponent(ThemeSwitch, { attachTo: document.body }))
  beforeEach(() => LoginService.changeTheme.mockReset())

  it('is a switch that says what it does and what it would do', () => {
    mountSwitch()
    const button = wrapper.get('button.theme-switch')
    expect(button.attributes('role')).toBe('switch')
    expect(button.attributes('aria-label')).toBe('Dark theme')
    expect(button.attributes('aria-checked')).toBe('false')
    expect(button.attributes('title')).toBe('Switch to dark theme')
  })

  it('switches at once, without waiting for the server, and asks it to keep the theme', async () => {
    let answer
    LoginService.changeTheme.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    mountSwitch()
    await wrapper.get('button').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(wrapper.get('button').attributes('aria-checked')).toBe('true')
    expect(LoginService.changeTheme).toHaveBeenCalledWith('dark')
    answer('dark')
    await flushPromises()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('switches to the other theme, and says so', async () => {
    LoginService.changeTheme.mockResolvedValue('dark')
    mountSwitch()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    const button = wrapper.get('button')
    expect(button.attributes('aria-checked')).toBe('true')
    expect(button.attributes('title')).toBe('Switch to light theme')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('switches back', async () => {
    LoginService.changeTheme.mockResolvedValueOnce('dark').mockResolvedValueOnce('light')
    mountSwitch()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('button').attributes('aria-checked')).toBe('false')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('goes back when the server could not keep the theme', async () => {
    LoginService.changeTheme.mockResolvedValue(undefined)
    mountSwitch()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('button').attributes('aria-checked')).toBe('false')
    expect(wrapper.get('button').attributes('title')).toBe('Switch to dark theme')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('PluginPage (the frame of a plugin page)', () => {
  it('shows the component the plugin names, and tells it its name', () => {
    const Page = { name: 'Page', props: ['component'], template: '<p class="page">{{ component }}</p>' }
    wrapper = mountComponent(PluginPage, { props: { plugin: { component: 'Page' } }, global: { components: { Page } } })
    expect(wrapper.get('.plugin-page .page').text()).toBe('Page')
  })
})
