import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import TranslateService from '@s/TranslateService'

// The name of a language of a resource, as the language switch, the table and the messages write it.

const saved = {}
beforeEach(() => {
  saved.dict = TranslateService.dict.enUS
  saved.locale = TranslateService.locale
  TranslateService.dict.enUS = { TL_FRFR: 'French', TL_JAJP: 'jaJP' }
  TranslateService.locale = 'enUS'
})
afterEach(() => {
  TranslateService.dict.enUS = saved.dict
  TranslateService.locale = saved.locale
})

describe('TranslateService.localeName', () => {
  it('says what the dictionary calls a language', () => {
    expect(TranslateService.localeName('frFR')).toBe('French')
    expect(TranslateService.localeName('jaJP')).toBe('jaJP')
  })

  it('writes the code of a language nobody has named, not a key', () => {
    expect(TranslateService.localeName('itIT')).toBe('itIT')
    expect(TranslateService.localeName('itIT')).not.toMatch(/^TL_/)
  })

  it('reads the language in the case it is written in the key', () => {
    expect(TranslateService.localeName('FRFR')).toBe('French')
  })

  it('has nothing for no language', () => {
    expect(TranslateService.localeName(undefined)).toBe('')
  })
})
