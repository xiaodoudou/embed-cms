import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import TokenField from '@c/fields/TokenField.vue'
import NotificationsService from '@s/NotificationsService'
import { tokenOptions, encodeBytes, generateToken } from '@u/token'
import { mountField } from './helpers/mountField.js'

// The token field: a random value made once, read-only, copied with a button and replaced with another.

let wrapper
const mount = (schema = {}, model = {}) => {
  wrapper = mountField(TokenField, { model, schema: { model: 'key', label: 'Key', ...schema }, attachTo: document.body })
  return wrapper
}
const input = () => wrapper.get('input')

afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
})

describe('token helpers', () => {
  it('keep the options safe, as the server does', () => {
    expect(tokenOptions({})).toEqual({ length: 32, prefix: '', format: 'base64url' })
    expect(tokenOptions({ options: { length: 4, prefix: 'p_', format: 'hex' } })).toEqual({ length: 8, prefix: 'p_', format: 'hex' })
    expect(tokenOptions({ options: { length: 4096 } }).length).toBe(128)
  })

  it('write the bytes in hex or in base64url without padding', () => {
    const bytes = new Uint8Array([0, 15, 255, 251, 239])
    expect(encodeBytes(bytes, 'hex')).toBe('000ffffbef')
    expect(encodeBytes(bytes, 'base64url')).toBe('AA__--8')
  })

  it('make a token of the prefix and the random bytes', () => {
    const fill = (bytes) => bytes.fill(255)
    expect(generateToken({ options: { length: 8, prefix: 'rpl_', format: 'hex' } }, fill)).toBe('rpl_ffffffffffffffff')
    expect(generateToken({})).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('TokenField', () => {
  it('gives a new record a token at once, read-only, in the format the field says', async () => {
    mount({ options: { prefix: 'key_', format: 'hex', length: 8 } })
    await flushPromises()
    expect(input().element.value).toMatch(/^key_[0-9a-f]{16}$/)
    expect(input().attributes('readonly')).toBeDefined()
    expect(wrapper.text()).toContain('Key')
  })

  it('keeps the token the record has', async () => {
    mount({}, { key: 'saved-token' })
    await flushPromises()
    expect(input().element.value).toBe('saved-token')
  })

  it('makes another token with Regenerate', async () => {
    mount({}, { key: 'old-token' })
    await flushPromises()
    await wrapper.get('.token-regenerate').trigger('click')
    expect(input().element.value).not.toBe('old-token')
    expect(input().element.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('copies the token and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const send = vi.spyOn(NotificationsService, 'send').mockImplementation(() => {})
    mount({}, { key: 'copy-me' })
    await flushPromises()
    await wrapper.get('.token-copy').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('copy-me')
    expect(send).toHaveBeenCalledWith('Token copied', 'success')
  })

  it('makes no token and offers no Regenerate when the field is read-only', async () => {
    mount({ readonly: true })
    await flushPromises()
    expect(input().element.value).toBe('')
    expect(wrapper.find('.token-regenerate').exists()).toBe(false)
  })
})
