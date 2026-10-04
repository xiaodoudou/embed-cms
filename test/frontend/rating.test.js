import { describe, it, expect } from 'vitest'
import { ICONS, COLORS, DEFAULT_MAX, MAX_LIMIT, ratingOptions, stepsOf, normaliseRating, fillOf, ratingText } from '@u/rating'

// The choices of the rating field and the arithmetic of its widget.

describe('ratingOptions', () => {
  it('has five stars, whole, that can be taken away, by default', () => {
    expect(ratingOptions({})).toEqual({ max: 5, half: false, icon: 'star', color: 'warning', clearable: true })
    expect(DEFAULT_MAX).toBe(5)
  })

  it('reads the options from the schema or from its options', () => {
    expect(ratingOptions({ max: 3 }).max).toBe(3)
    expect(ratingOptions({ options: { max: 7, half: true, icon: 'heart', clearable: false } })).toEqual({ max: 7, half: true, icon: 'heart', color: 'error', clearable: false })
  })

  it('keeps the number of icons from 1 to ten, and the default for what is not a number', () => {
    expect(ratingOptions({ max: 0 }).max).toBe(5)
    expect(ratingOptions({ max: -3 }).max).toBe(5)
    expect(ratingOptions({ max: 'many' }).max).toBe(5)
    expect(ratingOptions({ max: 100 }).max).toBe(MAX_LIMIT)
    expect(ratingOptions({ max: 6.6 }).max).toBe(7)
    expect(ratingOptions({ max: 1 }).max).toBe(1)
  })

  it('knows its icons, and takes a star for one it does not know', () => {
    for (const icon of Object.keys(ICONS)) {
      expect(ratingOptions({ icon }).icon).toBe(icon)
    }
    expect(ratingOptions({ icon: 'banana' }).icon).toBe('star')
    expect(ratingOptions({ icon: undefined }).icon).toBe('star')
  })

  it('has a colour for each icon, and takes the one of the field when it is a colour of the theme', () => {
    expect(['star', 'heart', 'thumb', 'flame', 'bolt', 'circle'].map(icon => ratingOptions({ icon }).color)).toEqual(['warning', 'error', 'primary', 'warning', 'primary', 'primary'])
    expect(ratingOptions({ color: 'success' }).color).toBe('success')
    expect(ratingOptions({ color: 'hotpink', icon: 'heart' }).color).toBe('error')
    expect(COLORS).toContain('primary')
  })

  it('has a half only when it is true, not for a text or a number', () => {
    expect(ratingOptions({ half: true }).half).toBe(true)
    expect(ratingOptions({ half: 'yes' }).half).toBe(false)
    expect(ratingOptions({ half: 1 }).half).toBe(false)
  })

  it('can be taken away unless the field says no', () => {
    expect(ratingOptions({ clearable: false }).clearable).toBe(false)
    expect(ratingOptions({ clearable: 0 }).clearable).toBe(true)
  })
})

describe('stepsOf', () => {
  it('is each icon, or each half of an icon', () => {
    expect(stepsOf(3, false)).toEqual([1, 2, 3])
    expect(stepsOf(3, true)).toEqual([0.5, 1, 1.5, 2, 2.5, 3])
    expect(stepsOf(1, false)).toEqual([1])
  })
})

describe('normaliseRating', () => {
  it('is a number from the first step to the most, rounded to the step', () => {
    expect(normaliseRating(3, 5, false)).toBe(3)
    expect(normaliseRating(3.4, 5, false)).toBe(3)
    expect(normaliseRating(3.6, 5, false)).toBe(4)
    expect(normaliseRating(3.3, 5, true)).toBe(3.5)
    expect(normaliseRating(3.2, 5, true)).toBe(3)
    expect(normaliseRating(9, 5, false)).toBe(5)
    expect(normaliseRating(0.2, 5, false)).toBe(1)
    expect(normaliseRating(0.2, 5, true)).toBe(0.5)
  })

  it('reads a number written as text', () => {
    expect(normaliseRating(' 4 ', 5, false)).toBe(4)
    expect(normaliseRating('2.5', 5, true)).toBe(2.5)
  })

  it('is nothing for what is not a rating, and for no rating (0)', () => {
    for (const value of [undefined, null, '', 'abc', NaN, Infinity, -2, 0, '0', {}, [], true]) {
      expect(normaliseRating(value, 5, false), String(value)).toBe(undefined)
    }
  })
})

describe('fillOf', () => {
  it('says how much of an icon is filled by the rating that is shown', () => {
    expect([0, 1, 2, 3, 4].map(index => fillOf(index, 2.5))).toEqual([1, 1, 0.5, 0, 0])
    expect([0, 1, 2].map(index => fillOf(index, 3))).toEqual([1, 1, 1])
    expect([0, 1].map(index => fillOf(index, 0))).toEqual([0, 0])
    expect(fillOf(0, 0.5)).toBe(0.5)
  })
})

describe('ratingText', () => {
  it('reads 3.5 / 5, and nothing without a rating', () => {
    expect(ratingText(3.5, 5)).toBe('3.5 / 5')
    expect(ratingText(4, 10)).toBe('4 / 10')
    expect(ratingText(undefined, 5)).toBe('')
    expect(ratingText(0, 5)).toBe('')
    expect(ratingText('x', 5)).toBe('')
  })
})
