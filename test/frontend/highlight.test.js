import { describe, it, expect } from 'vitest'
import { highlightSegments, withGroupHeadings } from '../../src/utils/highlight.js'

describe('highlightSegments', () => {
  it('marks every case-insensitive match and keeps the original text', () => {
    expect(highlightSegments('Chair and chairs', 'CHAIR')).toEqual([
      { text: 'Chair', match: true }, { text: ' and ', match: false }, { text: 'chair', match: true }, { text: 's', match: false }
    ])
  })
  it('returns the whole text for an empty query or no match', () => {
    expect(highlightSegments('Chairs', '')).toEqual([{ text: 'Chairs', match: false }])
    expect(highlightSegments('Chairs', 'zzz')).toEqual([{ text: 'Chairs', match: false }])
    expect(highlightSegments(undefined, 'a')).toEqual([{ text: '', match: false }])
  })
  it('does not treat the query as a pattern', () => {
    expect(highlightSegments('a.b (c)', '(c)')).toEqual([{ text: 'a.b ', match: false }, { text: '(c)', match: true }])
  })
})

describe('withGroupHeadings', () => {
  const items = [{ n: 'a', g: 'B' }, { n: 'b', g: 'A' }, { n: 'c', g: '' }, { n: 'd', g: 'B' }]
  it('adds a heading before every group and puts ungrouped items last', () => {
    const list = withGroupHeadings(items, (i) => i.g)
    expect(list.map((i) => i.title || i.n)).toEqual(['B', 'a', 'd', 'A', 'b', 'c'])
    expect(list[0]).toEqual({ type: 'subheader', title: 'B' })
  })
  it('leaves an ungrouped list alone', () => {
    const plain = [{ n: 'a' }, { n: 'b' }]
    expect(withGroupHeadings(plain, () => '')).toBe(plain)
  })
})
