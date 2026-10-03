import _ from 'lodash'
import Emitter from 'tiny-emitter'
class LoadingService {
  constructor () {
    this.events = new Emitter()
    this.list = []
  }
  /** @param {string} name */
  start (name) {
    this.isShow = true
    this.list.push(name)
    this.checkLoading()
  }

  /** @param {string} name */
  stop (name) {
    this.list = _.filter(this.list, item => item !== name)
    this.list = _.compact(this.list)
    this.checkLoading()
  }

  /** Emits has-loading with whether anything is loading. */
  checkLoading() {
    this.events.emit('has-loading', _.get(this.list, 'length', 0) > 0)
  }
}

export default new LoadingService()
