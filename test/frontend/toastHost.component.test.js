import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ToastHost from '@c/feedback/ToastHost.vue'
import NotificationsService from '@s/NotificationsService'
import { mountComponent } from './helpers/mountField.js'

describe('ToastHost', () => {
  let wrapper
  const toasts = () => wrapper.findAll('.toast')

  beforeEach(() => {
    vi.useFakeTimers()
    wrapper = mountComponent(ToastHost)
  })
  afterEach(() => {
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('shows a notification with its message and type', async () => {
    NotificationsService.send('Record saved', 'success')
    await wrapper.vm.$nextTick()
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].text()).toContain('Record saved')
    expect(toasts()[0].classes()).toContain('toast-success')
    expect(toasts()[0].attributes('role')).toBe('status')
  })

  it('announces errors as alerts', async () => {
    NotificationsService.send('Could not save', 'error')
    await wrapper.vm.$nextTick()
    expect(toasts()[0].attributes('role')).toBe('alert')
  })

  it('fades a success by itself after 4 seconds, an error after 8', async () => {
    NotificationsService.send('Saved', 'success')
    NotificationsService.send('Failed', 'error')
    await wrapper.vm.$nextTick()
    expect(toasts()).toHaveLength(2)
    vi.advanceTimersByTime(4100)
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.toasts.map((t) => t.message)).toEqual(['Failed'])
    vi.advanceTimersByTime(4100)
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.toasts).toHaveLength(0)
  })

  it('replaces the same message shown again instead of stacking a copy', async () => {
    NotificationsService.send('Saved', 'success')
    NotificationsService.send('Saved', 'success')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.toasts).toHaveLength(1)
  })

  it('keeps at most three toasts, the newest ones', async () => {
    for (const n of [1, 2, 3, 4]) {
      NotificationsService.send(`Message ${n}`, 'info')
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.toasts.map((t) => t.message)).toEqual(['Message 2', 'Message 3', 'Message 4'])
  })

  it('pauses the timer while the pointer is over a toast', async () => {
    NotificationsService.send('Read me', 'success')
    await wrapper.vm.$nextTick()
    await toasts()[0].trigger('mouseenter')
    vi.advanceTimersByTime(10000)
    expect(wrapper.vm.toasts).toHaveLength(1)
    await toasts()[0].trigger('mouseleave')
    vi.advanceTimersByTime(4100)
    expect(wrapper.vm.toasts).toHaveLength(0)
  })

  it('closes a toast with its close button', async () => {
    NotificationsService.send('Bye', 'info')
    await wrapper.vm.$nextTick()
    await wrapper.get('.toast-close').trigger('click')
    expect(wrapper.vm.toasts).toHaveLength(0)
  })

  it('runs the action of a toast and dismisses it', async () => {
    const action = vi.fn()
    NotificationsService.send('Upload failed', 'error', { actionLabel: 'Retry', action })
    await wrapper.vm.$nextTick()
    await wrapper.get('.toast-link').trigger('click')
    expect(action).toHaveBeenCalledOnce()
    expect(wrapper.vm.toasts).toHaveLength(0)
  })

  it('drops errors and warnings of the page being left, and keeps the others', async () => {
    NotificationsService.send('Saved', 'success')
    NotificationsService.send('Failed', 'error')
    NotificationsService.send('Careful', 'warn')
    await wrapper.vm.$nextTick()
    NotificationsService.clearContextual()
    expect(wrapper.vm.toasts.map((t) => t.message)).toEqual(['Saved'])
  })

  it('names the copyable detail: a record id by default, or what the sender says it is', async () => {
    NotificationsService.send('Record saved', 'success', { detail: 'abc123' })
    NotificationsService.send('Sync failed', 'error', { detail: 'peer: ECONNREFUSED', detailLabel: 'TL_COPY_ERRORS' })
    await wrapper.vm.$nextTick()
    expect(toasts().map((toast) => toast.find('.toast-actions .toast-link').text())).toEqual(['Copy id', 'Copy the errors'])
  })

  it('treats an unknown type as info', async () => {
    NotificationsService.send('Odd', 'whatever')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.toasts[0].type).toBe('info')
  })

  it('stops listening when it goes away', async () => {
    wrapper.unmount()
    NotificationsService.send('Nobody home', 'info')
    expect(NotificationsService.events.e?.notification || []).toHaveLength(0)
    wrapper = mountComponent(ToastHost)
  })
})
