import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ThemeSwitch from '@c/ThemeSwitch.vue'
import LocaleList from '@c/LocaleList.vue'
import PluginPage from '@c/pages/PluginPage.vue'
import LoginService from '@s/LoginService'
import TranslateService from '@s/TranslateService'
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

  it('switches to the theme the server says, and says so', async () => {
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

  it('stays as it is when the server could not change the theme', async () => {
    LoginService.changeTheme.mockResolvedValue(undefined)
    mountSwitch()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('button').attributes('aria-checked')).toBe('false')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})

describe('LocaleList (the language buttons)', () => {
  beforeEach(() => {
    TranslateService.dict.enUS.TL_ENUS = 'English'
    TranslateService.dict.enUS.TL_ZHCN = 'Chinese'
  })

  it('shows nothing when there are fewer than two languages', () => {
    wrapper = mountComponent(LocaleList, { props: { localeList: ['enUS'] } })
    expect(wrapper.find('.locale-list').exists()).toBe(false)
    wrapper.unmount()
    wrapper = mountComponent(LocaleList, { props: {} })
    expect(wrapper.find('.locale-list').exists()).toBe(false)
  })

  it('has a button for each language, and marks the one in use', () => {
    TranslateService.locale = 'enUS'
    wrapper = mountComponent(LocaleList, { props: { localeList: ['zhCN', 'enUS'] } })
    const buttons = wrapper.findAll('button.locale')
    expect(buttons.map((button) => button.text())).toEqual(['Chinese', 'English'])
    expect(buttons.map((button) => button.classes('active'))).toEqual([false, true])
    expect(buttons.map((button) => button.attributes('aria-pressed'))).toEqual(['false', 'true'])
    expect(wrapper.get('.locale-list').attributes('aria-label')).toBe('Language')
  })

  it('changes the language of the app when a button is clicked', async () => {
    const setLocale = vi.spyOn(TranslateService, 'setLocale').mockImplementation(() => {})
    wrapper = mountComponent(LocaleList, { props: { localeList: ['enUS', 'zhCN'] } })
    await wrapper.findAll('button.locale')[1].trigger('click')
    expect(setLocale).toHaveBeenCalledWith('zhCN')
  })
})

describe('PluginPage (the frame of a plugin page)', () => {
  it('shows the component the plugin names, and tells it its name', () => {
    const Page = { name: 'Page', props: ['component'], template: '<p class="page">{{ component }}</p>' }
    wrapper = mountComponent(PluginPage, { props: { plugin: { component: 'Page' } }, global: { components: { Page } } })
    expect(wrapper.get('.plugin-page .page').text()).toBe('Page')
  })
})
