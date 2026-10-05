import { describe, it, expect } from 'vitest'
import { tabsFit, tabWidth, TAB_WIDTH } from '@u/localeBar'

const clean = (count) => Array.from({ length: count }, () => ({}))

describe('tabWidth', () => {
  it('is the name, and a marker widens it', () => {
    expect(tabWidth()).toBe(TAB_WIDTH)
    expect(tabWidth({ dirty: true })).toBeGreaterThan(tabWidth())
    expect(tabWidth({ missing: 1 })).toBeGreaterThan(tabWidth({ dirty: true }))
    expect(tabWidth({ missing: 3 })).toBeGreaterThan(tabWidth({ missing: 1 }))
    expect(tabWidth({ dirty: true, missing: 3 })).toBeGreaterThan(tabWidth({ missing: 3 }))
  })
})

describe('tabsFit', () => {
  it('keeps the tabs of the languages a project really has (up to four) in an editor of the usual width', () => {
    for (const count of [1, 2, 3, 4]) {
      expect(tabsFit(clean(count), 674), String(count)).toBe(true)
    }
  })

  it('puts the tabs in a button when their markers make them too wide, and back when the markers go', () => {
    const marked = Array.from({ length: 4 }, () => ({ dirty: true, missing: 3 }))
    expect(tabsFit(marked, 674)).toBe(false)
    expect(tabsFit(marked, 1400)).toBe(true)
    expect(tabsFit(clean(4), 674)).toBe(true)
  })

  it('puts ten languages in a button, whatever the width of a computer', () => {
    expect(tabsFit(clean(10), 674)).toBe(false)
    expect(tabsFit(clean(10), 1100)).toBe(false)
    expect(tabsFit(clean(10), 1800)).toBe(true)
  })

  it('puts four languages in a button when the editor is narrow (beside the list and the navigation)', () => {
    expect(tabsFit(clean(4), 470)).toBe(false)
    expect(tabsFit(clean(2), 400)).toBe(true)
  })

  it('lets the tabs take half of the bar, no more', () => {
    expect(tabsFit(clean(5), 5 * TAB_WIDTH * 2)).toBe(true)
    expect(tabsFit(clean(5), 5 * TAB_WIDTH * 2 - 1)).toBe(false)
  })

  it('keeps the tabs while the width is not known', () => {
    expect(tabsFit(clean(10), 0)).toBe(true)
    expect(tabsFit(clean(10), NaN)).toBe(true)
    expect(tabsFit(clean(10), undefined)).toBe(true)
  })
})
