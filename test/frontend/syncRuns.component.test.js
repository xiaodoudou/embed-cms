import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import SyncRuns from '@c/pages/SyncRuns.vue'
import SyncResource from '@c/pages/SyncResource.vue'
import RequestService from '@s/RequestService'
import NotificationsService from '@s/NotificationsService'
import ResourceService from '@s/ResourceService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/RequestService', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@s/ResourceService', () => ({ default: { getAll: vi.fn() } }))

const IDLE = { running: false, last: null, schedule: { push: null, pull: null } }
const T0 = new Date(2026, 9, 3, 3, 0, 0).getTime()

let wrapper
let state
let toasts
let dialog

const mountRuns = async (props = { resources: ['cities', 'countries'] }) => {
  wrapper = mountComponent(SyncRuns, { props, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const poll = async () => {
  vi.advanceTimersByTime(2100)
  await flushPromises()
}
const text = () => wrapper.text().replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  state = structuredClone(IDLE)
  toasts = []
  dialog = { ask: vi.fn().mockResolvedValue(true) }
  window.DialogService = dialog
  vi.spyOn(NotificationsService, 'send').mockImplementation((message, type) => toasts.push({ message, type }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  RequestService.get.mockReset().mockImplementation(async (url) => {
    if (url === '../sync/runs') return structuredClone(state)
    throw new Error(`no answer for ${url}`)
  })
  RequestService.post.mockReset().mockResolvedValue({ started: true })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete window.DialogService
  document.body.innerHTML = ''
})

describe('SyncRuns (all the resources at once)', () => {
  describe('the resources a run covers', () => {
    it('are listed as they are chosen in the Sync settings, with a way to change them', async () => {
      await mountRuns({ resources: ['cities', 'countries', 'regions'] })
      expect(wrapper.get('.chosen-label').text()).toBe('3 resources to sync:')
      expect(wrapper.findAll('.chip').map((chip) => chip.text())).toEqual(['cities', 'countries', 'regions'])
      expect(wrapper.get('.chosen .change').attributes('href')).toBe('#/?id=_sync')
      expect(wrapper.findAll('.chip').every((chip) => chip.classes().includes('is-idle'))).toBe(true)
    })

    it('say so in the singular, and when none is chosen', async () => {
      await mountRuns({ resources: ['cities'] })
      expect(wrapper.get('.chosen-label').text()).toBe('1 resource to sync:')
      wrapper.unmount()
      await mountRuns({ resources: [] })
      expect(wrapper.get('.chosen-label').text()).toBe('0 resources to sync:')
      expect(wrapper.find('.chip').exists()).toBe(false)
      expect(wrapper.get('.chosen .none').text()).toBe('none chosen')
    })

    it('show how a run goes: done, failed, the one being synced, and the ones waiting', async () => {
      state.running = {
        direction: 'push', trigger: 'manual', startedAt: T0, resources: ['cities', 'countries', 'regions', 'markets'], current: 'regions',
        results: [{ resource: 'cities', status: 'done' }, { resource: 'countries', status: 'error', error: 'refused' }]
      }
      await mountRuns({ resources: ['cities', 'countries', 'regions', 'markets', 'articles'] })
      const states = Object.fromEntries(wrapper.findAll('.chip').map((chip) => [chip.text(), chip.classes().find((name) => name.startsWith('is-'))]))
      // articles is chosen, but this run was asked for the other four only
      expect(states).toEqual({ cities: 'is-done', countries: 'is-error', regions: 'is-running', markets: 'is-pending', articles: 'is-idle' })
      expect(wrapper.findAll('.chip').map((chip) => chip.attributes('title'))).toEqual(['Done', 'Failed', 'Syncing now', 'Waiting', ''])
    })

    it('go back to plain when the run ends', async () => {
      state.running = { direction: 'push', trigger: 'manual', startedAt: T0, resources: ['cities'], current: 'cities', results: [] }
      await mountRuns({ resources: ['cities'] })
      expect(wrapper.get('.chip').classes()).toContain('is-running')
      state.running = false
      await poll()
      expect(wrapper.get('.chip').classes()).toContain('is-idle')
    })
  })

  describe('the buttons', () => {
    it('are there to push and to pull, and ask first', async () => {
      await mountRuns()
      await wrapper.get('.push-all').trigger('click')
      await flushPromises()
      expect(dialog.ask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Push all the resources?', confirm: 'Push' }))
      expect(dialog.ask.mock.calls[0][0].message).toContain('records that exist only there are removed')
      expect(RequestService.post).toHaveBeenCalledWith('../sync/run/push')
      await wrapper.get('.pull-all').trigger('click')
      await flushPromises()
      expect(dialog.ask.mock.calls[1][0].message).toContain('records that exist only here are removed')
      expect(RequestService.post).toHaveBeenCalledWith('../sync/run/pull')
    })

    it('start nothing when the question is answered no', async () => {
      dialog.ask.mockResolvedValue(false)
      await mountRuns()
      await wrapper.get('.push-all').trigger('click')
      await flushPromises()
      expect(RequestService.post).not.toHaveBeenCalled()
    })

    it('are off while there is no resource to sync, and while a run goes on', async () => {
      await mountRuns({ resources: [] })
      expect(wrapper.get('.push-all').element.disabled).toBe(true)
      expect(wrapper.get('.pull-all').element.disabled).toBe(true)
      wrapper.unmount()
      state.running = { direction: 'push', trigger: 'manual', startedAt: T0, resources: ['cities'], current: 'cities', results: [] }
      await mountRuns()
      expect(wrapper.get('.push-all').element.disabled).toBe(true)
      expect(wrapper.get('.pull-all').element.disabled).toBe(true)
    })

    it('say why when the CMS refuses to start (a run is going on, a resource is not one to sync)', async () => {
      RequestService.post.mockRejectedValue({ code: 409, error: 'a pull is already running' })
      await mountRuns()
      await wrapper.get('.push-all').trigger('click')
      await flushPromises()
      expect(toasts).toEqual([{ message: 'a pull is already running', type: 'error' }])
      expect(wrapper.get('.push-all').element.disabled).toBe(false)
    })
  })

  describe('while a run goes on', () => {
    it('says which resource it is on and how far it is, and what is done', async () => {
      state.running = {
        direction: 'push', trigger: 'manual', startedAt: T0, resources: ['cities', 'countries', 'regions'], current: 'countries',
        results: [{ resource: 'cities', status: 'done', created: 2, updated: 1, removed: 0 }]
      }
      await mountRuns()
      expect(text()).toContain('Push started from the admin or the command line: countries (2 of 3)')
      expect(text()).toContain('So far')
      expect(wrapper.get('.result .resource').text()).toBe('cities')
      expect(wrapper.get('.result .outcome').text()).toBe('done: created 2, updated 1, removed 0')
    })

    it('says it is finishing between the last resource and the end', async () => {
      state.running = { direction: 'pull', trigger: 'schedule', startedAt: T0, resources: ['cities'], current: null, results: [{ resource: 'cities', status: 'done' }] }
      await mountRuns()
      expect(text()).toContain('Pull by the schedule: finishing')
    })

    it('follows the run: asked again every two seconds', async () => {
      await mountRuns()
      expect(wrapper.find('.running').exists()).toBe(false)
      state.running = { direction: 'push', trigger: 'manual', startedAt: T0, resources: ['cities'], current: 'cities', results: [] }
      await poll()
      expect(wrapper.find('.running').exists()).toBe(true)
      expect(RequestService.get).toHaveBeenCalledTimes(2)
    })

    it('says when a run has ended, once, so that the page can read the records again', async () => {
      state.running = { direction: 'push', trigger: 'manual', startedAt: T0, resources: ['cities'], current: 'cities', results: [] }
      await mountRuns()
      expect(wrapper.emitted('finished')).toBeUndefined()
      state.running = false
      state.last = { direction: 'push', trigger: 'manual', startedAt: T0, finishedAt: T0 + 1500, status: 'done', resources: ['cities'], results: [{ resource: 'cities', status: 'done', created: 1, updated: 0, removed: 0 }] }
      await poll()
      expect(wrapper.emitted('finished')).toHaveLength(1)
      await poll()
      expect(wrapper.emitted('finished')).toHaveLength(1)
      expect(wrapper.find('.running').exists()).toBe(false)
    })
  })

  describe('the last run', () => {
    it('shows nothing before there is one', async () => {
      await mountRuns()
      expect(wrapper.find('.run').exists()).toBe(false)
    })

    it('shows how it went for each resource, what failed and why, who started it, when, and how long it took', async () => {
      state.last = {
        direction: 'pull', trigger: 'schedule', startedAt: T0, finishedAt: T0 + 2400, status: 'error', resources: ['cities', 'countries'],
        results: [
          { resource: 'cities', status: 'done', created: 3, updated: 0, removed: 1 },
          { resource: 'countries', status: 'error', error: 'token is not match' }
        ]
      }
      await mountRuns()
      expect(text()).toContain('Last run')
      expect(text()).toContain(`Pull by the schedule, ${new Date(T0).toLocaleString()}, 2.4s`)
      const results = wrapper.findAll('.result')
      expect(results.map(item => [item.get('.resource').text(), item.get('.outcome').text()])).toEqual([['cities', 'done: created 3, updated 0, removed 1'], ['countries', 'failed: token is not match']])
      expect(results[1].classes()).toContain('is-error')
    })

    it('says the attachments that were copied and removed, and those that failed with what else was done', async () => {
      state.last = {
        direction: 'push', trigger: 'manual', startedAt: T0, finishedAt: T0 + 1000, status: 'error', resources: ['cities', 'countries', 'regions'],
        results: [
          { resource: 'cities', status: 'done', created: 1, updated: 0, removed: 0, attachmentsAdded: 2, attachmentsRemoved: 1 },
          { resource: 'countries', status: 'error', error: '2 attachments could not be copied', created: 3, updated: 0, removed: 0, attachmentsAdded: 1 },
          { resource: 'regions', status: 'done', created: 0, updated: 0, removed: 0 }
        ]
      }
      await mountRuns()
      expect(wrapper.findAll('.outcome').map(item => item.text())).toEqual([
        'done: created 1, updated 0, removed 0, attachments added 2, removed 1',
        'failed: 2 attachments could not be copied (created 3, updated 0, removed 0, attachments added 1, removed 0)',
        'done: created 0, updated 0, removed 0'
      ])
    })

    it('names a run from code', async () => {
      state.last = { direction: 'push', trigger: 'api', startedAt: T0, finishedAt: T0, status: 'done', resources: [], results: [] }
      await mountRuns()
      expect(text()).toContain('Push from code')
    })
  })

  describe('the schedule', () => {
    it('is shown when there is one: the expression and when it comes next', async () => {
      state.schedule = { push: { cron: '0 3 * * *', next: T0 + 24 * 3600 * 1000 }, pull: { cron: '*/30 * * * *', next: T0 + 1800 * 1000 } }
      state.timeZone = 'Pacific/Auckland'
      await mountRuns()
      const items = wrapper.findAll('.scheduled')
      expect(items.map(item => item.attributes('data-direction'))).toEqual(['push', 'pull'])
      expect([items[0].get('strong').text(), items[0].get('code').text(), items[0].get('span').text()]).toEqual(['Push', '0 3 * * *', `next ${new Date(T0 + 24 * 3600 * 1000).toLocaleString(undefined, { timeZone: 'Pacific/Auckland' })} (server time, Pacific/Auckland)`])
      expect(items[1].text()).toContain('*/30 * * * *')
      expect(wrapper.find('.no-schedule').exists()).toBe(false)
    })

    it('shows only the direction that has one', async () => {
      state.schedule = { push: null, pull: { cron: '0 4 * * 1', next: T0 } }
      await mountRuns()
      expect(wrapper.findAll('.scheduled').map(item => item.attributes('data-direction'))).toEqual(['pull'])
    })

    it('says how to set one up when there is none', async () => {
      await mountRuns()
      expect(wrapper.find('.scheduled').exists()).toBe(false)
      expect(wrapper.get('.no-schedule').text()).toContain('Nothing is scheduled')
      expect(wrapper.get('.no-schedule').text()).toContain('"sync": { "schedule": { "push": "0 3 * * *" } }')
    })

    it('says when a schedule never comes', async () => {
      state.schedule = { push: { cron: '0 0 31 2 *', next: null }, pull: null }
      await mountRuns()
      expect(wrapper.get('.scheduled').text()).toContain('never comes')
    })
  })

  describe('in the Sync page', () => {
    it('is there once the resources are known, and makes the page read the open resource again when a run ends', async () => {
      ResourceService.getAll.mockResolvedValue([{ title: 'products', schema: [{ field: 'name', unique: true }] }])
      const answers = {
        '../sync/resources': ['products'],
        '../sync/local/products': [{ name: 'a' }],
        '../sync/remote/products': [{ name: 'a' }],
        '../sync/local/products/status': { status: 'done', allows: ['write'] },
        '../sync/remote/products/status': { status: 'done', allows: ['write'] }
      }
      RequestService.get.mockImplementation(async (url) => {
        if (url === '../sync/runs') return structuredClone(state)
        if (url in answers) return structuredClone(answers[url])
        throw new Error(`no answer for ${url}`)
      })
      wrapper = mountComponent(SyncResource, { attachTo: document.body, global: { mocks: { $loading: { start: vi.fn(), stop: vi.fn() } } } })
      await flushPromises()
      expect(wrapper.findComponent(SyncRuns).exists()).toBe(true)
      expect(wrapper.findComponent(SyncRuns).props('resources')).toEqual(['products'])
      await wrapper.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'products')
      wrapper.vm.selectedResource = 'products'
      await flushPromises()
      RequestService.get.mockClear()
      wrapper.findComponent(SyncRuns).vm.$emit('finished')
      await flushPromises()
      expect(RequestService.get).toHaveBeenCalledWith('../sync/local/products')
      expect(RequestService.get).toHaveBeenCalledWith('../sync/remote/products')
    })
  })
})
