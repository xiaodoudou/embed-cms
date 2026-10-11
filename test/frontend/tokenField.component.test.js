import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import TokenField from '@c/fields/TokenField.vue'
import NotificationsService from '@s/NotificationsService'
import { tokenOptions, encodeBytes, generateToken } from '@u/token'
import { mountField } from './helpers/mountField.js'

// The token field: a key typed, pasted or made with the Generate button, and copied with the Copy button.

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
    expect(tokenOptions({})).toEqual({ length: 32, prefix: '', format: 'base64url', autoGenerate: false })
    expect(tokenOptions({ options: { length: 4, prefix: 'p_', format: 'hex', autoGenerate: true } })).toEqual({ length: 8, prefix: 'p_', format: 'hex', autoGenerate: true })
    expect(tokenOptions({ options: { length: 4096, autoGenerate: 'yes' } })).toMatchObject({ length: 128, autoGenerate: false })
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
  it('starts empty, with the label, and a Generate button that fills it in the format the field says', async () => {
    mount({ options: { prefix: 'key_', format: 'hex', length: 8 } })
    await flushPromises()
    expect(input().element.value).toBe('')
    expect(wrapper.text()).toContain('Key')
    await wrapper.get('.token-generate').trigger('click')
    expect(input().element.value).toMatch(/^key_[0-9a-f]{16}$/)
  })

  it('takes a token typed or pasted in', async () => {
    mount()
    await flushPromises()
    expect(input().attributes('readonly')).toBeUndefined()
    await input().setValue('pasted-from-the-other-side')
    expect(wrapper.emitted('input')?.at(-1)?.[0]).toBe('pasted-from-the-other-side')
  })

  it('keeps the token the record has, and replaces it with Generate', async () => {
    mount({}, { _id: 'a-record', key: 'old-token' })
    await flushPromises()
    expect(input().element.value).toBe('old-token')
    await wrapper.get('.token-generate').trigger('click')
    expect(input().element.value).not.toBe('old-token')
    expect(input().element.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('fills a new record at once when the field says autoGenerate, and leaves an existing one as it is', async () => {
    mount({ options: { autoGenerate: true, prefix: 'auto_' } })
    await flushPromises()
    expect(input().element.value).toMatch(/^auto_/)
    wrapper.unmount()
    mount({ options: { autoGenerate: true } }, { _id: 'saved-record' })
    await flushPromises()
    expect(input().element.value).toBe('')
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

  it('is read-only, with no Generate button, when the field says so', async () => {
    mount({ readonly: true, options: { autoGenerate: true } }, { key: 'fixed' })
    await flushPromises()
    expect(input().element.value).toBe('fixed')
    expect(input().attributes('readonly')).toBeDefined()
    expect(wrapper.find('.token-generate').exists()).toBe(false)
  })
})
