import { describe, it, expect } from 'vitest'
import { readPreference, writePreference, readChoice, readNumber } from '../../src/utils/preferences.js'

function memoryStorage () {
  const data = {}
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v } }
}

describe('persisted UI preferences', () => {
  it('stores values under the embed-cms.ui prefix and reads them back', () => {
    const storage = memoryStorage()
    expect(readPreference('table.density', 'default', storage)).toBe('default')
    expect(writePreference('table.density', 'compact', storage)).toBe(true)
    expect(storage.data['embed-cms.ui.table.density']).toBe('"compact"')
    expect(readPreference('table.density', 'default', storage)).toBe('compact')
  })
  it('falls back when the value is not allowed, broken, or storage is unavailable', () => {
    const storage = memoryStorage()
    writePreference('list.density', 'huge', storage)
    expect(readChoice('list.density', ['comfortable', 'compact'], 'comfortable', storage)).toBe('comfortable')
    storage.data['embed-cms.ui.list.density'] = '{oops'
    expect(readPreference('list.density', 'x', storage)).toBe('x')
    expect(readPreference('a', 'fallback', null)).toBe('fallback')
    expect(writePreference('a', 1, { setItem: () => { throw new Error('denied') } })).toBe(false)
    expect(writePreference('a', 1, null)).toBe(false)
  })
  it('clamps numbers into a range', () => {
    const storage = memoryStorage()
    expect(readNumber('nav.width', 200, 360, 248, storage)).toBe(248)
    writePreference('nav.width', 900, storage)
    expect(readNumber('nav.width', 200, 360, 248, storage)).toBe(360)
    writePreference('nav.width', 12, storage)
    expect(readNumber('nav.width', 200, 360, 248, storage)).toBe(200)
    writePreference('nav.width', 'abc', storage)
    expect(readNumber('nav.width', 200, 360, 248, storage)).toBe(248)
  })
})
