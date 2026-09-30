// import _ from 'lodash'
import Emitter from 'tiny-emitter'

class NotificationsService {
  constructor () {
    this.events = new Emitter()
  }

  /**
   * @param {string} message text shown in the toast
   * @param {string} type 'success' | 'error' | 'warn' | 'info'
   * @param {{detail?: string, actionLabel?: string, action?: Function}} extra optional copyable detail (e.g. a record id) and a toast action such as Retry
   */
  send (message, type = 'success', extra = {}) {
    this.events.emit('notification', {message, type, ...extra})
  }

  /**
   * Dismisses the toasts that belong to the page being left (errors and warnings stay until dismissed otherwise).
   * Call it when the record or the page changes.
   */
  clearContextual () {
    this.events.emit('clear-contextual')
  }

  // asks the app bar to open the quick switcher (used by the collapsed sidebar)
  openOmnibar () {
    this.events.emit('omnibar-open')
  }

  sendOmnibarDisplayStatus (status) {
    this.events.emit('omnibar-display-status', status)
  }
}

export default new NotificationsService()
