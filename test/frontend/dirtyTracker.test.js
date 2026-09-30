import { describe, it, expect } from 'vitest'
import {
  normalizeValue, createSnapshot, isDirty, changedParts, missingRequired, isEmptyRichText, absorbPaths
} from '../../src/utils/dirtyTracker.js'

const localised = { locales: ['enUS', 'zhCN'], schema: [
  { field: 'title', input: 'string', required: true, localised: true },
  { field: 'body', input: 'wysiwyg', localised: true },
  { field: 'type', input: 'select', required: true, localised: false },
  { field: 'level', input: 'integer', localised: false },
  { field: 'enabled', input: 'checkbox', localised: false },
  { field: 'tags', input: 'pillbox', localised: false },
  { field: 'meta', input: 'json', localised: false }
] }
const plain = { schema: [
  { field: 'name', input: 'string', required: true },
  { field: 'note', input: 'string' }
] }

const base = () => ({
  _id: 'abc',
  title: { enUS: 'Hello', zhCN: 'Ni hao' },
  body: { enUS: '<p>Body</p>', zhCN: undefined },
  type: 'a',
  level: 1,
  enabled: undefined,
  tags: [],
  meta: {}
})

describe('normalizeValue', () => {
  it('treats empty rich text, blanks and empty containers as the same value', () => {
    const empties = [undefined, null, '', '   ', '<p></p>', '<p><br></p>', '<p><br class="ProseMirror-trailingBreak"></p>', '<p> </p>', [], {}, false, [null], [undefined]]
    for (const empty of empties) {
      expect(normalizeValue(empty)).toBeUndefined()
    }
    expect(isEmptyRichText('<p>x</p>')).toBe(false)
  })
  it('keeps real values, zero and array order', () => {
    expect(normalizeValue(0)).toBe(0)
    expect(normalizeValue(true)).toBe(true)
    expect(normalizeValue(['b', 'a'])).toEqual(['b', 'a'])
  })
  it('describes files by their properties', () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png', lastModified: 1 })
    expect(normalizeValue(file)).toMatchObject({ name: 'a.png', size: 3 })
  })
})

describe('isDirty', () => {
  it('is clean right after the snapshot and dirty after a change', () => {
    const model = base()
    const snap = createSnapshot(model)
    expect(isDirty(snap, model)).toBe(false)
    model.title.enUS = 'Changed'
    expect(isDirty(snap, model)).toBe(true)
  })
  it('returns to clean when an edit is reverted', () => {
    const model = base()
    const snap = createSnapshot(model)
    model.level = 5
    expect(isDirty(snap, model)).toBe(true)
    model.level = 1
    expect(isDirty(snap, model)).toBe(false)
  })
  it('is clean again after the snapshot is reset (save)', () => {
    const model = base()
    model.title.enUS = 'Saved title'
    const snap = createSnapshot(model)
    expect(isDirty(snap, model)).toBe(false)
  })
  it('rich text: untouched stays clean, typing is dirty, deleting everything is clean', () => {
    const model = base()
    const snap = createSnapshot(model)
    model.body.zhCN = '<p></p>' // what tiptap emits for an empty editor
    expect(isDirty(snap, model)).toBe(false)
    model.body.zhCN = '<p>sdfsdf</p>'
    expect(isDirty(snap, model)).toBe(true)
    model.body.zhCN = '<p><br></p>'
    expect(isDirty(snap, model)).toBe(false)
  })
  it('detects in-place mutation of nested arrays and objects and reordering', () => {
    const model = { ...base(), tags: ['a', 'b'], meta: { list: [{ n: 1 }] } }
    const snap = createSnapshot(model)
    model.tags.push('c')
    expect(isDirty(snap, model)).toBe(true)
    model.tags.pop()
    expect(isDirty(snap, model)).toBe(false)
    model.meta.list[0].n = 2
    expect(isDirty(snap, model)).toBe(true)
    model.meta.list[0].n = 1
    model.tags.reverse()
    expect(isDirty(snap, model)).toBe(true)
    model.tags.reverse()
    expect(isDirty(snap, model)).toBe(false)
  })
  it('a checkbox toggled on and off is clean (unchecked equals unset)', () => {
    const model = base()
    const snap = createSnapshot(model)
    model.enabled = true
    expect(isDirty(snap, model)).toBe(true)
    model.enabled = false
    expect(isDirty(snap, model)).toBe(false)
  })
  it('added and removed attachments', () => {
    const model = { ...base(), images: [] }
    const snap = createSnapshot(model)
    model.images.push(new File(['x'], 'one.png', { lastModified: 1 }))
    expect(isDirty(snap, model)).toBe(true)
    model.images.splice(0, 1)
    expect(isDirty(snap, model)).toBe(false)
  })
})

describe('changedParts (per locale)', () => {
  it('edit only enUS marks only enUS', () => {
    const model = base()
    const snap = createSnapshot(model)
    model.title.enUS = 'Other'
    expect(changedParts(snap, model, localised)).toMatchObject({ locales: ['enUS'], shared: [] })
  })
  it('edit only zhCN marks only zhCN', () => {
    const model = base()
    const snap = createSnapshot(model)
    model.body.zhCN = '<p>new</p>'
    expect(changedParts(snap, model, localised)).toMatchObject({ locales: ['zhCN'], shared: [] })
  })
  it('edit only a shared field marks no locale', () => {
    const model = base()
    const snap = createSnapshot(model)
    model.type = 'b'
    expect(changedParts(snap, model, localised)).toMatchObject({ locales: [], shared: ['type'] })
  })
  it('reverting clears the marker', () => {
    const model = base()
    const snap = createSnapshot(model)
    model.title.zhCN = 'x'
    expect(changedParts(snap, model, localised).locales).toEqual(['zhCN'])
    model.title.zhCN = 'Ni hao'
    expect(changedParts(snap, model, localised).locales).toEqual([])
  })
  it('a resource without locales only has shared changes', () => {
    const model = { name: 'a', note: '' }
    const snap = createSnapshot(model)
    model.note = 'n'
    expect(changedParts(snap, model, plain)).toMatchObject({ locales: [], shared: ['note'] })
  })
})

describe('missingRequired', () => {
  it('counts a required localised field per locale', () => {
    const model = { ...base(), title: { enUS: 'Hello', zhCN: '' }, type: 'a' }
    const missing = missingRequired(model, localised)
    expect(missing.byLocale).toEqual({ zhCN: ['title'] })
    expect(missing.shared).toEqual([])
    expect(missing.total).toBe(1)
  })
  it('filled in one locale but empty in the other only flags the empty one', () => {
    const model = { ...base(), title: { enUS: '', zhCN: 'x' } }
    expect(missingRequired(model, localised).byLocale).toEqual({ enUS: ['title'] })
  })
  it('shared required fields are not tied to a locale', () => {
    const model = { ...base(), type: undefined }
    const missing = missingRequired(model, localised)
    expect(missing.byLocale).toEqual({})
    expect(missing.shared).toEqual(['type'])
  })
  it('false and 0 are answers, not missing values', () => {
    const resource = { schema: [{ field: 'flag', input: 'checkbox', required: true }, { field: 'n', input: 'integer', required: true }] }
    expect(missingRequired({ flag: false, n: 0 }, resource).total).toBe(0)
  })
  it('works for a resource without locales', () => {
    expect(missingRequired({ name: '' }, plain)).toEqual({ byLocale: {}, shared: ['name'], total: 1 })
    expect(missingRequired({ name: 'x' }, plain).total).toBe(0)
  })
})

describe('absorbPaths (defaults written by fields while the form settles)', () => {
  it('accepts a default written into an untouched field as the saved state', () => {
    const snapshot = createSnapshot({ title: { enUS: 'a' } })
    const model = { title: { enUS: 'a' }, color: { zhCN: '#000000FF' }, meta: { count: 1 } }
    expect(isDirty(snapshot, model)).toBe(true)
    const changed = changedParts(snapshot, model, { locales: ['enUS', 'zhCN'], schema: [
      { field: 'title', input: 'string', localised: true },
      { field: 'color', input: 'color', localised: true },
      { field: 'meta', input: 'object', localised: false }
    ] })
    expect(changed.paths).toEqual(['color.zhCN', 'meta'])
    absorbPaths(snapshot, model, changed.paths)
    expect(isDirty(snapshot, model)).toBe(false)
  })

  it('leaves the other paths alone, so a real edit is still detected afterwards', () => {
    const snapshot = createSnapshot({ title: { enUS: 'a' } })
    absorbPaths(snapshot, { title: { enUS: 'a' }, meta: { count: 1 } }, ['meta'])
    expect(isDirty(snapshot, { title: { enUS: 'b' }, meta: { count: 1 } })).toBe(true)
    expect(isDirty(snapshot, { title: { enUS: 'a' }, meta: { count: 2 } })).toBe(true)
  })

  it('drops a path whose value is now empty', () => {
    const snapshot = createSnapshot({ note: 'x' })
    absorbPaths(snapshot, { note: '' }, ['note'])
    expect(isDirty(snapshot, { note: '' })).toBe(false)
  })
})
