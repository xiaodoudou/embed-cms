import { describe, it, expect, afterEach, vi } from 'vitest'
import TopBarLocaleList from '@c/layout/TopBarLocaleList.vue'
import TranslateService from '@s/TranslateService'
import { mountComponent } from './helpers/mountField.js'

TranslateService.dict.enUS.TL_ENUS = 'English'
TranslateService.dict.enUS.TL_ZHCN = 'Chinese'

let wrapper
const list = ({ attachTo, ...props } = {}) => {
  wrapper = mountComponent(TopBarLocaleList, { props: { locales: ['enUS', 'zhCN'], locale: 'enUS', ...props }, attachTo })
  return wrapper
}
const buttons = () => wrapper.findAll('.locale-btn')

afterEach(() => wrapper?.unmount())

describe('TopBarLocaleList (the back button and the language switch)', () => {
  it('has a back button that goes back', async () => {
    const back = vi.fn()
    list({ back })
    expect(wrapper.get('.back').text()).toBe('Back')
    await wrapper.get('.back').trigger('click')
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('has one box under the selected language, whatever the number of languages', async () => {
    list({ locales: ['enUS', 'zhCN', 'frFR'], locale: 'zhCN' })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.locale-indicator')).toHaveLength(1)
    expect(wrapper.get('.locale-indicator').attributes('style')).toContain('opacity: 1')
    await wrapper.setProps({ locale: 'frFR' })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.locale-indicator').attributes('style')).toContain('translate(')
    await wrapper.setProps({ locale: 'xxXX' })
    // the watcher moves the box on the tick after the one that renders the new locale
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.locale-indicator').attributes('style')).toContain('opacity: 0')
  })

  it('toggles between two languages: any click on the switch goes to the other one', async () => {
    const selectLocale = vi.fn()
    list({ selectLocale })
    await buttons()[0].trigger('click')
    expect(selectLocale).toHaveBeenLastCalledWith('zhCN')
    await wrapper.get('.locales').trigger('click')
    expect(selectLocale).toHaveBeenCalledTimes(2)
    expect(selectLocale).toHaveBeenLastCalledWith('zhCN')
    await wrapper.setProps({ locale: 'zhCN' })
    await buttons()[1].trigger('click')
    expect(selectLocale).toHaveBeenLastCalledWith('enUS')
  })

  it('selects the clicked language when there are more than two, and ignores a click beside the buttons', async () => {
    const selectLocale = vi.fn()
    list({ selectLocale, locales: ['enUS', 'zhCN', 'frFR'] })
    await buttons()[2].trigger('click')
    expect(selectLocale).toHaveBeenLastCalledWith('frFR')
    await wrapper.get('.locales').trigger('click')
    expect(selectLocale).toHaveBeenCalledTimes(1)
  })

  it('has one button per language, in words', () => {
    list()
    expect(buttons().map((button) => button.text())).toEqual(['English', 'Chinese'])
    expect(wrapper.get('.locales').attributes('aria-label')).toBe('Content language')
  })

  it('marks the language that is shown', () => {
    list({ locale: 'zhCN' })
    expect(buttons().map((button) => button.classes('selected'))).toEqual([false, true])
    expect(buttons().map((button) => button.attributes('aria-pressed'))).toEqual(['false', 'true'])
  })

  it('switches to the language that is clicked', async () => {
    const selectLocale = vi.fn()
    list({ selectLocale })
    await buttons()[1].trigger('click')
    expect(selectLocale).toHaveBeenCalledWith('zhCN')
  })

  it('hides the switch, but keeps the back button, when there are no languages', () => {
    list({ locales: [] })
    expect(wrapper.classes()).toContain('hidden')
    expect(wrapper.find('.locales').exists()).toBe(false)
    expect(wrapper.find('.back').exists()).toBe(true)
  })

  it('shows the switch when there are languages', () => {
    list()
    expect(wrapper.classes()).not.toContain('hidden')
  })

  describe('the marks', () => {
    it('has none for a language with nothing to say', () => {
      list()
      expect(wrapper.find('.locale-dirty').exists()).toBe(false)
      expect(wrapper.find('.locale-missing').exists()).toBe(false)
    })

    it('marks the languages with unsaved edits, and says so', () => {
      list({ dirtyLocales: ['zhCN'] })
      expect(buttons()[0].find('.locale-dirty').exists()).toBe(false)
      const dot = buttons()[1].get('.locale-dirty')
      expect(dot.attributes('aria-label')).toBe('Unsaved changes in Chinese')
      expect(dot.attributes('title')).toBe('Unsaved changes in Chinese')
    })

    it('marks one missing required field without a count', () => {
      list({ missing: { enUS: 1 } })
      const mark = buttons()[0].get('.locale-missing')
      expect(mark.attributes('aria-label')).toBe('1 required field missing in English')
      expect(mark.find('.locale-missing-count').exists()).toBe(false)
    })

    it('marks several missing required fields with their count', () => {
      list({ missing: { zhCN: 3 } })
      const mark = buttons()[1].get('.locale-missing')
      expect(mark.attributes('aria-label')).toBe('3 required fields missing in Chinese')
      expect(mark.get('.locale-missing-count').text()).toBe('3')
    })

    it('shows both marks on one language', () => {
      list({ dirtyLocales: ['enUS'], missing: { enUS: 2 } })
      expect(buttons()[0].find('.locale-dirty').exists()).toBe(true)
      expect(buttons()[0].find('.locale-missing').exists()).toBe(true)
    })
  })

  it('toggles to the other language', () => {
    const selectLocale = vi.fn()
    list({ selectLocale })
    wrapper.vm.toggleLocale()
    expect(selectLocale).toHaveBeenCalledWith('zhCN')
  })
})

describe('TopBarLocaleList on a phone (one button instead of the tabs)', () => {
  const original = window.matchMedia
  const phone = (matches = true) => {
    window.matchMedia = (query) => ({ matches: matches && query === '(max-width: 767.98px), (pointer: coarse) and (max-height: 500px)', media: query, addEventListener () {}, removeEventListener () {} })
  }
  afterEach(() => {
    window.matchMedia = original
  })
  const compact = () => wrapper.find('.locale-compact')

  it('has no tabs and no indicator: the language is one button', () => {
    phone()
    list({ locales: ['enUS', 'zhCN', 'frFR'] })
    expect(wrapper.find('.locales').exists()).toBe(false)
    expect(compact().exists()).toBe(true)
    expect(compact().text()).toContain('English')
  })

  it('keeps the tabs on a screen that is not a phone', () => {
    phone(false)
    list({ locales: ['enUS', 'zhCN', 'frFR'] })
    expect(wrapper.find('.locales').exists()).toBe(true)
    expect(compact().exists()).toBe(false)
  })

  it('changes the language with a press, and says to which, when there are two', async () => {
    phone()
    const selectLocale = vi.fn()
    list({ selectLocale })
    expect(compact().attributes('aria-label')).toBe('Content language: English. Switch to Chinese')
    await compact().trigger('click')
    expect(selectLocale).toHaveBeenCalledWith('zhCN')
    await wrapper.setProps({ locale: 'zhCN' })
    expect(compact().attributes('aria-label')).toBe('Content language: Chinese. Switch to English')
    await compact().trigger('click')
    expect(selectLocale).toHaveBeenLastCalledWith('enUS')
  })

  it('opens the list of languages when there are more than two, and chooses one', async () => {
    phone()
    const selectLocale = vi.fn()
    list({ selectLocale, locales: ['enUS', 'zhCN', 'frFR', 'jaJP'], attachTo: document.body })
    expect(compact().attributes('aria-haspopup')).toBe('menu')
    expect(compact().attributes('aria-expanded')).toBe('false')
    await compact().trigger('click')
    await wrapper.vm.$nextTick()
    const items = [...document.body.querySelectorAll('.locale-menu .locale-item')]
    expect(items.map((item) => item.textContent.trim())).toEqual(['English', 'Chinese', 'frFR', 'jaJP'])
    expect(items[0].classList.contains('selected')).toBe(true)
    items[3].click()
    expect(selectLocale).toHaveBeenCalledWith('jaJP')
  })

  it('shows the markers of the language that is shown on the button, and of each one in the list', async () => {
    phone()
    list({ locales: ['enUS', 'zhCN', 'frFR'], dirtyLocales: ['enUS', 'frFR'], missing: { enUS: 1, frFR: 3 }, attachTo: document.body })
    expect(compact().find('.locale-dirty').exists()).toBe(true)
    expect(compact().find('.locale-missing').exists()).toBe(true)
    await compact().trigger('click')
    await wrapper.vm.$nextTick()
    const french = [...document.body.querySelectorAll('.locale-menu .locale-item')][2]
    expect(french.querySelector('.locale-dirty')).not.toBeNull()
    expect(french.querySelector('.locale-missing-count').textContent).toBe('3')
  })

  it('puts a dot on the button when another language needs a look, and not when only the shown one does', async () => {
    phone()
    list({ locales: ['enUS', 'zhCN', 'frFR'], dirtyLocales: ['enUS'] })
    expect(compact().find('.locale-others').exists()).toBe(false)
    await wrapper.setProps({ dirtyLocales: ['frFR'] })
    expect(compact().find('.locale-others').exists()).toBe(true)
    expect(compact().attributes('aria-label')).toContain('Other languages have unsaved edits or missing fields')
    await wrapper.setProps({ dirtyLocales: [], missing: { zhCN: 2 } })
    expect(compact().find('.locale-others').exists()).toBe(true)
    expect(compact().get('.locale-others').text()).toBe('1')
    expect(compact().get('.locale-others').classes()).toContain('has-missing')
    await wrapper.setProps({ dirtyLocales: ['zhCN', 'frFR'], missing: {} })
    expect(compact().get('.locale-others').text()).toBe('2')
    expect(compact().get('.locale-others').classes()).not.toContain('has-missing')
  })

  it('follows the screen when it becomes a phone', async () => {
    const listeners = []
    window.matchMedia = (query) => ({ matches: false, media: query, addEventListener: (type, fn) => listeners.push(fn), removeEventListener () {} })
    list({ locales: ['enUS', 'zhCN', 'frFR'] })
    expect(wrapper.find('.locales').exists()).toBe(true)
    wrapper.vm.phoneMedia = { matches: true, removeEventListener () {} }
    listeners.forEach((fn) => fn())
    await wrapper.vm.$nextTick()
    expect(compact().exists()).toBe(true)
  })

  it('shows the arrow of Back alone, with its name for a screen reader', () => {
    phone()
    list()
    expect(wrapper.get('.back').classes()).toContain('is-icon')
    expect(wrapper.find('.back-text').exists()).toBe(false)
    expect(wrapper.get('.back').attributes('aria-label')).toBe('Back')
    wrapper.unmount()
    phone(false)
    list()
    expect(wrapper.get('.back').classes()).not.toContain('is-icon')
    expect(wrapper.get('.back-text').text()).toBe('Back')
  })

  it('also turns to the button, off a phone, when the tabs do not fit the bar', async () => {
    phone(false)
    list({ locales: ['enUS', 'zhCN', 'frFR', 'thTH', 'jaJP', 'koKR', 'deDE', 'esES', 'ptBR', 'viVN'] })
    expect(wrapper.find('.locales').exists()).toBe(true)
    wrapper.vm.measure(674)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.locales').exists()).toBe(false)
    expect(compact().exists()).toBe(true)
    expect(wrapper.get('.back').classes()).not.toContain('is-icon')
    wrapper.vm.measure(2000)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.locales').exists()).toBe(true)
  })

  it('has only the back button and the one language for a single language', () => {
    phone()
    list({ locales: ['enUS'] })
    expect(compact().exists()).toBe(false)
    expect(wrapper.find('.locales').exists()).toBe(true)
  })
})
