import { log } from '@u/log'
import _ from 'lodash'
import Emitter from 'tiny-emitter'
import RequestService from '@s/RequestService'
import { menuIconMap } from '@u/navModel'

class ResourceService {
  constructor () {
    this.cacheMap = {}
    // emits 'cached' with the resource name each time a resource is (re)loaded
    this.events = new Emitter()
    this.paragraphs = {}
  }

  /**
   * @param {string} resource
   * @returns {Promise<Array<Object>>} its records, kept in the cache; a logged-out answer sends to the login page
   */
  async cache (resource) {
    const data = await RequestService.get(`${window.location.pathname}../api/${resource}`)
    if (_.get(data, 'userLoggedOut', false)) {
      log.debug('Received userLoggedOut from server, will redirect to login page')
      window.location.reload()
      return []
    }
    this.cacheMap[resource] = data
    this.events.emit('cached', resource)
    return this.get(resource)
  }

  /** { group name: icon url } from the Settings record, once it has been loaded */
  menuIcons () {
    return menuIconMap(_.first(this.cacheMap._settings))
  }

  /** @returns {Promise<Array<Object>>} the resources, their attachments listed */
  async getAll() {
    return await RequestService.get(`${window.location.pathname}resources?listAttachments=true`)
  }

  /** Loads the paragraph schemas by title. */
  async getAllParagraphs() {
    const paragraphs = await RequestService.get(`${window.location.pathname}paragraphs`)
    _.each(paragraphs, (paragraph)=> {
      _.set(this.paragraphs, paragraph.title, paragraph)
    })
  }

  /**
   * @param {string} resource
   * @returns {Array<Object>|undefined} the cached records
   */
  get (resource) {
    const data = this.cacheMap[resource]
    if (_.isUndefined(data)) {
      log.debug(`resource (${resource}) is not cached`)
    }
    return data
  }

  /** @param {Array<Object>} schemas */
  setSchemas (schemas) {
    this.schemas = schemas
  }

  /**
   * @param {string} resource
   * @returns {Object|undefined}
   */
  getSchema (resource) {
    return _.find(this.schemas, { title: resource })
  }

  /**
   * @param {string} key
   * @returns {Object|false}
   */
  getParagraphSchema(key) {
    return _.get(this.paragraphs, key, false)
  }
}

export default new ResourceService()
