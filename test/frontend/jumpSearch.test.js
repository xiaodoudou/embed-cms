import { describe, it, expect } from 'vitest'
import { highlightParts, searchOutline } from '@u/jumpSearch'

// The search box of the Jump to field menu.

const rows = [
  { key: 'name', label: 'Name' },
  { key: 'address.city', label: 'Address · City' },
  { key: 'address.postcode', label: 'Address · Postcode' },
  { key: 'tiles', label: 'Tiles' },
  { key: 'tiles[0]', label: 'Tile · News', block: 0 },
  { key: 'tiles[0].heading', label: 'Heading', block: 0, blockField: 'heading' },
  { key: 'tiles[1]', label: 'Tile 2', block: 1 },
  { key: 'tiles[1].heading', label: 'Heading', block: 1, blockField: 'heading' }
]
const labels = (found) => found.map((row) => row.entry.label)

describe('highlightParts', () => {
  it('cuts the text in runs, the matched letters apart', () => {
    expect(highlightParts('Address', [0, 1, 5])).toEqual([{ text: 'Ad', hit: true }, { text: 'dre', hit: false }, { text: 's', hit: true }, { text: 's', hit: false }])
  })

  it('is one run when nothing matched, and has no run for no text', () => {
    expect(highlightParts('Name')).toEqual([{ text: 'Name', hit: false }])
    expect(highlightParts('')).toEqual([])
  })

  it('keeps a letter that is more than one code unit whole', () => {
    expect(highlightParts('a😀b', [1])).toEqual([{ text: 'a', hit: false }, { text: '😀', hit: true }, { text: 'b', hit: false }])
  })
})

describe('searchOutline', () => {
  it('keeps every row, in the order of the form, when nothing is typed', () => {
    expect(labels(searchOutline(rows, ''))).toEqual(rows.map((row) => row.label))
    expect(labels(searchOutline(rows, '   '))).toHaveLength(rows.length)
    expect(searchOutline(rows, '')[0].parts).toEqual([{ text: 'Name', hit: false }])
  })

  it('keeps the rows that hold the letters in order, and marks them', () => {
    const found = searchOutline(rows, 'pst')
    expect(labels(found)).toEqual(['Address · Postcode'])
    expect(found[0].parts.filter((part) => part.hit).map((part) => part.text).join('').toLowerCase()).toBe('pst')
  })

  it('ignores the case', () => {
    expect(labels(searchOutline(rows, 'CITY'))).toEqual(['Address · City'])
  })

  it('puts the best match first', () => {
    expect(labels(searchOutline(rows, 'tile'))[0]).toBe('Tiles')
  })

  it('says nothing for what no row holds', () => {
    expect(searchOutline(rows, 'zzz')).toEqual([])
  })

  it('searches a field of a block with the name of its block, and marks only the letters of its own name', () => {
    const found = searchOutline(rows, 'news head')
    expect(found).toHaveLength(1)
    expect(found[0].entry.key).toBe('tiles[0].heading')
    expect(found[0].parts.filter((part) => part.hit).map((part) => part.text).join('').toLowerCase()).toBe('head')
  })

  it('does not change the rows it is given', () => {
    const copy = JSON.parse(JSON.stringify(rows))
    searchOutline(rows, 'tile')
    expect(rows).toEqual(copy)
  })
})
