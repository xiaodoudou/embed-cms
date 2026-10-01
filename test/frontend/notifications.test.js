import { describe, it, expect } from 'vitest'
import NotificationsService from '../../src/services/NotificationsService'

describe('NotificationsService', () => {
  it('sends a notification with its type and extras', () => {
    const received = []
    const listener = (data) => received.push(data)
    NotificationsService.events.on('notification', listener)
    NotificationsService.send('Saved', 'success', { detail: 'abc' })
    NotificationsService.events.off('notification', listener)
    expect(received).toEqual([{ message: 'Saved', type: 'success', detail: 'abc' }])
  })

  it('asks the toast host to drop the toasts of the page being left', () => {
    let cleared = 0
    const listener = () => { cleared++ }
    NotificationsService.events.on('clear-contextual', listener)
    NotificationsService.clearContextual()
    NotificationsService.events.off('clear-contextual', listener)
    expect(cleared).toBe(1)
  })
})
