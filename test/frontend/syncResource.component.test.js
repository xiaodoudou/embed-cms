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
    '../sync/runs': { running: false, last: null, schedule: { push: null, pull: null } },
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
    expect(wrapper.get('.plugin-title h5').text()).toBe('Sync')
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
      const counts = wrapper.findAll('.num-record').map((item) => [item.get('.env').text(), item.get('.count').text()])
      expect(counts).toEqual([['This CMS', '3records'], ['The other CMS', '3records']])
    })

    it('counts what a push or a pull would create, update and remove, by the unique key', async () => {
      await page()
      await choose('products')
      expect(text()).toContain('create: 1')
      expect(text()).toContain('update: 1')
      expect(text()).toContain('remove: 1')
    })

    it('shows what each direction would do: a pull creates what a push would remove, and the other way round', async () => {
      // this CMS has a, b, c and the other one has only a and e: a push creates b and c and removes e, a pull creates e and removes b and c
      answers['../sync/local/products'] = [record('a', { n: 1 }), record('b'), record('c')]
      answers['../sync/remote/products'] = [record('a', { n: 1 }), record('e')]
      await page()
      await choose('products')
      const changes = (direction) => wrapper.findAll(`.direction.is-${direction} .changes li`).map((item) => item.text())
      expect(changes('push')).toEqual(['create: 2', 'update: 0', 'remove: 1'])
      expect(changes('pull')).toEqual(['create: 1', 'update: 0', 'remove: 2'])
    })

    describe('the attachments (files)', () => {
      const file = (name, md5, extra = {}) => ({ _id: `${name}-${md5}`, _name: name, _md5sum: md5, _filename: `${name}.png`, url: `/x/${md5}`, ...extra })

      it('shows nothing about attachments when no record has one', async () => {
        await page()
        await choose('products')
        expect(wrapper.find('.attachments-count').exists()).toBe(false)
        expect(wrapper.find('.direction .attachments').exists()).toBe(false)
      })

      it('counts the files of each CMS under its records', async () => {
        answers['../sync/local/products'] = [record('a', { _attachments: [file('cover', 'm1'), file('pdf', 'm2')] }), record('b', { _attachments: [file('cover', 'm3')] })]
        answers['../sync/remote/products'] = [record('a', { _attachments: [file('cover', 'm1')] })]
        await page()
        await choose('products')
        expect(wrapper.findAll('.num-record').map((item) => item.get('.attachments-count').text())).toEqual(['3 attachments', '1 attachment'])
      })

      it('says what a push and a pull would copy and remove: the files of new records, of a field whose files differ, and of removed records', async () => {
        // a is on both, its cover differs (this CMS has m1, the other one m9) and only this CMS has the pdf; b is only on this CMS; c only on the other
        answers['../sync/local/products'] = [
          record('a', { _attachments: [file('cover', 'm1'), file('pdf', 'm2')] }),
          record('b', { _attachments: [file('cover', 'm3'), file('gallery', 'm4')] })
        ]
        answers['../sync/remote/products'] = [
          record('a', { _attachments: [file('cover', 'm9')] }),
          record('c', { _attachments: [file('cover', 'm5'), file('gallery', 'm6')] })
        ]
        await page()
        await choose('products')
        // a push: a's cover is replaced (copy 1, remove 1), the pdf is copied (1), b's two files are copied, c goes with its two files
        expect(wrapper.get('.direction.is-push .attachments').text()).toBe('attachments: copy 4, remove 3')
        // a pull: a's cover is replaced (copy 1, remove 1), the pdf is removed (1), c's two files are copied, b goes with its two files
        expect(wrapper.get('.direction.is-pull .attachments').text()).toBe('attachments: copy 3, remove 4')
      })

      it('counts only the files that are not on both sides, when a field has several', async () => {
        answers['../sync/local/products'] = [record('a', { _attachments: [file('cover', 'm1'), file('cover', 'm2'), file('cover', 'm3')] })]
        answers['../sync/remote/products'] = [record('a', { _attachments: [file('cover', 'm1'), file('cover', 'm2')] })]
        await page()
        await choose('products')
        expect(wrapper.get('.direction.is-push .attachments').text()).toBe('attachments: copy 1, remove 0')
        expect(wrapper.get('.direction.is-pull .attachments').text()).toBe('attachments: copy 0, remove 1')
      })

      it('does not count files that are the same, whatever their address', async () => {
        answers['../sync/local/products'] = [record('a', { _attachments: [file('cover', 'm1', { url: '/one' })] })]
        answers['../sync/remote/products'] = [record('a', { _attachments: [file('cover', 'm1', { url: '/two' })] })]
        await page()
        await choose('products')
        expect(wrapper.get('.direction.is-push .attachments').text()).toBe('attachments: copy 0, remove 0')
        expect(wrapper.get('.direction.is-pull .attachments').text()).toBe('attachments: copy 0, remove 0')
      })

      it('says what was done to the files in the report afterwards, and in the last sync of a CMS', async () => {
        answers['../sync/local/products'] = [record('a', { _attachments: [file('cover', 'm1')] })]
        await page()
        await choose('products')
        await wrapper.get('.directions .push').trigger('click')
        await flushPromises()
        answers['../sync/remote/products/status'] = { status: 'done', created: 1, updated: 0, removed: 0, attachmentsAdded: 2, attachmentsRemoved: 1, startedAt: 1790000000000, stopAt: 1790000001000, allows: ['write'] }
        await tick()
        expect(wrapper.get('.report-counts').text()).toBe('created 1, updated 0, removed 0, attachments added 2, removed 1, took 1s')
        expect(wrapper.findAll('.num-record')[1].get('.last-sync').text()).toContain('created 1, updated 0, removed 0, attachments added 2, removed 1')
      })

      it('says a failed sync copied files that could not be copied, with what it did do', async () => {
        await page()
        await choose('products')
        await wrapper.get('.directions .push').trigger('click')
        await flushPromises()
        answers['../sync/remote/products/status'] = { status: 'error', error: '2 attachments could not be copied', created: 3, updated: 0, removed: 0, attachmentsAdded: 1, allows: ['write'] }
        await tick()
        expect(wrapper.get('.report-error').text()).toBe('2 attachments could not be copied')
        expect(wrapper.get('.report-counts').text()).toBe('created 3, updated 0, removed 0, attachments added 1, removed 0')
      })
    })

    it('compares records whose unique field is one text per language by value, not by the object', async () => {
      // the unique key is `title`, a text per language: two objects with the same texts are the same record
      ResourceService.getAll.mockResolvedValue([{ title: 'products', schema: [{ field: 'title', unique: true }] }])
      const entry = (en, extra = {}) => ({ title: { enUS: en }, _attachments: [], ...extra })
      answers['../sync/local/products'] = [entry('One', { n: 1 }), entry('Two'), entry('Three')]
      answers['../sync/remote/products'] = [entry('One', { n: 2 }), entry('Two'), entry('Four')]
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

    it('says under each count what the last sync that wrote to that CMS did, and when', async () => {
      answers['../sync/local/products/status'] = { status: 'done', created: 0, updated: 2, removed: 1, startedAt: 1790000000000, stopAt: 1790000002000, allows: ['write'] }
      answers['../sync/remote/products/status'] = { status: 'error', error: 'disk full', startedAt: 1790000000000, stopAt: 1790000003000, allows: ['write'] }
      await page()
      await choose('products')
      const lines = wrapper.findAll('.num-record').map((item) => item.find('.last-sync'))
      expect(lines[0].text()).toBe(`Last sync ${new Date(1790000002000).toLocaleString()}: created 0, updated 2, removed 1`)
      expect(lines[0].classes()).not.toContain('is-error')
      expect(lines[1].text()).toBe(`Last sync ${new Date(1790000003000).toLocaleString()}: disk full`)
      expect(lines[1].classes()).toContain('is-error')
    })

    it('says nothing about a last sync when none has run on that CMS', async () => {
      await page()
      await choose('products')
      expect(wrapper.find('.last-sync').exists()).toBe(false)
    })

    it('says N/A when a server cannot be read', async () => {
      delete answers['../sync/remote/products']
      await page()
      await choose('products')
      expect(wrapper.get('.na-field').text()).toBe('N/A')
      expect(text()).toContain('The other CMSN/A')
      // nothing to compare, so nothing to push or pull
      expect(wrapper.find('.directions').exists()).toBe(false)
    })

    it('offers to push and to pull only when that side allows writing', async () => {
      await page()
      await choose('products')
      expect(wrapper.findAll('.directions button').map((button) => button.text())).toEqual(['Push to the other CMS', 'Pull from the other CMS'])
      answers['../sync/remote/products/status'] = { status: 'idle', allows: ['read'] }
      await choose('products')
      expect(wrapper.findAll('.directions button').map((button) => button.text())).toEqual(['Pull from the other CMS'])
      expect(wrapper.get('.is-push .not-allowed').text()).toBe('The other CMS does not allow writing.')
      answers['../sync/local/products/status'] = { status: 'idle', allows: ['read'] }
      await choose('products')
      expect(wrapper.findAll('.directions button')).toHaveLength(0)
      expect(wrapper.get('.is-pull .not-allowed').text()).toBe('This CMS does not allow writing.')
    })
  })

  describe('syncing', () => {
    // the button of a direction: 'push' or 'pull'
    const start = async (direction) => {
      await page()
      await choose('products')
      await wrapper.get(`.directions .${direction}`).trigger('click')
      await flushPromises()
    }

    it('asks the server to copy in the direction chosen, and says it started', async () => {
      await start('push')
      expect(RequestService.post).toHaveBeenCalledWith('../sync/products/from/local/to/remote')
      expect(sent.mock.calls.at(-1)[1]).toBe('info')
      expect(loading.start).toHaveBeenCalledWith('deploy-resource')
    })

    it('pulls the other way', async () => {
      await start('pull')
      expect(RequestService.post).toHaveBeenCalledWith('../sync/products/from/remote/to/local')
    })

    it('shows the progress while the target is syncing', async () => {
      await start('push')
      answers['../sync/remote/products/status'] = { status: 'syncing', resource: 'products', created: 1, createTotal: 4, updated: 0, updateTotal: 2, removed: 0, removeTotal: 0 }
      await tick()
      expect(text()).toContain('created: 1 / 4')
      expect(loading.stop).not.toHaveBeenCalledWith('deploy-resource')
    })

    it('says it is done when the sync ends, stops the loading mark and reloads the numbers', async () => {
      await start('push')
      RequestService.get.mockClear()
      await tick()
      expect(sent.mock.calls.at(-1)[1]).toBe('success')
      expect(loading.stop).toHaveBeenCalledWith('deploy-resource')
      expect(RequestService.get).toHaveBeenCalledWith('../sync/local/products')
    })

    describe('the report afterwards', () => {
      const done = { status: 'done', created: 2, updated: 1, removed: 3, startedAt: 1790000000000, stopAt: 1790000001500, allows: ['write'] }

      it('stays on the page when a push ends: what it created, updated and removed, and how long it took', async () => {
        await start('push')
        expect(wrapper.find('.report').exists()).toBe(false)
        answers['../sync/remote/products/status'] = { ...done }
        await tick()
        const report = wrapper.get('.report')
        expect(report.classes()).toContain('is-done')
        expect(report.get('.report-title').text()).toBe('Push done: products')
        expect(report.get('.report-counts').text()).toBe('created 2, updated 1, removed 3, took 1.5s')
      })

      it('reads a pull from the report of this CMS, which it wrote to', async () => {
        await start('pull')
        answers['../sync/local/products/status'] = { ...done, created: 5, updated: 0, removed: 0 }
        await tick()
        expect(wrapper.get('.report-title').text()).toBe('Pull done: products')
        expect(wrapper.get('.report-counts').text()).toBe('created 5, updated 0, removed 0, took 1.5s')
      })

      it('says why when it failed, and says it failed', async () => {
        await start('push')
        answers['../sync/remote/products/status'] = { status: 'error', error: 'disk full', allows: ['write'] }
        await tick()
        const report = wrapper.get('.report')
        expect(report.classes()).toContain('is-error')
        expect(report.get('.report-title').text()).toBe('Push failed: products')
        expect(report.get('.report-error').text()).toBe('disk full')
        expect(wrapper.find('.report-counts').exists()).toBe(false)
      })

      it('leaves out how long it took when the CMS did not say', async () => {
        await start('push')
        answers['../sync/remote/products/status'] = { status: 'done', created: 1, updated: 0, removed: 0, allows: ['write'] }
        await tick()
        expect(wrapper.get('.report-counts').text()).toBe('created 1, updated 0, removed 0')
      })

      it('goes when another resource is chosen, and when another sync starts', async () => {
        await start('push')
        answers['../sync/remote/products/status'] = { ...done }
        await tick()
        expect(wrapper.find('.report').exists()).toBe(true)
        await wrapper.get('.directions .pull').trigger('click')
        await flushPromises()
        expect(wrapper.find('.report').exists()).toBe(false)
        answers['../sync/local/products/status'] = { ...done }
        await tick()
        expect(wrapper.find('.report').exists()).toBe(true)
        await choose('pages')
        expect(wrapper.find('.report').exists()).toBe(false)
      })
    })

    it('says so when the sync ended with an error', async () => {
      await start('push')
      answers['../sync/remote/products/status'] = { status: 'error', error: 'disk full' }
      await tick()
      const last = sent.mock.calls.at(-1)
      expect(last[1]).toBe('error')
      expect(last[0]).toContain('disk full')
    })

    it('says so, with a retry, when the server refuses to start', async () => {
      RequestService.post.mockRejectedValueOnce(new Error('refused'))
      await start('push')
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
