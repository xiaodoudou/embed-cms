import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { getResourceLabel } from '@u/recordLabel'
import TranslateService from '@s/TranslateService'

// The name of a resource or of a plugin page in the menus, the breadcrumb, the tab and the quick switcher.
describe('getResourceLabel', () => {
  const original = TranslateService.locale

  beforeEach(() => {
    TranslateService.dict.enUS = { TL_SYSLOG: 'Syslog' }
    TranslateService.dict.zhCN = { TL_SYSLOG: '系统日志' }
    TranslateService.setLocale('enUS')
  })
  afterEach(() => {
    TranslateService.setLocale(original)
  })

  it('translates the label of a plugin page, in the language of the user', () => {
    const page = { title: 'Syslog', displayname: 'Syslog', label: 'TL_SYSLOG' }
    expect(getResourceLabel(page)).toBe('Syslog')
    TranslateService.setLocale('zhCN')
    expect(getResourceLabel(page)).toBe('系统日志')
  })

  it('keeps the display name for what a group refers to, and falls back to it when a page has no label', () => {
    expect(getResourceLabel({ title: 'Legacy', displayname: 'Legacy page' })).toBe('Legacy page')
  })

  it('translates the display name of a resource, and falls back to its title', () => {
    expect(getResourceLabel({ title: 'orders', displayname: { enUS: 'Orders', zhCN: '订单' } })).toBe('Orders')
    TranslateService.setLocale('zhCN')
    expect(getResourceLabel({ title: 'orders', displayname: { enUS: 'Orders', zhCN: '订单' } })).toBe('订单')
    expect(getResourceLabel({ title: 'orders' })).toBe('orders')
    expect(getResourceLabel(undefined)).toBe('')
  })
})
