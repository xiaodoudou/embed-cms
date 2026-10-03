import NotificationsService from '@s/NotificationsService'
import { log } from '@u/log'
export default {
  methods: {
    /**
     * @param {string} message
     * @param {string} type success, error, warn or info; errors and warnings go to the console too
     * @param {Object} extra detail, action
     */
    notify (message, type = 'success', extra = {}) {
      // the toast is the message; the console only gets what may need investigating
      if (type === 'error' || type === 'warn') {
        console[type](message)
      } else {
        log.debug(message)
      }
      NotificationsService.send(message, type, extra)
    },
    /** @param {boolean} status */
    sendOmnibarDisplayStatus (status) {
      NotificationsService.sendOmnibarDisplayStatus(status)
    }
  }
}
