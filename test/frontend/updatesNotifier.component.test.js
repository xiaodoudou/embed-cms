import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import UpdatesNotifier from '@c/UpdatesNotifier.vue'
import LoginService from '@s/LoginService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/LoginService', () => ({ default: { user: { group: 'admins', username: 'me' } } }))

// a stand-in for the browser's WebSocket that the tests drive by hand
class FakeSocket {
  static instances = []
  constructor (url) {
    this.url = url
    this.sent = []
    this.closed = false
    FakeSocket.instances.push(this)
  }
  send (text) { this.sent.push(JSON.parse(text)) }
  close () {
    this.closed = true
    if (this.onclose) this.onclose()
  }
  receive (message) { this.onmessage({ data: JSON.stringify(message) }) }
}

const update = (data = {}, extra = {}) => ({ action: 'update', data: { resource: 'articles', _id: 'r1', _updatedBy: 'admins~other', ...data }, ...extra })

let wrapper
const notifier = async (props = {}) => {
  wrapper = mountComponent(UpdatesNotifier, { props: { selectedResource: { name: 'articles' }, selectedRecord: { _id: 'r1' }, ...props } })
  await flushPromises()
  return wrapper
}
const socket = () => FakeSocket.instances[FakeSocket.instances.length - 1]
const show = async (message) => {
  socket().receive(message)
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  FakeSocket.instances = []
  vi.stubGlobal('WebSocket', FakeSocket)
  LoginService.user = { group: 'admins', username: 'me' }
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('UpdatesNotifier (another person changed what is open)', () => {
  describe('the connection', () => {
    it('connects to the updates endpoint of this site, over a web socket', async () => {
      await notifier()
      expect(FakeSocket.instances).toHaveLength(1)
      expect(socket().url).toBe(`${window.location.origin.replace(/^http/, 'ws')}/_updates`)
    })

    it('shows nothing until an update comes', async () => {
      await notifier()
      expect(wrapper.find('.v-alert').exists()).toBe(false)
    })

    it('answers the ping of the server with a pong', async () => {
      await notifier()
      socket().onopen()
      await show({ action: 'ping' })
      expect(socket().sent).toEqual([{ action: 'pong' }])
    })

    it('closes the connection when the server goes quiet, and connects again', async () => {
      await notifier()
      socket().onopen()
      vi.advanceTimersByTime(35000)
      expect(FakeSocket.instances[0].closed).toBe(true)
      vi.advanceTimersByTime(600)
      expect(FakeSocket.instances).toHaveLength(2)
    })

    it('keeps the connection while pings come', async () => {
      await notifier()
      socket().onopen()
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(30000)
        await show({ action: 'ping' })
      }
      expect(FakeSocket.instances).toHaveLength(1)
      expect(socket().closed).toBe(false)
    })

    it('connects again a moment after the connection drops', async () => {
      await notifier()
      socket().onclose()
      expect(FakeSocket.instances).toHaveLength(1)
      vi.advanceTimersByTime(600)
      expect(FakeSocket.instances).toHaveLength(2)
    })

    it('says when the socket cannot send, and goes on', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await notifier()
      socket().send = () => { throw new Error('closed') }
      await show({ action: 'ping' })
      expect(error).toHaveBeenCalled()
    })

    it('ignores a message without an action', async () => {
      await notifier()
      await show({ nothing: true })
      expect(wrapper.find('.v-alert').exists()).toBe(false)
    })

    it('stops for good when it goes away', async () => {
      await notifier()
      const first = socket()
      wrapper.unmount()
      wrapper = undefined
      expect(first.closed).toBe(true)
      // a close that was already on its way must not bring the connection back
      expect(first.onclose).toBe(null)
      vi.advanceTimersByTime(60000)
      expect(FakeSocket.instances).toHaveLength(1)
    })
  })

  describe('an update from another person', () => {
    it('tells the person that the record they have open was changed', async () => {
      await notifier()
      await show(update())
      const alert = wrapper.get('.v-alert')
      expect(alert.text()).toContain('Record update')
      expect(alert.text()).toContain('Record was updated by another user')
    })

    it('tells the person that another record of the resource was changed, and which resource', async () => {
      await notifier()
      await show(update({ _id: 'other' }))
      const alert = wrapper.get('.v-alert')
      expect(alert.text()).toContain('Resource update')
      expect(alert.text()).toContain('articles')
      expect(alert.text()).not.toContain('{{')
    })

    it('says nothing about an update of another resource', async () => {
      await notifier()
      await show(update({ resource: 'pages' }))
      expect(wrapper.find('.v-alert').exists()).toBe(false)
    })

    it('says nothing about an update the person made themselves', async () => {
      await notifier()
      await show(update({ _updatedBy: 'admins~me' }))
      expect(wrapper.find('.v-alert').exists()).toBe(false)
    })

    it('says nothing about other kinds of messages', async () => {
      await notifier()
      await show(update({}, { action: 'delete' }))
      expect(wrapper.find('.v-alert').exists()).toBe(false)
    })

    it('offers to reload, with the id of the record that changed, and goes away', async () => {
      await notifier()
      await show(update({ _id: 'other' }))
      await wrapper.get('.v-alert .v-btn').trigger('click')
      await flushPromises()
      expect(wrapper.emitted('reloadResource')).toEqual([['other']])
      expect(wrapper.find('.v-alert').exists()).toBe(false)
    })

    it('does not run a harmful tag in the text', async () => {
      await notifier({ selectedResource: { name: '<img src=x onerror="window.pwned=1">' } })
      await show(update({ resource: '<img src=x onerror="window.pwned=1">', _id: 'other' }))
      expect(wrapper.find('.description img').exists()).toBe(false)
    })
  })
})
