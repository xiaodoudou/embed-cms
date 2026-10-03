const path = require('path')
const fs = require('fs-extra')
const _ = require('lodash')
const logger = require('../../logger')

/**
 * The Authorization header for a CMS login.
 * @param {{username?: string, password?: string}} [auth]
 * @returns {{Authorization?: string}}
 */
const authHeaders = (auth) => {
  if (!_.get(auth, 'username')) {
    return {}
  }
  return { Authorization: 'Basic ' + Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64') }
}

/**
 * Client of the CMS REST api used by the cms-import command.
 * Requests carry the credentials as Basic authentication and, after login(), the session it opened, which the
 * routes behind the admin login (/admin/resources) need when the CMS uses its JWT login.
 * @param {{protocol?: string, host: string, prefix?: string}} config
 * @param {{username?: string, password?: string}} [auth]
 */
exports = module.exports = (config, auth) => {
  config.protocol = config.protocol || 'http://'
  // prefix is optional: the CMS may be mounted at the root
  const prefix = config.prefix || ''
  const baseUrl = () => `${config.protocol}${config.host}${prefix}`
  const schemaMap = {}
  let cookie = null
  const headers = (extra = {}) => _.extend({}, authHeaders(auth), cookie ? { Cookie: cookie } : {}, extra)
  return (resource) => {
    return {
      /**
       * Opens a session with the credentials. A CMS without the JWT login answers without one: Basic is enough there.
       * @returns {Promise<boolean>} whether a session was opened
       */
      login: async () => {
        const response = await fetch(`${baseUrl()}/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(_.pick(auth, ['username', 'password']))
        })
        const cookies = _.isFunction(response.headers.getSetCookie) ? response.headers.getSetCookie() : []
        if (!response.ok || _.isEmpty(cookies)) {
          return false
        }
        cookie = _.map(cookies, item => item.split(';')[0]).join('; ')
        return true
      },
      create: async (item) => {
        const response = await fetch(`${baseUrl()}/api/${resource}`, {
          method: 'POST',
          headers: headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(item)
        })
        return response.json()
      },
      list: async (query) => {
        const response = await fetch(`${baseUrl()}/api/${resource}?query=${JSON.stringify(query) || ''}`, {
          headers: headers()
        })
        return response.json()
      },
      update: async (id, item) => {
        const response = await fetch(`${baseUrl()}/api/${resource}/${id}`, {
          method: 'PUT',
          headers: headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(item)
        })
        return response.json()
      },
      remove: async (id) => {
        const response = await fetch(`${baseUrl()}/api/${resource}/${id}`, {
          method: 'DELETE',
          headers: headers()
        })
        return response.json()
      },
      createAttachment: async (id, fieldname, filepath) => {
        let message
        message = `uploading ${path.relative(path.resolve('.'), path.normalize(filepath))} ... ....`
        logger.info(message)
        const formData = new FormData()
        // the built-in FormData takes a Blob, not a stream
        formData.append(fieldname, new Blob([await fs.readFile(filepath)]), path.basename(filepath))
        const response = await fetch(`${baseUrl()}/api/${resource}/${id}/attachments`, {
          method: 'POST',
          headers: headers(),
          body: formData
        })
        return response.json()
      },
      removeAttachment: async (id, aid) => {
        let message
        message = 'remove ' + aid + ' ... ....'
        logger.info(message)
        const response = await fetch(`${baseUrl()}/api/${resource}/${id}/attachments/${aid}`, {
          method: 'DELETE',
          headers: headers()
        })
        const body = await response.json()
        logger.info(message + 'done')
        return body
      },
      resources: async () => {
        const response = await fetch(`${baseUrl()}/admin/resources`, {
          headers: headers()
        })
        if (!response.ok) {
          throw new Error(`could not read the resources of ${baseUrl()}: ${response.status} ${response.statusText}`)
        }
        const resources = await response.json()
        _.each(resources, resource => {
          schemaMap[resource.name || resource.title] = resource.schema
        })
        return resources
      },
      getUniqueKeys () {
        const uniqueKeyField = _.filter(schemaMap[resource], item => item.unique || item.xlsxKey)
        if (_.isEmpty(uniqueKeyField)) {
          throw new Error(`${resource} didn't have unique key field`)
        }
        return _.map(uniqueKeyField, 'field')
      }
    }
  }
}

exports.authHeaders = authHeaders
