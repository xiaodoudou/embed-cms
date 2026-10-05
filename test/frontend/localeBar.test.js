import { describe, it, expect } from 'vitest'
import { tabsFit, TAB_WIDTH } from '@u/localeBar'

describe('tabsFit', () => {
  it('keeps the tabs of the languages a project really has (up to four) in an editor of the usual width', () => {
    for (const count of [1, 2, 3, 4]) {
      expect(tabsFit(count, 674), String(count)).toBe(true)
    }
  })

  it('puts ten languages in a button, whatever the width of a computer', () => {
    expect(tabsFit(10, 674)).toBe(false)
    expect(tabsFit(10, 1100)).toBe(false)
    expect(tabsFit(10, 1800)).toBe(true)
  })

  it('puts four languages in a button when the editor is narrow (beside the list and the navigation)', () => {
    expect(tabsFit(4, 606)).toBe(false)
    expect(tabsFit(2, 400)).toBe(true)
  })

  it('lets the tabs take half of the bar, no more', () => {
    expect(tabsFit(5, 5 * TAB_WIDTH * 2)).toBe(true)
    expect(tabsFit(5, 5 * TAB_WIDTH * 2 - 1)).toBe(false)
  })

  it('keeps the tabs while the width is not known', () => {
    expect(tabsFit(10, 0)).toBe(true)
    expect(tabsFit(10, NaN)).toBe(true)
    expect(tabsFit(10, undefined)).toBe(true)
  })
})
