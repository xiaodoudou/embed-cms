import { log } from '@u/log'
import _ from 'lodash'
import Emitter from 'tiny-emitter'
import RequestService from './RequestService'
import VueCookies from 'vue-cookies'

class LoginService {
  constructor () {
    this.events = new Emitter()
    this.user = null
    this.logoutCallbackList = []
  }

  init () {
    // log.debug('LoginService - init')
    setInterval(async () => {
      this.checkStatus()
    }, 1000 * 15)
  }

  async getPlugins() {
    const groups = await RequestService.get(`${window.location.pathname}_groups`)
    return _.get(_.find(groups, {name: _.get(this.user, 'group', false)}), 'plugins', [])
  }

  async getStatus () {
    try {
      const data = await RequestService.get(`${window.location.pathname}login`)
      if (_.get(this.user, '_updatedAt', false) && _.get(data, '_updatedAt', false)) {
        if (this.user._updatedAt !== data._updatedAt) {
          log.debug('User data updated, will logout...')
          return await this.logout()
        }
      } else if (_.isEmpty(data) && !_.isEmpty(this.user)) {
        log.debug('User not logged in, will logout...')
        return await this.logout()
      }
      this.user = data
      const remoteUptime = _.get(this.user, 'uptime', +new Date())
      const localUptime = _.parseInt(VueCookies.get('uptime') || -1)
      if (localUptime <= -1) {
        VueCookies.set('uptime', `${remoteUptime}`)
        log.debug('Server uptime saved:', VueCookies.get('uptime'))
      } else if (_.isNumber(localUptime) && remoteUptime > localUptime) {
        log.debug('Will reload page for a new version...')
        VueCookies.remove('uptime')
        window.location.reload(true)
      }
      return this.user
    } catch {
      return null
    }
  }

  async checkStatus () {
    let status
    const userBefore = _.cloneDeep(this.user)
    try {
      status = await this.getStatus()
    } catch {
    }
    if (_.isEmpty(status) && !_.isEmpty(userBefore)) {
      log.debug('will logout')
      await this.logout()
    }
  }

  async changeTheme () {
    try {
      const newTheme = _.get(this.user, 'theme', 'dark') === 'dark' ? 'light' : 'dark'
      this.events.emit('changed-theme', newTheme)
      await RequestService.get(`${window.location.pathname}changeTheme/${newTheme}`)
      log.debug(`Successfully changed the theme for user: ${newTheme}`)
      _.set(this.user, 'theme', newTheme)
      document.querySelectorAll('body')[0].classList = [`v-theme--${newTheme}`]
      return newTheme
    } catch (error) {
      console.error('Failed to change theme: ', error)
    }
  }

  async logout () {
    this.user = null
    try {
      await RequestService.get(`${window.location.pathname}logout`)
      window.location.reload()
    } catch (error) {
      console.error('Failed to logout: ', error)
    }
    _.each(this.logoutCallbackList, callback => {
      callback()
    })
  }

  onLogout (callback) {
    this.logoutCallbackList.push(callback)
  }

  checkPermission (module) {
    return _.includes(this.user.group.modules, module)
  }
}

export default new LoginService()
