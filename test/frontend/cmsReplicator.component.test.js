import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import CmsReplicator from '@c/pages/CmsReplicator.vue'
import RequestService from '@s/RequestService'
import { peerLabel, directionKey, linkState, replicatedResources } from '../../src/utils/replication.js'
import { mountComponent, TranslateService } from './helpers/mountField.js'

vi.mock('@s/RequestService', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const NOW = Date.now()
// what GET /replicator/resources answers: the links this node pulls through, and the peers pulling from it
const RESOURCES = [
  {
    name: 'articles',
    type: 'downstream',
    peers: [{ url: 'http://central.internal:9990/api/', direction: 'upstream' }],
    receives: [{ peer: 'http://central.internal:9990/api/', direction: 'upstream', state: 'live', error: null, since: NOW - 60000, retryAt: null, received: 3, lastReceivedAt: NOW - 5000 }],
    sends: []
  },
  {
    name: 'signups',
    type: 'normal',
    peers: [{ url: 'http://site-2.internal:9990/api/' }],
    receives: [{ peer: 'http://site-2.internal:9990/api/', direction: null, state: 'reconnecting', error: 'The replication peer answered 404', since: null, retryAt: NOW + 4000, received: 0, lastReceivedAt: null }],
    sends: [{ peer: 'site0002', since: NOW - 30000, sent: 2, lastSentAt: NOW - 10000 }]
  },
  { name: 'drafts', type: 'normal', peers: [], receives: [], sends: [] }
]

let wrapper
const mountPage = async () => {
  wrapper = mountComponent(CmsReplicator, { attachTo: document.body })
  await flushPromises()
  return wrapper
}
const rows = () => wrapper.findAll('tbody tr')

beforeEach(() => {
  RequestService.get.mockReset().mockResolvedValue(RESOURCES)
  RequestService.post.mockReset()
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  TranslateService.locale = 'enUS'
  document.body.innerHTML = ''
})

describe('Replicator helpers', () => {
  it('names a peer by its url, else host:port', () => {
    expect(peerLabel({ url: 'http://site-1.internal:9990/api/' })).toBe('http://site-1.internal:9990/api/')
    expect(peerLabel({ host: 'site-2.internal', port: 9000 })).toBe('site-2.internal:9000')
    expect(peerLabel('plain')).toBe('plain')
  })
  it('translates the direction of each type: downstream is received, upstream sent', () => {
    expect([directionKey('downstream'), directionKey('upstream'), directionKey('normal')]).toEqual(['TL_DIRECTION_FROM_PEERS', 'TL_DIRECTION_TO_PEERS', 'TL_DIRECTION_BOTH'])
  })
  it('names and colours the state of a link', () => {
    expect(linkState('live')).toEqual({ key: 'TL_LINK_LIVE', tone: 'success' })
    expect(linkState('reconnecting').tone).toBe('error')
    expect(linkState('connecting').tone).toBe('neutral')
    expect(linkState('whatever').key).toBe('TL_LINK_STOPPED')
  })
  it('lists the resources that replicate, and counts the others', () => {
    const { shown, others } = replicatedResources(RESOURCES)
    expect(shown.map((resource) => resource.name)).toEqual(['articles', 'signups'])
    expect(others).toBe(1)
  })
})

describe('Replicator page', () => {
  it('is in the plugin layout, with the resources that replicate and their links', async () => {
    await mountPage()
    expect(wrapper.find('.plugin-title').text()).toBe('Replicator')
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(['Resource', 'Direction', 'Receives from', 'Sends to'])
    expect(rows()).toHaveLength(2)
    const articles = rows()[0]
    expect(articles.find('.name').text()).toContain('articles')
    expect(articles.find('.name code').text()).toBe('downstream')
    expect(articles.findAll('td')[1].text()).toBe('From peers')
    expect(articles.find('.receives .cms-badge').text()).toBe('Live')
    expect(articles.find('.receives .cms-badge').classes()).toContain('is-success')
    expect(articles.find('.receives').text()).toContain('http://central.internal:9990/api/')
    expect(articles.find('.receives').text()).toContain('Last change')
    expect(articles.find('.sends').text()).toBe('No peer pulls it now')
    expect(wrapper.find('.others').text()).toBe('1 other resource does not replicate.')
  })

  it('shows a link that is down with its error and its next try, and the peers that pull from here', async () => {
    await mountPage()
    const signups = rows()[1]
    expect(signups.find('.receives .cms-badge').text()).toBe('Reconnecting')
    expect(signups.find('.receives .cms-badge').classes()).toContain('is-error')
    expect(signups.find('.receives').text()).toContain('The replication peer answered 404')
    expect(signups.find('.receives').text()).toContain('Next try')
    expect(signups.find('.sends').text()).toContain('site0002')
    expect(signups.find('.sends .cms-badge').text()).toBe('Live')
  })

  it('has nothing to start by hand: no buttons', async () => {
    await mountPage()
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(RequestService.post).not.toHaveBeenCalled()
  })

  it('asks again every two seconds, and stops when it is left', async () => {
    vi.useFakeTimers()
    await mountPage()
    expect(RequestService.get).toHaveBeenCalledTimes(1)
    expect(RequestService.get).toHaveBeenCalledWith('../replicator/resources')
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(RequestService.get).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    vi.advanceTimersByTime(6000)
    expect(RequestService.get).toHaveBeenCalledTimes(2)
    wrapper = null
  })

  it('says why the state could not be read, and keeps what it showed', async () => {
    await mountPage()
    RequestService.get.mockRejectedValue({ status: 403 })
    await wrapper.vm.refresh()
    await flushPromises()
    expect(wrapper.find('.load-error').text()).toBe('Could not load the resources: HTTP 403')
    expect(rows()).toHaveLength(2)
  })

  it('says so when nothing replicates', async () => {
    RequestService.get.mockResolvedValue([{ name: 'drafts', type: 'normal', peers: [], receives: [], sends: [] }])
    await mountPage()
    expect(rows()).toHaveLength(0)
    expect(wrapper.text()).toContain('No resources to replicate.')
  })
})
