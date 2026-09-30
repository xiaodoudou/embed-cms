import { describe, it, expect } from 'vitest'
import { retryOnNetworkError, isNetworkError } from '../../src/utils/retry.js'

const noSleep = () => Promise.resolve()

describe('retryOnNetworkError', () => {
  it('returns the result at once when the first run works', async () => {
    let runs = 0
    expect(await retryOnNetworkError(async () => { runs++; return 'ok' }, { sleep: noSleep })).toBe('ok')
    expect(runs).toBe(1)
  })

  it('tries again after a connection failure and returns the first success', async () => {
    let runs = 0
    const result = await retryOnNetworkError(async () => {
      runs++
      if (runs < 3) throw new TypeError('Failed to fetch')
      return 'recovered'
    }, { sleep: noSleep })
    expect(result).toBe('recovered')
    expect(runs).toBe(3)
  })

  it('gives up after the last attempt with the last error', async () => {
    let runs = 0
    await expect(retryOnNetworkError(async () => { runs++; throw new TypeError('down') }, { attempts: 3, sleep: noSleep })).rejects.toThrow('down')
    expect(runs).toBe(3)
  })

  it('does not retry an answer of the server, even an error one', async () => {
    let runs = 0
    const response = { ok: false, status: 500 }
    await expect(retryOnNetworkError(async () => { runs++; throw response }, { sleep: noSleep })).rejects.toBe(response)
    expect(runs).toBe(1)
  })

  it('waits longer before each new try', async () => {
    const waits = []
    await expect(retryOnNetworkError(async () => { throw new TypeError('x') }, { attempts: 3, delayMs: 100, sleep: async (ms) => { waits.push(ms) } })).rejects.toBeDefined()
    expect(waits).toEqual([100, 200])
  })

  it('recognises a network error', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError({ code: 500 })).toBe(false)
    expect(isNetworkError(new Error('x'))).toBe(false)
  })
})
