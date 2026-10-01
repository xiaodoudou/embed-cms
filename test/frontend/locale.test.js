import { describe, it, expect } from 'vitest'
import { localeTag, savedUserLanguage } from '@u/locale'

describe('localeTag', () => {
  it('turns the name of a locale of the CMS into a language tag', () => {
    expect(localeTag('enUS')).toBe('en-US')
    expect(localeTag('zhCN')).toBe('zh-CN')
    expect(localeTag('frFR')).toBe('fr-FR')
  })

  it('falls back to English for a name it does not know', () => {
    expect(localeTag(undefined)).toBe('en-US')
    expect(localeTag('klingon')).toBe('en-US')
  })
})

// Saving the user record of the person who is logged in shows the language they chose at once.
describe('savedUserLanguage', () => {
  const locales = ['enUS', 'zhCN']
  const me = { username: 'edouard' }

  it('is the language just saved on the own user record', () => {
    expect(savedUserLanguage('_users', { username: 'edouard', language: 'zhCN' }, me, locales, 'enUS')).toBe('zhCN')
  })

  it('is null when nothing changes for this person', () => {
    expect(savedUserLanguage('_users', { username: 'edouard', language: 'enUS' }, me, locales, 'enUS')).toBe(null)
    expect(savedUserLanguage('_users', { username: 'someone', language: 'zhCN' }, me, locales, 'enUS')).toBe(null)
    expect(savedUserLanguage('articles', { username: 'edouard', language: 'zhCN' }, me, locales, 'enUS')).toBe(null)
    expect(savedUserLanguage('_users', { username: 'edouard', language: 'zhCN' }, undefined, locales, 'enUS')).toBe(null)
  })

  it('ignores an empty language and one the admin does not have', () => {
    expect(savedUserLanguage('_users', { username: 'edouard', language: '' }, me, locales, 'zhCN')).toBe(null)
    expect(savedUserLanguage('_users', { username: 'edouard', language: 'frFR' }, me, locales, 'enUS')).toBe(null)
  })
})
