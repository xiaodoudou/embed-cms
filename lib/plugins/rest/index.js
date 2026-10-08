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
    // Express 5 has no inline patterns in a path: a name or an id of another shape is not one of these routes
    app.param(['resource', 'id', 'aid', 'ext'], (req, res, next, value) => /^[\w-]+$/.test(value) ? next() : next('route'))
    app.get('/:resource', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.list)
    app.get('/:resource/:id', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.find)
    app.post('/:resource', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.create)
    app.put('/:resource/:id', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.update)
    app.delete('/:resource/:id', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.remove)

    app.get('/:resource/file/:aid', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.findFile)
    app.get('/:resource/:id/attachments/:aid{.:ext}', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.findAttachment)
    app.get('/:resource/:id/attachments/:aid{.:ext}/cropped', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.findCroppedAttachment)
    app.get('/:resource/:id/attachments/:aid{.:ext}/crop-suggestion', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.suggestAttachmentCrop)
    app.post('/:resource/attachments/crop-suggestion', mw.find_resource(this), mw.authorize(this), mw.parse_query, cleanupUploads, upload.any(), routes.suggestUploadedCrop)
    app.put('/:resource/:id/attachments/:aid{.:ext}', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.updateAttachment)
    app.post('/:resource/:id/attachments', mw.find_resource(this), mw.authorize(this), mw.parse_query, cleanupUploads, upload.any(), routes.createAttachment)
    app.put('/:resource/:id/attachments', mw.find_resource(this), mw.authorize(this), mw.parse_query, cleanupUploads, upload.any(), routes.updateAttachment)
    app.delete('/:resource/:id/attachments/:aid', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.removeAttachment)
    app.delete('/:resource/:id/attachments', mw.find_resource(this), mw.authorize(this), mw.parse_query, routes.removeAttachment)
    this._app.use(this.options.mount, app)
    this._app.use('/resources', mw.list_resources(this))
  }
}

exports = module.exports = Rest
