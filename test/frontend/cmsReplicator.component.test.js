import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import CmsReplicator from '@c/pages/CmsReplicator.vue'
import RequestService from '@s/RequestService'
import NotificationsService from '@s/NotificationsService'
import { peerLabel, directionKey, syncOutcome } from '../../src/utils/replication.js'
import { mountComponent, TranslateService } from './helpers/mountField.js'

vi.mock('@s/RequestService', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const PEER_A = { host: 'site-1.internal', port: 9000, url: 'http://site-1.internal:9990/api/', direction: 'downstream' }
const PEER_B = { host: 'site-2.internal', port: 9000 }
// what GET /replicator/resources answers
const RESOURCES = [
  { name: 'articles', type: 'downstream', peers: [PEER_A, PEER_B], direction: 'from peers' },
  { name: 'drafts', type: 'normal', peers: [], direction: 'bi-directional' }
]

let wrapper
let toasts
const mountPage = async () => {
  wrapper = mountComponent(CmsReplicator, { attachTo: document.body })
  await flushPromises()
  return wrapper
}
const rows = () => wrapper.findAll('tbody tr')
const lastToast = () => toasts[toasts.length - 1]

beforeEach(() => {
  toasts = []
  vi.spyOn(NotificationsService, 'send').mockImplementation((message, type, extra = {}) => toasts.push({ message, type, ...extra }))
  RequestService.get.mockReset().mockResolvedValue(RESOURCES)
  RequestService.post.mockReset()
})
afterEach(() => {
  wrapper?.unmount()
  TranslateService.locale = 'enUS'
  document.body.innerHTML = ''
})

describe('Replicator helpers', () => {
  it('names a peer by its url, else host:port', () => {
    expect(peerLabel(PEER_A)).toBe('http://site-1.internal:9990/api/')
    expect(peerLabel(PEER_B)).toBe('site-2.internal:9000')
    expect(peerLabel('plain')).toBe('plain')
  })
  it('translates the direction of each type', () => {
    expect([directionKey('downstream'), directionKey('upstream'), directionKey('normal')]).toEqual(['TL_DIRECTION_FROM_PEERS', 'TL_DIRECTION_TO_PEERS', 'TL_DIRECTION_BOTH'])
  })
  it('reads the per-peer results of a sync the server answered 200', () => {
    expect(syncOutcome({ ok: true, result: { results: [{ peer: PEER_A, status: 'ok' }] } })).toEqual({ status: 'ok', total: 1, failed: [] })
    expect(syncOutcome({ ok: true, result: { results: [{ peer: PEER_A, status: 'ok' }, { peer: PEER_B, status: 'error', error: 'ECONNREFUSED' }] } }))
      .toEqual({ status: 'failed', total: 2, failed: [{ peer: 'site-2.internal:9000', error: 'ECONNREFUSED' }] })
    expect(syncOutcome({ ok: true, result: { results: [] } }).status).toBe('none')
  })
})

describe('Replicator page', () => {
  it('lists the resources with their type, direction and peers, in the admin language', async () => {
    await mountPage()
    expect(RequestService.get).toHaveBeenCalledWith('../replicator/resources')
    expect(wrapper.find('.plugin-title').text()).toBe('Replicator')
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(['Resource', 'Type', 'Direction', 'Peers', 'Actions'])
    const first = rows()[0].findAll('td').map((td) => td.text())
    expect(first.slice(0, 4)).toEqual(['articles', 'downstream', 'From peers', 'http://site-1.internal:9990/api/, site-2.internal:9000'])
    expect(rows()[1].find('.peers').text()).toBe('No peers')
    expect(rows()[1].find('.actions .v-btn').attributes('disabled')).toBeDefined()
  })

  it('says so when a peer failed, although the server answered 200', async () => {
    RequestService.post.mockResolvedValue({ ok: true, result: { resource: 'articles', results: [{ peer: PEER_A, status: 'ok' }, { peer: PEER_B, status: 'error', error: 'ECONNREFUSED' }] } })
    await mountPage()
    await rows()[0].find('.actions .v-btn').trigger('click')
    await flushPromises()
    expect(RequestService.post).toHaveBeenCalledWith('../replicator/sync/articles')
    expect(lastToast()).toMatchObject({ type: 'error', message: 'Sync of articles failed with 1 of 2 peers', detail: 'site-2.internal:9000: ECONNREFUSED', detailLabel: 'TL_COPY_ERRORS', actionLabel: 'Retry' })
  })

  it('reports success only when every peer synced', async () => {
    RequestService.post.mockResolvedValue({ ok: true, result: { resource: 'articles', results: [{ peer: PEER_A, status: 'ok' }] } })
    await mountPage()
    await wrapper.vm.syncResource('articles')
    expect(toasts.map((toast) => toast.type)).toEqual(['info', 'success'])
    expect(lastToast().message).toBe('Sync finished for articles')
  })

  it('warns when no peer accepted the direction, and reports a refused request', async () => {
    RequestService.post.mockResolvedValueOnce({ ok: true, result: { results: [] } })
    await mountPage()
    await wrapper.vm.syncResource('articles')
    expect(lastToast()).toMatchObject({ type: 'warn', message: 'Nothing synced for articles: no peer accepts its direction' })
    RequestService.post.mockRejectedValueOnce({ error: 'Resource \'nope\' not found' })
    await wrapper.vm.syncResource('nope')
    expect(lastToast()).toMatchObject({ type: 'error', message: 'Sync failed for nope: Resource \'nope\' not found' })
  })

  it('syncs one record by id', async () => {
    RequestService.post.mockResolvedValue({ ok: true, result: { results: [{ peer: PEER_A, status: 'ok', recordId: 'r1' }] } })
    await mountPage()
    wrapper.vm.syncRecordPrompt('articles')
    wrapper.vm.recordId = 'r1'
    await wrapper.vm.doSyncRecord()
    expect(RequestService.post).toHaveBeenCalledWith('../replicator/sync/articles/r1')
    expect(lastToast().type).toBe('success')
  })

  it('shows why the list could not be loaded', async () => {
    RequestService.get.mockRejectedValue({ status: 403 })
    await mountPage()
    expect(wrapper.find('.load-error').text()).toBe('Could not load the resources: HTTP 403')
  })
})
