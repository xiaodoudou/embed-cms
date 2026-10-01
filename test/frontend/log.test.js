import { describe, it, expect, vi, afterEach } from 'vitest'
import { debugEnabled, log } from '../../src/utils/log.js'

const storage = (value) => ({ getItem: () => value })

describe('log', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is off by default', () => {
    expect(debugEnabled(storage(null), '')).toBe(false)
    expect(debugEnabled(null, '')).toBe(false)
    expect(debugEnabled(storage('0'), '?id=x')).toBe(false)
  })

  it('is switched on by the stored flag or by ?debug in the address', () => {
    expect(debugEnabled(storage('1'), '')).toBe(true)
    expect(debugEnabled(storage(null), '?debug')).toBe(true)
    expect(debugEnabled(storage(null), '#/?id=x&debug=1')).toBe(true)
    expect(debugEnabled(storage(null), '?debugger=1')).toBe(false)
  })

  it('does not throw when the storage does', () => {
    expect(debugEnabled({ getItem: () => { throw new Error('blocked') } }, '')).toBe(false)
  })

  it('prints nothing while debugging is off', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    log.debug('quiet')
    expect(spy).not.toHaveBeenCalled()
  })
})
