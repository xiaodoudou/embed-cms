const _ = require('lodash')
const express = require('express')
const routes = require('./routes')
const { createUpload, cleanupUploads } = require('../../util/uploads')
const mw = {
  authorize: require('./middleware/authorize'),
  find_resource: require('./middleware/findResource'),
  list_resources: require('./middleware/listResources'),
  parse_query: require('./middleware/parseQuery')
}
const defaults = {
  mount: '/api'
}

/*
 * Constructor
 *
 * @param {Object} options, optional
 *   @param {Route} mount, route to mount itself, eg. '/api'
 */
class Rest  {
  constructor (cms, options, configPath) {
    this.cms = cms
    this.cms.$rest = this
    this._app = cms._app
    this.options = options
    this.configPath = configPath
    this.options = _.extend({}, defaults, options)
    this.initialize()
  }

  /** Mounts the REST routes of the records and their attachments, each behind the resource lookup, the rights and the query parsing. */
  initialize () {
    const app = express()
    const upload = createUpload(this.cms.security)
    app.get('/:resource([\\w-_]+)', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.list)
    app.get('/:resource([\\w-_]+)/:id([\\w-_]+)', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.find)
    app.post('/:resource([\\w-_]+)', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.create)
    app.put('/:resource([\\w-_]+)/:id([\\w-_]+)', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.update)
    app.delete('/:resource([\\w-_]+)/:id([\\w-_]+)', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.remove)

    app.get('/:resource([\\w-_]+)/file/:aid([\\w-_]+)', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.findFile)
    app.get('/:resource([\\w-_]+)/:id([\\w-_]+)/attachments/:aid([\\w-_]+).:ext([\\w-_]+)?', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.findAttachment)
    app.get('/:resource([\\w-_]+)/:id([\\w-_]+)/attachments/:aid([\\w-_]+).:ext([\\w-_]+)?/cropped', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.findCroppedAttachment)
    app.get('/:resource([\\w-_]+)/:id([\\w-_]+)/attachments/:aid([\\w-_]+).:ext([\\w-_]+)?/crop-suggestion', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.suggestAttachmentCrop)
    app.post('/:resource([\\w-_]+)/attachments/crop-suggestion', mw.find_resource(this), mw.authorize(this), mw.parse_query, cleanupUploads, upload.any(), routes.suggestUploadedCrop)
    app.put('/:resource([\\w-_]+)/:id([\\w-_]+)/attachments/:aid([\\w-_]+).:ext([\\w-_]+)?', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.updateAttachment)
    app.post('/:resource([\\w-_]+)/:id([\\w-_]+)/attachments', mw.find_resource(this), mw.authorize(this), mw.parse_query, cleanupUploads, upload.any(), routes.createAttachment)
    app.put('/:resource([\\w-_]+)/:id([\\w-_]+)/attachments', mw.find_resource(this), mw.authorize(this), mw.parse_query, cleanupUploads, upload.any(), routes.updateAttachment)
    app.delete('/:resource([\\w-_]+)/:id([\\w-_]+)/attachments/:aid([\\w-_]+)', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.removeAttachment)
    app.delete('/:resource([\\w-_]+)/:id([\\w-_]+)/attachments', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.removeAttachment)
    this._app.use(this.options.mount, app)
    this._app.use('/resources', mw.list_resources(this))
  }
}

exports = module.exports = Rest
