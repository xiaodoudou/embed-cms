import { describe, it, expect, afterEach, vi } from 'vitest'
import TopBarLocaleList from '@c/TopBarLocaleList.vue'
import TranslateService from '@s/TranslateService'
import { mountComponent } from './helpers/mountField.js'

TranslateService.dict.enUS.TL_ENUS = 'English'
TranslateService.dict.enUS.TL_ZHCN = 'Chinese'

let wrapper
const list = (props = {}) => {
  wrapper = mountComponent(TopBarLocaleList, { props: { locales: ['enUS', 'zhCN'], locale: 'enUS', ...props } })
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
