import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import SyncResource from '@c/pages/SyncResource.vue'
import RequestService from '@s/RequestService'
import ResourceService from '@s/ResourceService'
import NotificationsService from '@s/NotificationsService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/RequestService', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@s/ResourceService', () => ({ default: { getAll: vi.fn() } }))

// what the server says for each address
let answers
const record = (key, extra = {}) => ({ name: key, _attachments: [], ...extra })

let wrapper
let loading
let sent
const page = async () => {
  wrapper = mountComponent(SyncResource, { global: { mocks: { $loading: loading } }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
// choosing a resource in the list
const choose = async (name) => {
  wrapper.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', name)
  await flushPromises()
}
// the status watcher chains several promises: let them all finish
const tick = async () => {
  vi.advanceTimersByTime(5100)
  for (let i = 0; i < 6; i++) await flushPromises()
}
const text = () => wrapper.text().replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  loading = { start: vi.fn(), stop: vi.fn() }
  sent = vi.spyOn(NotificationsService, 'send').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  answers = {
    '../sync/resources': ['products', 'pages'],
    '../sync/local/products': [record('a', { n: 1 }), record('b'), record('c')],
    '../sync/remote/products': [record('a', { n: 2 }), record('b'), record('d')],
    '../sync/local/products/status': { status: 'idle', allows: ['write'] },
    '../sync/remote/products/status': { status: 'idle', allows: ['write'] }
  }
  RequestService.get.mockReset().mockImplementation(async (url) => {
    if (!(url in answers)) throw new Error(`no answer for ${url}`)
    return structuredClone(answers[url])
  })
  RequestService.post.mockReset().mockResolvedValue({})
  ResourceService.getAll.mockReset().mockResolvedValue([
    { title: 'products', schema: [{ field: 'name', unique: true }] },
    { title: 'pages', schema: [{ field: 'slug' }] }
  ])
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('SyncResource (the page that compares two servers)', () => {
  it('shows a list of the resources this CMS may sync', async () => {
    await page()
    expect(wrapper.get('h1').text()).toBe('Sync Resources')
    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual(['products', 'pages'])
    expect(RequestService.get).toHaveBeenCalledWith('../sync/resources')
  })

  it('says where to choose the resources when none is chosen yet', async () => {
    answers['../sync/resources'] = []
    await page()
    const hint = wrapper.get('.no-resources')
    expect(hint.text()).toContain('No resource is chosen to sync yet')
    expect(hint.get('a').attributes('href')).toBe('#/?id=_sync')
  })

  it('has no such hint when there are resources', async () => {
    await page()
    expect(wrapper.find('.no-resources').exists()).toBe(false)
  })

  it('shows nothing about records before a resource is chosen', async () => {
    await page()
    expect(wrapper.find('.num-records').exists()).toBe(false)
  })

  describe('after a resource is chosen', () => {
    it('loads the records of both servers (the choice makes it load)', async () => {
      await page()
      await choose('products')
      expect(RequestService.get).toHaveBeenCalledWith('../sync/local/products')
      expect(RequestService.get).toHaveBeenCalledWith('../sync/remote/products')
      expect(loading.start).toHaveBeenCalledWith('loading-resource')
      expect(loading.stop).toHaveBeenCalledWith('loading-resource')
    })

    it('counts the records of each server', async () => {
      await page()
      await choose('products')
      const counts = wrapper.findAll('.num-record').map((item) => item.text().replace(/\s+/g, ' '))
      expect(counts.slice(0, 2)).toEqual(['local3', 'remote3'])
    })

    it('counts what a push or a pull would create, update and remove, by the unique key', async () => {
      await page()
      await choose('products')
      expect(text()).toContain('create: 1')
      expect(text()).toContain('update: 1')
      expect(text()).toContain('remove: 1')
    })

    it('does not count a different attachment address as a difference', async () => {
      answers['../sync/local/products'] = [record('a', { _attachments: [{ _id: '1', url: '/one' }] })]
      answers['../sync/remote/products'] = [record('a', { _attachments: [{ _id: '1', url: '/two' }] })]
      await page()
      await choose('products')
      expect(text()).toContain('update: 0')
    })

    it('says N/A when a server cannot be read', async () => {
      delete answers['../sync/remote/products']
      await page()
      await choose('products')
      expect(wrapper.get('.na-field').text()).toBe('N/A')
      expect(text()).toContain('remoteN/A')
    })

    it('offers to push and to pull only when that side allows writing', async () => {
      await page()
      await choose('products')
      expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['push to remote', 'pull from remote'])
      answers['../sync/remote/products/status'] = { status: 'idle', allows: ['read'] }
      await choose('products')
      expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['pull from remote'])
    })
  })

  describe('syncing', () => {
    const start = async (label) => {
      await page()
      await choose('products')
      await wrapper.findAll('button').find((button) => button.text() === label).trigger('click')
      await flushPromises()
    }

    it('asks the server to copy in the direction chosen, and says it started', async () => {
      await start('push to remote')
      expect(RequestService.post).toHaveBeenCalledWith('../sync/products/from/local/to/remote')
      expect(sent.mock.calls.at(-1)[1]).toBe('info')
      expect(loading.start).toHaveBeenCalledWith('deploy-resource')
    })

    it('pulls the other way', async () => {
      await start('pull from remote')
      expect(RequestService.post).toHaveBeenCalledWith('../sync/products/from/remote/to/local')
    })

    it('shows the progress while the target is syncing', async () => {
      await start('push to remote')
      answers['../sync/remote/products/status'] = { status: 'syncing', resource: 'products', created: 1, createTotal: 4, updated: 0, updateTotal: 2, removed: 0, removeTotal: 0 }
      await tick()
      expect(text()).toContain('created: 1 / 4')
      expect(loading.stop).not.toHaveBeenCalledWith('deploy-resource')
    })

    it('says it is done when the sync ends, stops the loading mark and reloads the numbers', async () => {
      await start('push to remote')
      RequestService.get.mockClear()
      await tick()
      expect(sent.mock.calls.at(-1)[1]).toBe('success')
      expect(loading.stop).toHaveBeenCalledWith('deploy-resource')
      expect(RequestService.get).toHaveBeenCalledWith('../sync/local/products')
    })

    it('says so when the sync ended with an error', async () => {
      await start('push to remote')
      answers['../sync/remote/products/status'] = { status: 'error', error: 'disk full' }
      await tick()
      const last = sent.mock.calls.at(-1)
      expect(last[1]).toBe('error')
      expect(last[0]).toContain('disk full')
    })

    it('says so, with a retry, when the server refuses to start', async () => {
      RequestService.post.mockRejectedValueOnce(new Error('refused'))
      await start('push to remote')
      const last = sent.mock.calls.at(-1)
      expect(last[1]).toBe('error')
      expect(last[0]).toContain('refused')
      expect(typeof last[2].action).toBe('function')
      expect(loading.stop).toHaveBeenCalledWith('deploy-resource')
      await last[2].action()
      expect(RequestService.post).toHaveBeenCalledTimes(2)
    })
  })

  it('stops watching the status when it goes away', async () => {
    await page()
    await choose('products')
    wrapper.unmount()
    wrapper = undefined
    RequestService.get.mockClear()
    vi.advanceTimersByTime(30000)
    await flushPromises()
    expect(RequestService.get).not.toHaveBeenCalled()
  })
})
