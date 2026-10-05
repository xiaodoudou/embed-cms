import { describe, it, expect } from 'vitest'
import {
  fieldKind, columnAlign, buildColumns, defaultHiddenKeys, applyPrefs, orderedColumns, loadPrefs, savePrefs, clearPrefs,
  compareValues, sortRows, sortValue, nextSort, richTextToPlain, attachmentOf
} from '../../src/utils/tableModel.js'

const resource = {
  locales: ['enUS', 'zhCN', 'vi'],
  schema: [
    { field: 'title', input: 'string', localised: true },
    { field: 'rate', input: 'number', localised: false },
    { field: 'published', input: 'checkbox', localised: false },
    { field: 'cover', input: 'image', localised: false },
    { field: 'kind', input: 'select', localised: false }
  ]
}
const fields = [
  { originalModel: 'title', model: 'title.enUS', localised: true, label: 'Title (enUS)' },
  { originalModel: 'rate', model: 'rate', localised: false },
  { originalModel: 'published', model: 'published', localised: false },
  { originalModel: 'cover', model: 'cover', localised: false },
  { originalModel: 'kind', model: 'kind', localised: false }
]

function memoryStorage () {
  const data = {}
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v }, removeItem: (k) => { delete data[k] } }
}

describe('buildColumns (locale derivation)', () => {
  it('shows only the current locale of a localised field by default', () => {
    const columns = buildColumns(fields, resource)
    expect(columns.map((c) => c.key)).toEqual(['title.enUS', 'rate', 'published', 'cover', 'kind'])
    expect(columns[0].locale).toBe('enUS')
    expect(columns[1].locale).toBeNull()
  })
  it('expands every locale when asked, keeping one label per field', () => {
    const columns = buildColumns(fields, resource, { showAllLocales: true })
    expect(columns.filter((c) => c.originalModel === 'title').map((c) => c.key)).toEqual(['title.enUS', 'title.zhCN', 'title.vi'])
    expect(new Set(columns.filter((c) => c.originalModel === 'title').map((c) => c.label)).size).toBe(1)
  })
  it('derives kind, alignment, width and sortability from the input type', () => {
    const [title, rate, published, cover] = buildColumns(fields, resource)
    expect(title).toMatchObject({ kind: 'text', align: 'left', sortable: true })
    expect(rate).toMatchObject({ kind: 'number', align: 'right', width: 116 })
    expect(published).toMatchObject({ kind: 'boolean', width: 84 })
    expect(cover).toMatchObject({ kind: 'image', sortable: false })
    expect(fieldKind('unknown')).toBe('text')
  })
  it('shows a crop image like an image: the picture of its first file, and no sorting', () => {
    expect(fieldKind('cropimage')).toBe('image')
    expect(fieldKind('imagemap')).toBe('image')
    expect(fieldKind('rating')).toBe('rating')
    expect(fieldKind('duration')).toBe('duration')
    expect(fieldKind('money')).toBe('money')
    expect(fieldKind('phone')).toBe('phone')
    expect(fieldKind('markdown')).toBe('markdown')
    expect(fieldKind('daterange')).toBe('daterange')
    expect(fieldKind('geopoint')).toBe('geopoint')
    const [column] = buildColumns([{ originalModel: 'avatar', model: 'avatar', localised: false }], { locales: [], schema: [{ field: 'avatar', input: 'cropimage' }] })
    expect(column).toMatchObject({ kind: 'image', input: 'cropimage', sortable: false })
  })
  it('aligns a duration to the right, like a number', () => {
    expect(columnAlign('duration')).toBe('right')
    expect(columnAlign('money')).toBe('right')
    expect(columnAlign('number')).toBe('right')
    expect(columnAlign('text')).toBe('left')
    expect(columnAlign('duration', 'left')).toBe('left')
  })

  it('ignores groups and fields without a model', () => {
    expect(buildColumns([{ type: 'group' }, { model: 'x' }], resource)).toEqual([])
  })
})

describe('column preferences', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ key: `f${i}`, model: `f${i}` }))
  it('a wide schema starts with a compact set of visible columns', () => {
    expect(defaultHiddenKeys(many, 8)).toEqual(['f8', 'f9', 'f10', 'f11', 'f12', 'f13'])
    expect(defaultHiddenKeys(many.slice(0, 9), 8)).toEqual([])
    expect(applyPrefs(many).length).toBe(8)
  })
  it('honours hidden columns and order, new columns go last', () => {
    const cols = many.slice(0, 4)
    const visible = applyPrefs(cols, { hidden: ['f1'], order: ['f3', 'f0'] })
    expect(visible.map((c) => c.key)).toEqual(['f3', 'f0', 'f2'])
    expect(orderedColumns(cols, { order: ['f3'] }).map((c) => c.key)).toEqual(['f3', 'f0', 'f1', 'f2'])
  })
  it('persists per resource and can be reset', () => {
    const storage = memoryStorage()
    expect(loadPrefs(storage, 'articles')).toEqual({})
    savePrefs(storage, 'articles', { hidden: ['a'], order: ['b', 'a'], showAllLocales: true, junk: 1 })
    expect(loadPrefs(storage, 'articles')).toEqual({ hidden: ['a'], order: ['b', 'a'], showAllLocales: true })
    expect(loadPrefs(storage, 'other')).toEqual({})
    clearPrefs(storage, 'articles')
    expect(loadPrefs(storage, 'articles')).toEqual({})
  })
  it('survives broken or unavailable storage', () => {
    expect(loadPrefs({ getItem: () => '{oops' }, 'x')).toEqual({})
    expect(savePrefs({ setItem: () => { throw new Error('denied') } }, 'x', {})).toBe(false)
  })
})

describe('sorting', () => {
  const get = (row, key) => row[key]
  it('compares numbers numerically, text naturally, empty values last', () => {
    expect(compareValues(2, 10)).toBeLessThan(0)
    expect(compareValues('item 2', 'item 10')).toBeLessThan(0)
    expect(compareValues(undefined, 'a')).toBeGreaterThan(0)
    expect(compareValues('', null)).toBe(0)
    expect(compareValues([1, 2], [1])).toBeGreaterThan(0)
    expect(compareValues(true, false)).toBeGreaterThan(0)
  })
  it('sorts ascending and descending with empty values always last', () => {
    const rows = [{ n: 3 }, { n: undefined }, { n: 1 }, { n: 2 }]
    expect(sortRows(rows, [{ key: 'n', order: 'asc' }], get).map((r) => r.n)).toEqual([1, 2, 3, undefined])
    expect(sortRows(rows, [{ key: 'n', order: 'desc' }], get).map((r) => r.n)).toEqual([3, 2, 1, undefined])
    expect(rows.map((r) => r.n)).toEqual([3, undefined, 1, 2])
  })
  it('supports a secondary key and is stable', () => {
    const rows = [{ a: 'x', b: 2, id: 1 }, { a: 'y', b: 1, id: 2 }, { a: 'x', b: 1, id: 3 }, { a: 'x', b: 1, id: 4 }]
    const sorted = sortRows(rows, [{ key: 'a', order: 'asc' }, { key: 'b', order: 'asc' }], get)
    expect(sorted.map((r) => r.id)).toEqual([3, 4, 1, 2])
  })
  it('cycles none, asc, desc, none and adds a secondary key with shift', () => {
    let state = nextSort([], 'a')
    expect(state).toEqual([{ key: 'a', order: 'asc' }])
    state = nextSort(state, 'a')
    expect(state).toEqual([{ key: 'a', order: 'desc' }])
    state = nextSort(state, 'a')
    expect(state).toEqual([])
    state = nextSort(nextSort([], 'a'), 'b', true)
    expect(state).toEqual([{ key: 'a', order: 'asc' }, { key: 'b', order: 'asc' }])
    expect(nextSort(state, 'b', true)).toEqual([{ key: 'a', order: 'asc' }, { key: 'b', order: 'desc' }])
    expect(nextSort(nextSort(state, 'b', true), 'b', true)).toEqual([{ key: 'a', order: 'asc' }])
  })
})

describe('sorting date ranges', () => {
  it('sorts by the start, with the rows that have no range last', () => {
    const rows = [{ r: { start: 30, end: 40 } }, {}, { r: { start: 10, end: 90 } }, { r: { start: 20, end: 25 } }]
    const get = (row) => sortValue(row, { model: 'r', kind: 'daterange' })
    expect(sortRows(rows, [{ key: 'r', order: 'asc' }], get).map((row) => row.r && row.r.start)).toEqual([10, 20, 30, undefined])
    expect(sortRows(rows, [{ key: 'r', order: 'desc' }], get).map((row) => row.r && row.r.start)).toEqual([30, 20, 10, undefined])
  })
})

describe('sorting geopoints', () => {
  it('sorts by the latitude, with the rows that have no point last', () => {
    const rows = [{ p: { lat: 10, lng: 5 } }, {}, { p: { lat: -20, lng: 100 } }, { p: { lat: 48, lng: 2 } }]
    const get = (row) => sortValue(row, { model: 'p', kind: 'geopoint' })
    expect(sortRows(rows, [{ key: 'p', order: 'asc' }], get).map((row) => row.p && row.p.lat)).toEqual([-20, 10, 48, undefined])
    expect(sortRows(rows, [{ key: 'p', order: 'desc' }], get).map((row) => row.p && row.p.lat)).toEqual([48, 10, -20, undefined])
  })
})

describe('sorting markdown', () => {
  it('sorts by what the text says, not by its signs', () => {
    const rows = [{ body: '**banana**' }, { body: '# apple' }, { body: '[cherry](https://x.co)' }, {}]
    const column = { model: 'body', kind: 'markdown' }
    const get = (row) => sortValue(row, column)
    expect(sortRows(rows, [{ key: 'body', order: 'asc' }], get).map((r) => r.body)).toEqual(['# apple', '**banana**', '[cherry](https://x.co)', undefined])
  })
})

describe('sorting money', () => {
  it('sorts by the amount, whatever the currency, with the rows that have none last', () => {
    const rows = [
      { price: { amount: 30, currency: 'EUR' } }, { }, { price: { amount: 5, currency: 'JPY' } }, { price: { amount: 12.5, currency: 'USD' } }
    ]
    const column = { model: 'price', kind: 'money' }
    const get = (row) => sortValue(row, column)
    expect(sortRows(rows, [{ key: 'price', order: 'asc' }], get).map((r) => r.price && r.price.amount)).toEqual([5, 12.5, 30, undefined])
    expect(sortRows(rows, [{ key: 'price', order: 'desc' }], get).map((r) => r.price && r.price.amount)).toEqual([30, 12.5, 5, undefined])
  })
})

describe('richTextToPlain', () => {
  it('strips tags and entities', () => {
    expect(richTextToPlain('<p>Hello&nbsp;<strong>world</strong></p><p>Second &amp; last</p>')).toBe('Hello world Second & last')
    expect(richTextToPlain(undefined)).toBe('')
  })
})

describe('attachmentOf (image and file cells)', () => {
  const photo = { _id: 'a1', _filename: 'lamp.jpg', url: '/api/x/1/attachments/a1' }
  it('reads the attachments the API puts in the field', () => {
    expect(attachmentOf({ photo: [photo] }, { model: 'photo', originalModel: 'photo' })).toBe(photo)
  })
  it('reads the attachment of the current locale', () => {
    const record = { banner: { enUS: [photo], zhCN: [] } }
    expect(attachmentOf(record, { model: 'banner.enUS', originalModel: 'banner' })).toBe(photo)
    expect(attachmentOf(record, { model: 'banner.zhCN', originalModel: 'banner' })).toBe(undefined)
  })
  it('still reads the older _attachments list', () => {
    const record = { _attachments: [{ _name: 'photo', _filename: 'old.jpg' }] }
    expect(attachmentOf(record, { model: 'photo', originalModel: 'photo' })._filename).toBe('old.jpg')
  })
  it('finds nothing when there is no file', () => {
    expect(attachmentOf({ photo: [] }, { model: 'photo', originalModel: 'photo' })).toBe(undefined)
    expect(attachmentOf({}, { model: 'photo', originalModel: 'photo' })).toBe(undefined)
  })
})
