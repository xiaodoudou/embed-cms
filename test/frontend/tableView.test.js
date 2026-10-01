import { describe, it, expect } from 'vitest'
import {
  buildColumns, defaultHiddenKeys, applyPrefs, loadPrefs, savePrefs, fieldsFromSchema, toggleColumn, moveColumn, visibleLocales,
  selectionState, toggleId, toggleAllIds, selectRange, rowWindow, scrollTopForRow, moveFocus, matchesSearch,
  formatDateValue, formatNumberValue, chipsFor, sortValue, columnWidth, distributeWidths, isEmptyValue, isColumnHidden
} from '../../src/utils/tableModel.js'

const resource = {
  locales: ['enUS', 'zhCN', 'vi'],
  schema: [
    { field: 'title', input: 'string', localised: true },
    { field: 'rate', input: 'number', localised: false },
    { field: 'published', input: 'checkbox', localised: false }
  ]
}

function memoryStorage () {
  const data = {}
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v }, removeItem: (k) => { delete data[k] } }
}

describe('columns from the schema', () => {
  it('builds field descriptors with the current locale in the model of localised fields', () => {
    const list = fieldsFromSchema(resource, 'zhCN')
    expect(list.map((f) => f.model)).toEqual(['title.zhCN', 'rate', 'published'])
    expect(list[0]).toMatchObject({ originalModel: 'title', localised: true })
    expect(fieldsFromSchema({ schema: [{ field: 'a', input: 'string' }] }, 'enUS')[0]).toMatchObject({ model: 'a', localised: false })
    expect(fieldsFromSchema({ locales: ['enUS'], schema: [{ field: 'a', input: 'string' }] }, 'enUS')[0].localised).toBe(true)
  })
  it('orders by options.index and shows only the numbered columns by default', () => {
    const res = { schema: [
      { field: 'c', input: 'string', options: { index: 2 } },
      { field: 'a', input: 'string' },
      { field: 'b', input: 'string', options: { index: 1 } }
    ] }
    const columns = buildColumns(fieldsFromSchema(res, 'enUS'), res)
    expect(columns.map((c) => c.key)).toEqual(['b', 'c', 'a'])
    expect(defaultHiddenKeys(columns)).toEqual(['a'])
    expect(applyPrefs(columns).map((c) => c.key)).toEqual(['b', 'c'])
  })
  it('caps the numbered columns of a wide schema', () => {
    const res = { schema: Array.from({ length: 13 }, (_, i) => ({ field: `f${i}`, input: 'string', options: { index: i } })) }
    const columns = buildColumns(fieldsFromSchema(res, 'enUS'), res)
    expect(applyPrefs(columns).length).toBe(8)
  })
  it('reports the locales that are visible together', () => {
    expect(visibleLocales(buildColumns(fieldsFromSchema(resource, 'enUS'), resource))).toEqual(['enUS'])
    expect(visibleLocales(buildColumns(fieldsFromSchema(resource, 'enUS'), resource, { showAllLocales: true }))).toEqual(['enUS', 'zhCN', 'vi'])
  })
  it('remembers the sort per resource next to the column choices', () => {
    const storage = memoryStorage()
    savePrefs(storage, 'products', { hidden: [], sortBy: [{ key: 'price', order: 'desc' }] })
    expect(loadPrefs(storage, 'products').sortBy).toEqual([{ key: 'price', order: 'desc' }])
  })
})

describe('column menu logic', () => {
  const cols = ['a', 'b', 'c'].map((key) => ({ key, model: key }))
  it('hides and shows a column, but never the last visible one', () => {
    let prefs = toggleColumn(cols, {}, 'b')
    expect(prefs.hidden).toEqual(['b'])
    expect(isColumnHidden(cols, prefs, 'b')).toBe(true)
    prefs = toggleColumn(cols, prefs, 'a')
    prefs = toggleColumn(cols, prefs, 'c')
    expect([...prefs.hidden].sort()).toEqual(['a', 'b'])
    expect([...toggleColumn(cols, prefs, 'c').hidden].sort()).toEqual(['a', 'b'])
    expect(toggleColumn(cols, prefs, 'b').hidden).toEqual(['a'])
  })
  it('moves a column up and down inside the full order and stops at the ends', () => {
    expect(moveColumn(cols, {}, 'c', -1).order).toEqual(['a', 'c', 'b'])
    expect(moveColumn(cols, { order: ['a', 'c', 'b'] }, 'a', 1).order).toEqual(['c', 'a', 'b'])
    expect(moveColumn(cols, {}, 'a', -1).order).toEqual(['a', 'b', 'c'])
    expect(moveColumn(cols, {}, 'c', 1).order).toEqual(['a', 'b', 'c'])
    expect(moveColumn(cols, {}, 'zzz', 1).order).toEqual(['a', 'b', 'c'])
  })
})

describe('selection', () => {
  const ids = ['1', '2', '3', '4']
  it('reports none, some and all for the header checkbox', () => {
    expect(selectionState([], ids)).toBe('none')
    expect(selectionState(['2'], ids)).toBe('some')
    expect(selectionState(['1', '2', '3', '4', 'other'], ids)).toBe('all')
    expect(selectionState(['1'], [])).toBe('none')
  })
  it('toggles one row, all rows, and a shift range', () => {
    expect(toggleId(['1'], '2')).toEqual(['1', '2'])
    expect(toggleId(['1', '2'], '2')).toEqual(['1'])
    expect([...toggleAllIds(['1'], ids)].sort()).toEqual(ids)
    expect(toggleAllIds(ids, ids)).toEqual([])
    expect(toggleAllIds(['9', ...ids], ids)).toEqual(['9'])
    expect(selectRange([], ids, '2', '4')).toEqual(['2', '3', '4'])
    expect(selectRange(['1'], ids, '4', '3')).toEqual(['1', '3', '4'])
    expect(selectRange(['1'], ids, 'missing', '3')).toEqual(['1', '3'])
  })
})

describe('windowing', () => {
  it('renders the visible rows plus an overscan and pads the rest', () => {
    const w = rowWindow({ scrollTop: 4000, viewportHeight: 400, rowHeight: 40, total: 1000, overscan: 5 })
    expect(w.start).toBe(95)
    expect(w.end).toBe(100 + 11 + 5)
    expect(w.padTop).toBe(95 * 40)
    expect(w.padBottom).toBe((1000 - w.end) * 40)
  })
  it('handles the top, the end and an empty list', () => {
    expect(rowWindow({ scrollTop: 0, viewportHeight: 400, rowHeight: 40, total: 5 })).toMatchObject({ start: 0, end: 5, padTop: 0, padBottom: 0 })
    expect(rowWindow({ scrollTop: 99999, viewportHeight: 400, rowHeight: 40, total: 50 }).end).toBe(50)
    expect(rowWindow({ total: 0 })).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
  })
  it('scrolls a row into view below the sticky header', () => {
    const base = { scrollTop: 400, viewportHeight: 440, rowHeight: 40, headerHeight: 40 }
    expect(scrollTopForRow({ ...base, index: 12 })).toBeNull()
    expect(scrollTopForRow({ ...base, index: 5 })).toBe(200)
    expect(scrollTopForRow({ ...base, index: 30 })).toBe(30 * 40 + 40 - 400)
  })
})

describe('keyboard navigation', () => {
  const size = { rowCount: 5, colCount: 4 }
  it('moves between rows and cells and stops at the edges', () => {
    expect(moveFocus({ row: 0, col: -1 }, 'ArrowDown', size)).toEqual({ row: 1, col: -1 })
    expect(moveFocus({ row: 4, col: 2 }, 'ArrowDown', size)).toEqual({ row: 4, col: 2 })
    expect(moveFocus({ row: 0, col: -1 }, 'ArrowRight', size)).toEqual({ row: 0, col: 0 })
    expect(moveFocus({ row: 0, col: 3 }, 'ArrowRight', size)).toEqual({ row: 0, col: 3 })
    expect(moveFocus({ row: 2, col: 0 }, 'ArrowLeft', size)).toEqual({ row: 2, col: -1 })
    expect(moveFocus({ row: 0, col: -1 }, 'ArrowUp', size)).toEqual({ row: 0, col: -1 })
  })
  it('supports paging, Home and End (with ctrl for the corners) and ignores other keys', () => {
    expect(moveFocus({ row: 0, col: 1 }, 'PageDown', { ...size, pageSize: 3 })).toEqual({ row: 3, col: 1 })
    expect(moveFocus({ row: 4, col: 1 }, 'PageUp', { ...size, pageSize: 3 })).toEqual({ row: 1, col: 1 })
    expect(moveFocus({ row: 2, col: 2 }, 'Home', size)).toEqual({ row: 2, col: 0 })
    expect(moveFocus({ row: 2, col: 2 }, 'End', size)).toEqual({ row: 2, col: 3 })
    expect(moveFocus({ row: 2, col: 2 }, 'Home', { ...size, ctrl: true })).toEqual({ row: 0, col: 0 })
    expect(moveFocus({ row: 2, col: 2 }, 'End', { ...size, ctrl: true })).toEqual({ row: 4, col: 3 })
    const same = { row: 1, col: 1 }
    expect(moveFocus(same, 'a', size)).toBe(same)
  })
})

describe('search', () => {
  it('matches plain text case-insensitively and never treats it as a regular expression', () => {
    expect(matchesSearch('SOFA', ['Studio sofa 59'])).toBe(true)
    expect(matchesSearch('(', ['Chair (oak)'])).toBe(true)
    expect(matchesSearch('a.c', ['abc'])).toBe(false)
    expect(matchesSearch('  ', ['x'])).toBe(true)
    expect(matchesSearch('x', [undefined, null, 12])).toBe(false)
    expect(matchesSearch('12', [undefined, 123])).toBe(true)
  })
})

describe('cell values', () => {
  it('formats dates, numbers and empties consistently', () => {
    expect(formatDateValue('2026-03-05T10:20:30Z', 'date')).toMatch(/^2026-03-0[45]$/)
    expect(formatDateValue('2026-03-05T10:20:30Z', 'datetime')).toMatch(/^2026-03-0[45] \d\d:\d\d$/)
    expect(formatDateValue('not a date', 'date')).toBe('not a date')
    expect(formatDateValue(undefined)).toBe('')
    expect(formatNumberValue(1234.5)).toMatch(/1.234[.,]5/)
    expect(formatNumberValue('abc')).toBe('abc')
    expect(isEmptyValue([])).toBe(true)
    expect(isEmptyValue({})).toBe(true)
    expect(isEmptyValue(0)).toBe(false)
    expect(isEmptyValue(false)).toBe(false)
  })
  it('turns a multi value into at most n chips plus a counter', () => {
    expect(chipsFor(['a', 'b', 'c', 'd'], 2)).toMatchObject({ shown: ['a', 'b'], more: 2 })
    expect(chipsFor('single', 2)).toMatchObject({ shown: ['single'], more: 0 })
    expect(chipsFor(undefined)).toMatchObject({ shown: [], more: 0 })
    expect(chipsFor([{ text: 'x' }, { _id: 'y' }]).shown).toEqual(['x', 'y'])
  })
  it('derives sort values per kind', () => {
    expect(sortValue({ body: '<p>Hi <b>there</b></p>' }, { kind: 'richtext', model: 'body' })).toBe('Hi there')
    expect(sortValue({ n: 3 }, { kind: 'number', model: 'n' })).toBe(3)
    expect(sortValue({ kind: 'k2' }, { kind: 'select', model: 'kind' }, { labelOf: () => (v) => v.toUpperCase() })).toBe('K2')
    expect(sortValue({ o: {} }, { kind: 'json', model: 'o' })).toBeUndefined()
  })
})

describe('column widths', () => {
  it('never clips a header label and keeps fixed kinds fixed', () => {
    expect(columnWidth({ width: 84, label: 'Published' })).toBeGreaterThan(84)
    expect(columnWidth({ width: 116, label: 'Price' })).toBe(116)
    expect(columnWidth({ min: 160, max: 340, label: 'Name' })).toBeGreaterThanOrEqual(160)
    expect(columnWidth({ min: 160, max: 340, label: 'x'.repeat(80) })).toBe(240)
  })
  it('gives the free space of a narrow table to the flexible columns', () => {
    const columns = [{ min: 160, max: 340, label: 'A' }, { width: 100, label: 'B' }, { min: 160, max: 340, label: 'C' }]
    const base = distributeWidths(columns, 0)
    const stretched = distributeWidths(columns, 1200, 128)
    expect(stretched[1]).toBe(base[1])
    expect(stretched[0] + stretched[1] + stretched[2] + 128).toBe(1200)
    expect(distributeWidths(columns, 100)).toEqual(base)
    const fixedOnly = [{ width: 100, label: 'A' }, { width: 100, label: 'B' }]
    expect(distributeWidths(fixedOnly, 500, 0)[0]).toBe(400)
  })
})
