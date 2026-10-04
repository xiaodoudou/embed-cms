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

  /** Polls the login status. */
  init () {
    // log.debug('LoginService - init')
    setInterval(async () => {
      this.checkStatus()
    }, 1000 * 15)
  }

  /** @returns {Promise<Array<Object>>} the plugins of the group of the user */
  async getPlugins() {
    const groups = await RequestService.get(`${window.location.pathname}_groups`)
    return _.get(_.find(groups, {name: _.get(this.user, 'group', false)}), 'plugins', [])
  }

  /** @returns {Promise<Object|null>} the logged-in user */
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

  /** Loads the status; a logout or a change of user runs the logout callbacks. */
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

  /**
   * @param {string} [wanted] the theme to keep ('light' or 'dark'); the other one than the user has when none is given
   * @returns {Promise<string|undefined>} the theme, saved for the user; nothing when the server could not keep it
   */
  async changeTheme (wanted) {
    const before = _.get(this.user, 'theme', 'dark')
    const newTheme = wanted || (before === 'dark' ? 'light' : 'dark')
    try {
      this.events.emit('changed-theme', newTheme)
      await RequestService.get(`${window.location.pathname}changeTheme/${newTheme}`)
      log.debug(`Successfully changed the theme for user: ${newTheme}`)
      _.set(this.user, 'theme', newTheme)
      return newTheme
    } catch (error) {
      console.error('Failed to change theme: ', error)
      // the fields that were told are told again, with the theme that is still the one
      this.events.emit('changed-theme', before)
    }
  }

  /** Clears the user, tells the server, runs the callbacks. */
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

  /** @param {Function} callback */
  onLogout (callback) {
    this.logoutCallbackList.push(callback)
  }

  /**
   * @param {string} module
   * @returns {boolean} whether the group of the user has it
   */
  checkPermission (module) {
    return _.includes(this.user.group.modules, module)
  }
}

export default new LoginService()
