import NotificationsService from '@s/NotificationsService'
import { log } from '@u/log'
export default {
  methods: {
    notify (message, type = 'success', extra = {}) {
      // the toast is the message; the console only gets what may need investigating
      if (type === 'error' || type === 'warn') {
        console[type](message)
      } else {
        log.debug(message)
      }
      NotificationsService.send(message, type, extra)
    },
    sendOmnibarDisplayStatus (status) {
      NotificationsService.sendOmnibarDisplayStatus(status)
    }
  }
}
