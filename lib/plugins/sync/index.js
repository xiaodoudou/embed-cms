const express = require('express')
const _ = require('lodash')
const pAll = require('p-all')
const logger = require('../../logger')
const stream = require('stream')
const bodyParser = require('body-parser')
const safeEqual = require('../../util/safeEqual')

const defaults = {
  mount: '/sync'
}

class SyncClass {
  constructor (cms, options) {
    this.cms = cms
    this.cms.$sync = this
    this.options = _.extend({}, defaults, options)
    this.config = this.options.sync || this.options
    this.api = this.cms.api()
    this.syncReport = {}
    // automatic push after a change: one timer per resource, and how long it waits for more changes
    this.triggerTimers = {}
    this.hookDelay = 5000
    this.initialize()
  }

  initialize() {
    // route handlers are passed around unbound and rely on `this`
    _.bindAll(this, [
      'requireUser', 'checkToken', 'checkTokenOrUser', 'checkResource', 'checkEnvironmentToken', 'onPostSyncResourceFromTo',
      'onGetSyncEnvironmentResourceStatus', 'onGetSyncEnvironmentResource', 'onGetSyncResourceAttachment',
      'onGetSyncResource', 'onGetSyncResourceStatus', 'onPutSyncResource'
    ])
    this.app = express()
    this.app.use(bodyParser.urlencoded({extended: true}))
    // proxy routes for the admin's Sync page: they use the stored tokens, so they need a logged-in user
    this.app.use('/:env(local|remote)/:resource([\\w-_]+)', this.requireUser, this.checkEnvironmentToken, this.checkResource)
    this.app.get('/:env(local|remote)/:resource([\\w-_]+)/status', this.onGetSyncEnvironmentResourceStatus)
    this.app.get('/:env(local|remote)/:resource([\\w-_]+)', this.onGetSyncEnvironmentResource)
    // deploy: the other CMS sends the token, the admin's Sync page a logged-in user
    this.app.post('/:resource([\\w-_]+)/from/:from(local|remote)/to/:to(local|remote)', this.checkTokenOrUser, this.checkResource, this.onPostSyncResourceFromTo)
    // the GET form is for the other CMS only: a session must not let a link or an image start a deploy
    this.app.get('/:resource([\\w-_]+)/from/:from(local|remote)/to/:to(local|remote)', this.checkToken, this.checkResource, this.onPostSyncResourceFromTo)
    this.app.use('/:resource([\\w-_]+)', this.checkToken, this.checkResource)
    this.app.get('/:resource([\\w-_]+)', this.onGetSyncResource)
    this.app.get('/:resource([\\w-_]+)/status', this.onGetSyncResourceStatus)
    this.app.put('/:resource([\\w-_]+)', this.onPutSyncResource)
    this.app.get('/:resource([\\w-_]+)/:id([\\w-_]+)/attachments/:aid([\\w-_]+)', this.onGetSyncResourceAttachment)
    this.app.use(this.onError.bind(this))
    this.initResource()
    // at bootstrap every resource is defined, including those created after the CMS
    this.cms.bootstrapFunctions = this.cms.bootstrapFunctions || []
    this.cms.bootstrapFunctions.push(async (callback) => {
      this.initHookAfter()
      callback()
    })
    this.cms._app.use(this.options.mount, this.app)
    return this
  }

  onError (error, req, res, next) {
    if (error) {
      if (this.config.debug) {
        logger.error('Error on:', error)
      }
      if (error && error.code && _.isNumber(error.code)) {
        return res.status(error.code).json({ error: error.message, source: error.source })
      }
      return res.status(500).json({ error: error.message || error, source: error.source })
    }
    next()
  }

  /**
   * Installs the after-change hooks on the resources this CMS may sync (`config.resources`). The hooks read the saved
   * `_sync` settings when they fire, so settings saved after start-up apply without a restart.
   */
  initHookAfter () {
    _.each(this.config.resources, resource => {
      if (!_.includes(this.cms._resourceNames, resource)) {
        // a name that is not a resource: api() would create an empty one
        logger.warn(`sync: resource ${resource} is not defined, no automatic push for it`)
        return
      }
      _.each(['create', 'update', 'remove', 'createAttachment', 'removeAttachment'], action => {
        this.api(resource).after(action, (context) => {
          this.onResourceChanged(resource).catch(error => logger.error('sync: automatic push failed:', error))
          return context.next()
        })
      })
    })
  }

  /**
   * After a change, asks the other CMS (`remote.url`) to pull the resource from this one, a few seconds later so a
   * burst of changes makes one call. Nothing happens unless the resource is selected in the settings and the other
   * CMS has an address, nor while a sync is writing the resource (that would echo its changes back).
   * @param {string} resource
   */
  async onResourceChanged (resource) {
    if (_.get(this.syncReport, [resource, 'status']) === 'syncing') {
      return
    }
    const syncConfig = await this.api('_sync').find({})
    const remote = _.get(syncConfig, 'remote', {})
    if (!_.includes(_.get(syncConfig, 'resources'), resource) || _.isEmpty(remote.url)) {
      return
    }
    const url = `${remote.url}/sync/${resource}/from/remote/to/local?token=${encodeURIComponent(remote.token || '')}`
    this.scheduleTrigger(resource, url)
  }

  /**
   * Calls `url` once, `hookDelay` ms after the last request for this resource.
   * @param {string} resource
   * @param {string} url
   */
  scheduleTrigger (resource, url) {
    clearTimeout(this.triggerTimers[resource])
    this.triggerTimers[resource] = setTimeout(async () => {
      delete this.triggerTimers[resource]
      try {
        logger.info('sync: asking the other CMS to pull', resource)
        const response = await fetch(url)
        const result = await response.json()
        if (!response.ok) {
          logger.error(`sync: the other CMS refused to pull ${resource}:`, response.status, result)
        } else {
          logger.info(result)
        }
      } catch (error) {
        logger.error(error)
      }
    }, this.hookDelay)
  }

  initResource () {
    this.cms.resource('_sync', {
      displayname: {
        enUS: 'Sync settings',
        zhCN: '同步设置'
      },
      group: {
        enUS: 'CMS',
        zhCN: '内容管理系统'
      },
      schema: [
        {
          field: 'allows',
          input: 'multiselect',
          source: [
            'read',
            'write'
          ],
          label: { enUS: 'What the other CMS may do here', zhCN: '对方 CMS 在此的权限' },
          options: { hint: { enUS: 'read: it can read the synced resources of this CMS. write: it can change them.', zhCN: 'read：可读取此 CMS 的同步资源。write：可修改它们。' } }
        },
        {
          field: 'local.token',
          input: 'string',
          label: { enUS: 'This CMS: token', zhCN: '本 CMS：令牌' },
          options: { hint: { enUS: 'The secret the other CMS must send to sync with this one. Required, or syncing with this CMS is refused.', zhCN: '对方 CMS 与本 CMS 同步时必须提供的密钥。必填，否则拒绝同步。' } }
        },
        {
          field: 'local.url',
          input: 'string',
          label: { enUS: 'This CMS: address', zhCN: '本 CMS：地址' },
          options: { hint: { enUS: 'The address the other CMS uses to reach this one, for example https://staging.example.com', zhCN: '对方 CMS 访问本 CMS 使用的地址，例如 https://staging.example.com' } }
        },
        {
          field: 'remote.token',
          input: 'string',
          label: { enUS: 'Other CMS: token', zhCN: '对方 CMS：令牌' },
          options: { hint: { enUS: 'The secret of the other CMS, sent with every request to it (its own "This CMS: token").', zhCN: '对方 CMS 的密钥，随每个请求发送（即对方的“本 CMS：令牌”）。' } }
        },
        {
          field: 'remote.url',
          input: 'string',
          label: { enUS: 'Other CMS: address', zhCN: '对方 CMS：地址' },
          options: { hint: { enUS: 'The address of the CMS to sync with, for example https://production.example.com', zhCN: '要同步的 CMS 的地址，例如 https://production.example.com' } }
        },
        {
          field: 'resources',
          input: 'multiselect',
          source: this.config.resources,
          label: { enUS: 'Resources to sync', zhCN: '要同步的资源' },
          options: { hint: { enUS: 'Only these resources are synced with the other CMS. The list is set in the configuration file cms.json, under "sync" > "resources" (or in the options given to the CMS at start), and can be edited on the Cms Config page.', zhCN: '只有这些资源会与对方 CMS 同步。该列表在配置文件 cms.json 的 "sync" > "resources" 中设置（或在启动 CMS 时传入的选项中），也可在 Cms Config 页面编辑。' } }
        }
      ],
      type: 'downstream',
      maxCount: 1
    })
  }

  /**
   * Lets through a user of the admin, authenticated the way the CMS is configured (session or JWT, or Basic when
   * the JWT login is disabled). With authentication disabled altogether, everyone is let through, as on the admin.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {Function} next
   */
  async requireUser (req, res, next) {
    try {
      const authentication = this.cms.$authentication
      if (!authentication || !_.isFunction(authentication.dispatchAuth)) {
        return next({ code: 401, message: 'authentication is not available' })
      }
      await authentication.dispatchAuth(req, res, next)
    } catch (error) {
      next(error)
    }
  }

  /**
   * With a token (server-to-server), checks it; without one, requires a user of the admin.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {Function} next
   */
  checkTokenOrUser (req, res, next) {
    const token = _.get(req, 'query.token') || _.get(req, 'body.token')
    if (!_.isEmpty(token)) {
      return this.checkToken(req, res, next)
    }
    return this.requireUser(req, res, next)
  }

  async checkToken (req, res, next) {
    try {
      const syncConfig = await this.api('_sync').find({})
      req.syncInfo = _.get(syncConfig, 'local')
      if (_.isEmpty(_.get(req, 'syncInfo.token'))) {
        return next({ code: 401, message: '_sync config local.token is not defined' })
      }
      req.syncInfo.allows = syncConfig.allows
      const token = req.query.token || _.get(req, 'body.token')
      if (!safeEqual(token, req.syncInfo.token)) {
        return next({ code: 401, message: 'token is not match' })
      }
      next()
    } catch (error) {
      next(error)
    }
  }

  assignObjectsValue (items, newItems, locales, field) {
    _.each(items, (item, idx) => {
      if (_.isArray(locales) && (field.localised === undefined || field.localised === true)) {
        _.each(locales, locale => {
          let value = _.get(item, `${field.field}.${locale}`)
          if (!_.isUndefined(value) && !_.isNull(value)) {
            _.set(newItems, `${idx}.${field.field}.${locale}`, value)
          }
        })
      } else {
        let value = _.get(item, field.field)
        if (!_.isUndefined(value) && !_.isNull(value)) {
          _.set(newItems, `${idx}.${field.field}`, value)
        }
      }
    })
  }

  async getSyncResourceItems (req, resource) {
    if (_.isEmpty(_.get(req, 'syncInfo.url'))) {
      throw new Error('_sync config local.url is not defined')
    }
    const api = this.api(resource)
    if (!api) {
      throw new Error(`resource ${resource} not exists`)
    }
    let items = await api.list()
    items = _.map(items, item => _.omitBy(item, (value, key) => {
      return !_.includes(['_id', '_attachments'], key) ? _.startsWith(key, '_') : false
    }))
    let newItems = []
    await pAll(_.map(api.options.schema, field => {
      return async () => {
        if (_.includes(['select', 'multiselect'], field.input)) {
          if (!_.isString(field.source)) {
            this.assignObjectsValue(items, newItems, api.options.locales, field)
            return
          }
          const relations = await this.api(field.source).list()
          const relationUniqueKeys = this.api(field.source).getUniqueKeys()
          const relationUniqueKey = _.first(relationUniqueKeys)
          if (field.input === 'select') {
            _.each(items, (item, idx) => {
              let value = _.get(item, field.field)
              const relatedItem = _.find(relations, {_id: value})
              value = relatedItem && (relatedItem[relationUniqueKey])
              _.set(newItems, `${idx}.${field.field}`, value)
            })
          } else if (field.input === 'multiselect') {
            _.each(items, (item, idx) => {
              let value = _.get(item, field.field)
              value = _.map(value, id => {
                const relatedItem = _.find(relations, {_id: id})
                return relatedItem && relatedItem[relationUniqueKey]
              })
              _.set(newItems, `${idx}.${field.field}`, value)
            })
          }
        } else if  (_.includes(['image', 'file'], field.input)) {
          _.each(items, (item, idx) => {
            _.set(newItems, `${idx}._attachments`, _.get(newItems, `${idx}._attachments`, []))
            _.each(_.filter(item._attachments, {_name: field.field}), attach => {
              let url = `${req.syncInfo.url}/sync/${req.params.resource}/${item._id}/attachments/${attach._id}?token=${req.syncInfo.token}`
              attach = _.pick(attach, ['_contentType', '_name', '_md5sum', '_filename', '_fields'])
              attach.url = url
              _.get(newItems, `${idx}._attachments`).push(attach)
            })
          })
        } else {
          this.assignObjectsValue(items, newItems, api.options.locales, field)
        }
      }
    }), {concurrency: 1})
    items = newItems
    items = _.map(items, item => _.omitBy(item, (value, key) => _.startsWith(key, '_') && key !== '_attachments'))
    if (resource === 'markets') {
      items = _.map(items, item => {
        item = _.omit(item, ['app', 'revision'])
        if (item.modules) {
          delete item.modules.fpsMeter
          delete item.modules.fileExplorer
        }
        return item
      })
    }
    return items
  }

  async checkEnvironmentToken (req, res, next) {
    try {
      const syncConfig = await this.api('_sync').find({})
      const syncInfo = _.get(syncConfig, req.params.env, {})
      if (_.isEmpty(syncInfo.token)) {
        throw new Error(`_sync config ${req.params.env}.token is not defined`)
      }
      if (_.isEmpty(syncInfo.url)) {
        throw new Error(`_sync config ${req.params.env}.url is not defined`)
      }
      req.syncInfo = syncInfo
      next()
    } catch (error) {
      next(error)
    }
  }

  async onPostSyncResourceFromTo (req, res, next) {
    try {
      const syncConfig = await this.api('_sync').find({})
      _.each(['remote.token', 'remote.url'], key => {
        if (_.isEmpty(_.get(syncConfig, key))) {
          throw new Error(`_sync config ${key} is not defined`)
        }
      })
      let url, items
      const fromConfig = syncConfig[req.params.from]
      url = `${fromConfig.url}/sync/${req.params.resource}?token=${fromConfig.token}`
      try {
        const response = await fetch(url)
        items = await response.json()
      } catch (error) {
        throw _.get(error, 'response.body.error', error)
      }
      const toConfig = syncConfig[req.params.to]
      url = `${toConfig.url}/sync/${req.params.resource}?token=${toConfig.token}`
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(items)
        })
        await response.json()
      } catch (error) {
        throw _.get(error, 'response.body.error', error)
      }
      res.send({message: 'done'})
    } catch (error) {
      next(error)
    }
  }

  async onGetSyncEnvironmentResourceStatus (req, res, next) {
    try {
      const response = await fetch(`${req.syncInfo.url}/sync/${req.params.resource}/status?token=${req.syncInfo.token}`)
      res.send(await response.json())
    } catch (error) {
      next(error)
    }
  }
  async onGetSyncEnvironmentResource (req, res, next) {
    try {
      const response = await fetch(`${req.syncInfo.url}/sync/${req.params.resource}?token=${req.syncInfo.token}`)
      res.send(await response.json())
    } catch (error) {
      next(error)
    }
  }

  async onGetSyncResourceAttachment (req, res, next) {
    try {
      if (!_.includes(req.syncInfo.allows, 'read')) {
        throw Object.assign(new Error('read data is not allowed'), { code: 403 })
      }
      let result = await this.api(req.params.resource).findAttachment(req.params.id, req.params.aid)
      res.type(result._contentType)
      res.write('', 'binary')
      result.stream.pipe(res, { end: true })
    } catch (error) {
      next(error)
    }
  }

  async onGetSyncResource (req, res, next) {
    try {
      if (!_.includes(req.syncInfo.allows, 'read')) {
        throw Object.assign(new Error('read data is not allowed'), { code: 403 })
      }
      const resource = req.params.resource
      const items = await this.getSyncResourceItems(req, resource)
      res.send(items)
    } catch (error) {
      next(error)
    }
  }

  async onGetSyncResourceStatus (req, res, next) {
    try {
      const result = _.get(this.syncReport, req.params.resource) || {status: 'done'}
      try {
        const syncConfig = await this.api('_sync').find({})
        result.allows = syncConfig.allows
      } catch {
      }
      res.send(result)
    } catch (error) {
      next(error)
    }
  }

  async checkResource (req, res, next) {
    try {
      const resource = req.params.resource
      if (!_.includes(this.config.resources, resource)) {
        throw new Error(`${resource} is not defined in config.resources`)
      }
      this.api(resource).getUniqueKeys()
      next()
    } catch (error) {
      next(error)
    }
  }

  async onPutSyncResource (req, res, next) {
    try {
      if (!_.includes(req.syncInfo.allows, 'write')) {
        throw Object.assign(new Error('write data is not allowed'), { code: 403 })
      }
      const resource = req.params.resource
      const api = this.api(resource)
      if (!api) {
        throw new Error(`resource ${resource} not exists`)
      }
      if (_.get(this.syncReport, `${resource}.status`) === 'syncing') {
        throw new Error(`resource ${resource} is syncing now`)
      }
      // answered right away; the outcome is in the status (GET /sync/:resource/status)
      this.startSyncData(req, resource).catch(error => {
        logger.error(`sync of ${resource} failed:`, error)
      })
      res.send({message: 'done'})
    } catch (error) {
      next(error)
    }
  }

  async getNormalizedRecords (resource, relationMap) {
    let schema = this.api(resource).options.schema
    let list = await this.api(resource).list()
    list = _.map(list, item => {
      _.each(schema, field => {
        let value = _.get(item, field.field)
        if (!_.isUndefined(value)) {
          if (_.isString(field.source)) {
            const relationList = relationMap[field.source]
            const uniqueKeys = this.api(field.source).getUniqueKeys()
            const uniqueKey = _.first(uniqueKeys)
            const item = _.find(relationList, {_id: value})
            value = item && item[uniqueKey]
          }
          _.set(item, field.field, value)
        }
      })
      return item
    })
    return list
  }

  async getRelationMap (resource) {
    let schema = this.api(resource).options.schema
    const relationMap = {}
    const relationResources = _.uniq(_.compact(_.map(schema, item => _.isString(item.source) && item.source)))
    await pAll(_.map(relationResources, resource => {
      return async () => {
        relationMap[resource] = await this.api(resource).list()
      }
    }), {concurrency: 1})
    return relationMap
  }

  async startSyncData (req, resource, options) {
    try {
      let {skipRemoveRecord} = options || {}
      _.set(this.syncReport, resource, {
        resource: resource,
        status: 'syncing',
        startedAt: Date.now(),
        removed: 0,
        updated: 0,
        created: 0,
        progress: []
      })
      const api = this.api(resource)
      const uniqueKeys = this.api(resource).getUniqueKeys()
      let localItems = await api.list()
      let remoteItems = req.body
      const relationMap = await this.getRelationMap(resource)
      const normalizedRecords = await this.getNormalizedRecords(resource, relationMap)
      let removeItems = []
      if (resource !== 'markets') {
        removeItems = _.filter(normalizedRecords, item => !_.find(remoteItems, _.pick(item, uniqueKeys)))
      }
      _.set(this.syncReport, `${resource}.createTotal`, 0)
      _.set(this.syncReport, `${resource}.updateTotal`, remoteItems.length)
      _.set(this.syncReport, `${resource}.removeTotal`, removeItems.length)
      const fromData = remoteItems
      const toData = await this.getSyncResourceItems(req, resource)
      const fromKeys = _.map(fromData, item => _.pick(item, uniqueKeys))
      const toKeys = _.map(toData, item => _.pick(item, uniqueKeys))
      let createKeys = _.filter(fromKeys, query => !_.find(toKeys, query))
      let updateKeys = _.filter(fromKeys, query => _.find(toKeys, query))
      updateKeys = _.filter(updateKeys, key => {
        let fromItem = _.find(fromData, key)
        let toItem = _.find(toData, key)
        fromItem = _.cloneDeep(fromItem)
        toItem = _.cloneDeep(toItem)
        fromItem._attachments = _.map(fromItem._attachments, item => _.omit(item, ['url']))
        toItem._attachments = _.map(toItem._attachments, item => _.omit(item, ['url']))
        return !_.isEqual(fromItem, toItem)
      })
      const createItems = _.filter(remoteItems, item => _.find(createKeys, _.pick(item, uniqueKeys)))
      const updateItems = _.filter(remoteItems, item => _.find(updateKeys, _.pick(item, uniqueKeys)))
      const createAndUpdateItems = _.union(createItems, updateItems)
      // update number of record needed to be update
      _.set(this.syncReport, `${resource}.updateTotal`, updateItems.length)
      _.set(this.syncReport, `${resource}.createTotal`, createItems.length)
      //  convert data
      await pAll(_.map(api.options.schema, field => {
        return async () => {
          if (_.includes(['select', 'multiselect'], field.input) && _.isString(field.source)) {
            const relations = await this.api(field.source).list()
            const relationUniqueKey = this.api(field.source).getUniqueKeys()
            if (field.input === 'select') {
              _.each(createAndUpdateItems, item => {
                let value = _.get(item, field.field)
                const relatedItem = _.find(relations, {[relationUniqueKey]: value})
                value = relatedItem && relatedItem._id
                _.set(item, field.field, value)
              })
            } else if (field.input === 'multiselect') {
              _.each(createAndUpdateItems, item => {
                let value = _.get(item, field.field)
                value = _.map(value, key => {
                  const relatedItem = _.find(relations, {[relationUniqueKey]: key})
                  return relatedItem && relatedItem._id
                })
                _.set(item, field.field, value)
              })
            }
          }
        }
      }), {concurrency: 1})
      this.syncReport[resource].progress.push('convert data')
      await pAll(_.map(createAndUpdateItems, item => {
        return async () => {
          let localItem = _.find(localItems, _.pick(item, uniqueKeys))
          const remoteAttachments = _.groupBy(item._attachments, '_name')
          delete item._attachments
          if (localItem) {
            let pickItem = _.omit(item, [...uniqueKeys, '_id'])
            let keys = _.keys(pickItem)
            let pickedLocalItem = _.pick(localItem, keys)
            if (resource === 'markets') {
              delete pickedLocalItem.revision
              if (pickedLocalItem.modules) {
                delete pickedLocalItem.modules.fpsMeter
                delete pickedLocalItem.modules.fileExplorer
              }
            }
            localItem = await this.api(resource).update(localItem._id, pickItem)
          } else {
            localItem = await this.api(resource).create(item)
          }
          // handle attachment
          const localAttachments = _.groupBy(localItem._attachments, '_name')
          // remove all
          await pAll(_.map(remoteAttachments, (remoteList, name) => {
            return async () => {
              const localList = localAttachments[name] || []
              if (_.map(localList, '_md5sum').join(',') !== _.map(remoteList, '_md5sum').join(',')) {
                logger.info(`all attachments (${localList.length}) in ${resource} ${localItem._id} removed`)
                await pAll(_.map(localList, attach => {
                  return async () => await this.api(resource).removeAttachment(localItem._id, attach._id)
                }), {concurrency: 1})
                await pAll(_.map(remoteList, attach => {
                  return async () => {
                    try {
                      const response = await fetch(attach.url)
                      const buffer = await response.arrayBuffer()
                      let file = new stream.Readable()
                      file.push(Buffer.from(buffer))
                      file.push(null)
                      const params = {
                        contentType: attach._contentType,
                        filename: attach._filename,
                        name: attach._name,
                        stream: file,
                        fields: attach._fields
                      }
                      await this.api(resource).createAttachment(localItem._id, params)
                    } catch {
                      logger.error(`fail to download ${attach.url}`)
                    }
                  }
                }), {concurrency: 1})
              }
            }
          }))
          if (_.find(createItems, _.pick(item, uniqueKeys))) {
            this.syncReport[resource].created += 1
          } else {
            this.syncReport[resource].updated += 1
          }
        }
      }), {concurrency: 1})
      this.syncReport[resource].progress.push('create and update')
      if (!skipRemoveRecord) {
        await pAll(_.map(removeItems, item => {
          return async () => {
            await this.api(resource).remove(item._id)
            this.syncReport[resource].removed += 1
          }
        }), {concurrency: 1})
      }
      this.syncReport[resource].progress.push('remove')
      _.set(this.syncReport, `${resource}.status`, 'done')
      _.set(this.syncReport, `${resource}.stopAt`, Date.now())
    } catch (error) {
      _.set(this.syncReport, `${resource}.status`, 'error')
      // an Error serialises to {}: keep its message for the status route
      _.set(this.syncReport, `${resource}.error`, _.get(error, 'message') || _.toString(error))
      _.set(this.syncReport, `${resource}.stopAt`, Date.now())
      throw error
    }
    logger.info('startSyncData ... ... done')
  }

  express () {
    return this.app
  }
}

exports = module.exports = SyncClass

