const express = require('express')
const _ = require('lodash')
const pAll = require('p-all')
const logger = require('../../logger')
const { isAttachmentInput } = require('../../util/inputTypes')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const bodyParser = require('body-parser')
const safeEqual = require('../../util/safeEqual')
const { SyncRunner } = require('./runner')

// what of an attachment goes to the other CMS (the file itself is downloaded from its url)
const ATTACHMENT_KEYS = ['_contentType', '_name', '_md5sum', '_filename', '_fields', '_payload', 'cropOptions', 'order']

// a value as text, whatever the order of its keys, to tell whether two are the same
const stable = value => JSON.stringify(value, (key, one) => (_.isPlainObject(one) ? _(one).toPairs().sortBy(0).fromPairs().value() : one))
// the value without the keys that hold nothing, at any depth
const withoutNil = value => (_.isPlainObject(value) ? _.omitBy(_.mapValues(value, withoutNil), _.isNil) : value)

// A record id written in a text (a link in a rich text, an id in a JSON value) means nothing on the other CMS, where the record has
// another id. In transit it is written as cms-ref://<resource>/<unique value, escaped> and turned back into the id of the record that
// has that unique value on the receiving CMS.
const ID_PATTERN = /(?<![0-9a-z])[0-9a-z]{24}(?![0-9a-z])/g
const REF_PATTERN = /cms-ref:\/\/([\w-]+)\/([\w%-]*)/g
const REF_PREFIX = 'cms-ref://'
/**
 * @param {string} value
 * @returns {string} the value escaped for a reference: encodeURIComponent, with the characters it leaves alone escaped too
 */
const escapeRef = value => encodeURIComponent(value).replace(/[.!~*'()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)

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
    // runs the syncs of all the resources on demand, from code, the admin, the command line and the schedule
    this.runner = new SyncRunner(this)
    this.initialize()
  }

  /** Binds the handlers, mounts the routes and the `_sync` resource, hooks the automatic push on the resources, starts the runner and its schedule. */
  initialize() {
    // route handlers are passed around unbound and rely on `this`
    _.bindAll(this, [
      'requireUser', 'checkToken', 'checkTokenOrUser', 'checkResource', 'checkEnvironmentToken', 'onPostSyncResourceFromTo',
      'onGetSyncEnvironmentResourceStatus', 'onGetSyncEnvironmentResource', 'onGetSyncResourceAttachment',
      'onGetSyncResource', 'onGetSyncResourceStatus', 'onPutSyncResource', 'onGetSyncedResources', 'onGetRuns', 'onPostRun'
    ])
    this.app = express()
    this.app.use(bodyParser.urlencoded({extended: true}))
    // the resources this CMS may sync, for the admin's Sync page (before the routes that take a resource name: this one is not a resource)
    this.app.get('/resources', this.requireUser, this.onGetSyncedResources)
    // run the syncs of all the resources, and see how it went (a token, or a logged-in person)
    this.app.get('/runs', this.checkTokenOrUser, this.onGetRuns)
    this.app.post('/run/:direction(push|pull)', this.checkTokenOrUser, this.onPostRun)
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
    // a schedule that is not valid stops the start-up: better than a sync that never runs
    this.runner.configureSchedule()
    // at bootstrap every resource is defined, including those created after the CMS
    this.cms.bootstrapFunctions = this.cms.bootstrapFunctions || []
    this.cms.bootstrapFunctions.push(async (callback) => {
      this.initHookAfter()
      this.runner.startSchedule()
      callback()
    })
    this.cms._app.use(this.options.mount, this.app)
    return this
  }

  /** Error handler of the routes: an error with a code answers that status with its message. */
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
   * The resources this CMS may sync: the ones chosen in the Sync settings, and when none is chosen the ones the configuration lists
   * (`sync.resources` in cms.json). Read each time, so a change of the settings applies without a restart.
   * @param {object} [settings] the Sync settings record, when the caller has read it already
   * @returns {Promise<string[]>}
   */
  async syncedResources (settings) {
    const record = settings === undefined ? await this.api('_sync').find({}) : settings
    const chosen = _.get(record, 'resources')
    return _.isEmpty(chosen) ? _.get(this.config, 'resources', []) : chosen
  }

  /**
   * Whether a name is a resource of this CMS that can be synced: not a system resource (`_users`, `_sync`...).
   * @param {string} name
   * @returns {boolean}
   */
  isSyncable (name) {
    return _.isString(name) && !name.startsWith('_') && _.includes(this.cms._resourceNames, name)
  }

  /** GET /sync/resources: the names of the resources this server may sync. */
  async onGetSyncedResources (req, res, next) {
    try {
      res.json(await this.syncedResources())
    } catch (error) {
      next(error)
    }
  }

  /**
   * Refuses Sync settings that choose a name which is not a resource of this CMS (a typo): it could never be synced.
   * @param {object} context hook context of `create` and `update` of `_sync`
   */
  validateSettings (context) {
    const chosen = _.get(context, 'params.object.resources')
    const unknown = _.isArray(chosen) ? _.reject(chosen, name => this.isSyncable(name)) : []
    if (unknown.length > 0) {
      return context.error({ code: 400, message: `Not resources of this CMS: ${unknown.join(', ')}` })
    }
    return context.next()
  }

  /**
   * Installs the after-change hooks on every resource: each one asks, when it fires, whether the resource is among the ones to sync
   * (see syncedResources), so the choice made in the settings applies without a restart.
   */
  initHookAfter () {
    _.each(this.cms._resourceNames, resource => {
      if (resource.startsWith('_')) {
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
    if (_.isEmpty(remote.url) || !_.includes(await this.syncedResources(syncConfig), resource)) {
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

  /** Declares the `_sync` resource (the pairing: tokens, addresses, rights, resources to sync), validated before it is saved. */
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
      // the titles of the groups the dotted fields (local.token, remote.url...) make in the form
      groups: {
        local: { label: { enUS: 'This CMS', zhCN: '本 CMS' } },
        remote: { label: { enUS: 'The other CMS', zhCN: '对方 CMS' } }
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
          label: { enUS: 'Token', zhCN: '令牌' },
          options: { hint: { enUS: 'The secret the other CMS must send to sync with this one. Required, or syncing with this CMS is refused.', zhCN: '对方 CMS 与本 CMS 同步时必须提供的密钥。必填，否则拒绝同步。' } }
        },
        {
          field: 'local.url',
          input: 'string',
          label: { enUS: 'Address', zhCN: '地址' },
          options: { hint: { enUS: 'The address the other CMS uses to reach this one, for example https://staging.example.com', zhCN: '对方 CMS 访问本 CMS 使用的地址，例如 https://staging.example.com' } }
        },
        {
          field: 'remote.token',
          input: 'string',
          label: { enUS: 'Token', zhCN: '令牌' },
          options: { hint: { enUS: 'The secret of the other CMS, sent with every request to it. It is the Token under "This CMS" in its own Sync settings.', zhCN: '对方 CMS 的密钥，随每个请求发送。即对方自己的同步设置中“本 CMS”下的令牌。' } }
        },
        {
          field: 'remote.url',
          input: 'string',
          label: { enUS: 'Address', zhCN: '地址' },
          options: { hint: { enUS: 'The address of the CMS to sync with, for example https://production.example.com', zhCN: '要同步的 CMS 的地址，例如 https://production.example.com' } }
        },
        {
          field: 'resources',
          input: 'pillbox',
          label: { enUS: 'Resources to sync', zhCN: '要同步的资源' },
          options: {
            // the drop-down lists the resources of this CMS; a name can be typed too, and one that is not a resource is refused
            suggest: 'resources',
            hint: {
              enUS: 'The resources to sync with the other CMS. Pick them from the list, or type a name and press Enter. Leave it empty to use the list in cms.json ("sync" > "resources").',
              zhCN: '要与对方 CMS 同步的资源。从列表中选择，或输入名称后按回车。留空则使用 cms.json 中 "sync" > "resources" 的列表。'
            }
          }
        }
      ],
      type: 'downstream',
      maxCount: 1
    })
    // a name that is not a resource could never be synced: refused when the settings are saved
    this.api('_sync').before('create', (context) => this.validateSettings(context))
    this.api('_sync').before('update', (context) => this.validateSettings(context))
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

  /** Middleware of the routes the other server calls: the token of the request has to be this server's (Token under This CMS); else 401. */
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

  /**
   * The records the relations (select, multiselect) of the blocks of the paragraph fields of a schema point to, with the unique key of
   * their resource, looking into the paragraphs inside the blocks too.
   * @returns {Promise<Object>} the resource name -> { list, key }
   */
  async getBlockRelations (schema) {
    const sources = new Set()
    const seen = new Set()
    const visit = fields => {
      _.each(fields, field => {
        if (field.input === 'paragraph') {
          _.each(_.get(field, 'options.types'), type => {
            if (!seen.has(type)) {
              seen.add(type)
              const blockFields = _.get(this.cms._paragraphs, `${type}.schema`, [])
              _.each(blockFields, blockField => {
                if (_.includes(['select', 'multiselect'], blockField.input) && _.isString(blockField.source)) {
                  sources.add(blockField.source)
                }
              })
              visit(blockFields)
            }
          })
        }
      })
    }
    visit(schema)
    const relations = {}
    await pAll(_.map([...sources], source => async () => {
      relations[source] = { list: await this.api(source).list(), key: _.first(this.api(source).getUniqueKeys()) }
    }), {concurrency: 1})
    return relations
  }

  /**
   * Turns the relations of the blocks of a paragraph field, and of the paragraphs inside them: the id of the record they point to
   * becomes its unique value on the way out, and the other way on the way in.
   * @param {Array|Object} blocks the value of the field: an array, or one array per language
   * @param {Object} relations what getBlockRelations answered
   * @param {'export'|'import'} way
   */
  mapParagraphField (blocks, relations, way) {
    if (_.isArray(blocks)) {
      return _.map(blocks, block => this.mapBlock(block, relations, way))
    }
    return _.isPlainObject(blocks) ? _.mapValues(blocks, value => this.mapParagraphField(value, relations, way)) : blocks
  }

  /**
   * @param {object} block
   * @param {Object<string, {list: object[], key: string}>} relations see getBlockRelations
   * @param {'export'|'import'} way
   * @returns {object} the block with its relations converted (see mapParagraphField), the paragraph fields inside it included
   */
  mapBlock (block, relations, way) {
    if (!_.isPlainObject(block)) {
      return block
    }
    const mapped = {...block}
    const convert = (source, value) => {
      const { list, key } = relations[source]
      const found = way === 'export' ? _.find(list, {_id: value}) : _.find(list, {[key]: value})
      return found && (way === 'export' ? found[key] : found._id)
    }
    _.each(_.get(this.cms._paragraphs, `${block._type}.schema`, []), field => {
      const value = block[field.field]
      if (_.isUndefined(value) || _.isNull(value)) {
        return
      }
      if (field.input === 'paragraph') {
        mapped[field.field] = this.mapParagraphField(value, relations, way)
      } else if (field.input === 'select' && _.isString(field.source)) {
        mapped[field.field] = convert(field.source, value)
      } else if (field.input === 'multiselect' && _.isString(field.source)) {
        mapped[field.field] = _.map(value, one => convert(field.source, one))
      }
    })
    return mapped
  }

  /**
   * Applies `change` to every text of a value (the texts inside objects and arrays too), leaving the attachments alone.
   * @param {*} value
   * @param {function(string): Promise<string>} change
   */
  async mapTexts (value, change) {
    if (_.isString(value)) {
      return change(value)
    }
    if (_.isArray(value)) {
      return pAll(_.map(value, one => () => this.mapTexts(one, change)), {concurrency: 1})
    }
    if (_.isPlainObject(value)) {
      const mapped = {}
      for (const [key, one] of _.toPairs(value)) {
        mapped[key] = key === '_attachments' ? one : await this.mapTexts(one, change)
      }
      return mapped
    }
    return value
  }

  /** Looks the records of this CMS up by their id, once, when a text first needs it: id -> { resource, value of its unique key } */
  recordIndex () {
    let built
    return () => {
      built = built || (async () => {
        const index = new Map()
        for (const name of _.filter(this.cms._resourceNames, one => !_.startsWith(one, '_'))) {
          let key
          try {
            key = _.first(this.api(name).getUniqueKeys())
          } catch {
            continue
          }
          for (const record of await this.api(name).list()) {
            const value = _.get(record, key)
            if (_.isString(value) || _.isNumber(value)) {
              index.set(record._id, {resource: name, value: String(value)})
            }
          }
        }
        return index
      })()
      return built
    }
  }

  /** The ids of records in a text become references (cms-ref://tags/red), when the record has a unique value to be told by */
  async idsToRefs (text, getIndex) {
    const candidates = _.uniq(text.match(ID_PATTERN) || [])
    if (candidates.length === 0) {
      return text
    }
    const index = await getIndex()
    return text.replace(ID_PATTERN, id => {
      const found = index.get(id)
      return found ? `${REF_PREFIX}${found.resource}/${escapeRef(found.value)}` : id
    })
  }

  /**
   * The references in a text become the ids of the records of this CMS that have those unique values. A reference to a record this CMS
   * does not have (yet) is left as it is, and said in `missing`.
   */
  async refsToIds (text, getIndex, missing) {
    if (!_.includes(text, REF_PREFIX)) {
      return text
    }
    const index = await getIndex()
    return text.replace(REF_PATTERN, (whole, resource, escaped) => {
      let value
      try {
        value = decodeURIComponent(escaped)
      } catch {
        return whole
      }
      const found = _.find([...index.entries()], ([, record]) => record.resource === resource && record.value === value)
      if (!found) {
        missing.push(whole)
        return whole
      }
      return found[0]
    })
  }

  /**
   * Copies a field from the records to the export, per language when the field is localised, leaving out what is not set.
   * @param {object[]} items the records
   * @param {object[]} newItems the export, filled in place
   * @param {string[]|undefined} locales
   * @param {object} field
   */
  copyFieldValues (items, newItems, locales, field) {
    _.each(items, (item, idx) => {
      if (_.isArray(locales) && (field.localised === undefined || field.localised === true)) {
        _.each(locales, locale => {
          const value = _.get(item, `${field.field}.${locale}`)
          if (!_.isUndefined(value) && !_.isNull(value)) {
            _.set(newItems, `${idx}.${field.field}.${locale}`, value)
          }
        })
      } else {
        const value = _.get(item, field.field)
        if (!_.isUndefined(value) && !_.isNull(value)) {
          _.set(newItems, `${idx}.${field.field}`, value)
        }
      }
    })
  }

  /**
   * @param {object} req with `syncInfo`, the settings of this server
   * @param {string} resource
   * @returns {Promise<object[]>} the export: the records without their internal fields, the relations as unique values, the attachments as download links, the record ids written in texts as references
   */
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
    const newItems = []
    const blockRelations = await this.getBlockRelations(api.options.schema)
    await pAll(_.map(api.options.schema, field => {
      return async () => {
        if (_.includes(['select', 'multiselect'], field.input)) {
          if (!_.isString(field.source)) {
            this.copyFieldValues(items, newItems, api.options.locales, field)
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
        } else if ((isAttachmentInput(field.input) || field.input === 'paragraph')) {
          if (field.input === 'paragraph') {
            // the relations of the blocks are said by the unique value of the record they point to, as the ones of the fields are
            this.copyFieldValues(items, newItems, api.options.locales, field)
            _.each(newItems, newItem => {
              const blocks = _.get(newItem, field.field)
              if (!_.isUndefined(blocks)) {
                _.set(newItem, field.field, this.mapParagraphField(blocks, blockRelations, 'export'))
              }
            })
          }
          // the files of a field are named by it; the ones of the blocks of a paragraph field by their path (content.0.picture)
          const ofField = field.input === 'paragraph' ? attach => _.startsWith(attach._name, `${field.field}.`) : {_name: field.field}
          _.each(items, (item, idx) => {
            _.set(newItems, `${idx}._attachments`, _.get(newItems, `${idx}._attachments`, []))
            _.each(_.filter(item._attachments, ofField), attach => {
              const url = `${req.syncInfo.url}/sync/${req.params.resource}/${item._id}/attachments/${attach._id}?token=${req.syncInfo.token}`
              attach = _.pick(attach, ATTACHMENT_KEYS)
              attach.url = url
              _.get(newItems, `${idx}._attachments`).push(attach)
            })
          })
        } else {
          this.copyFieldValues(items, newItems, api.options.locales, field)
        }
      }
    }), {concurrency: 1})
    items = newItems
    items = _.map(items, item => _.omitBy(item, (value, key) => _.startsWith(key, '_') && key !== '_attachments'))
    const getIndex = this.recordIndex()
    return this.mapTexts(items, text => this.idsToRefs(text, getIndex))
  }

  /** Middleware of the routes the admin calls for a side (`:env`, local or remote): the settings of that side go on the request; they need a token and an address. */
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

  /** POST /sync/:resource/from/:from/to/:to: syncs one resource one way, answers when it is done. */
  async onPostSyncResourceFromTo (req, res, next) {
    try {
      await this.runner.transfer(req.params.resource, req.params.from, req.params.to)
      res.send({message: 'done'})
    } catch (error) {
      next(error)
    }
  }

  /**
   * Syncs one resource now, and answers how it went when the other CMS has finished with it. Only one run goes on at a time
   * (a second one is refused with code 409), and the resource has to be among the resources to sync.
   * @param {string} resource
   * @param {'push'|'pull'} direction push: this CMS writes to the other one. pull: the other CMS writes here.
   * @returns {Promise<{resource: string, status: 'done'|'error', created?: number, updated?: number, removed?: number, error?: string}>}
   */
  async run (resource, direction) {
    const run = await this.runner.run(direction, { resources: [resource], trigger: 'api' })
    return run.results[0]
  }

  /**
   * Syncs the resources to sync, one after the other, and answers when they are all done. One that fails does not stop the others.
   * @param {'push'|'pull'} direction
   * @param {object} [options]
   * @param {string[]} [options.resources] only these (they have to be among the resources to sync)
   * @returns {Promise<{direction: string, status: 'done'|'error', startedAt: number, finishedAt: number, resources: string[], results: object[]}>}
   */
  async runAll (direction, options) {
    return this.runner.run(direction, { trigger: 'api', ...options })
  }

  /** What is going on, what happened last, and what is scheduled (GET /sync/runs) */
  async onGetRuns (req, res, next) {
    try {
      res.json(this.runner.state())
    } catch (error) {
      next(error)
    }
  }

  /**
   * Starts a run of all the resources to sync, or of the ones named in `?resources=a,b`, and answers at once: how it goes is in
   * GET /sync/runs.
   */
  async onPostRun (req, res, next) {
    try {
      const named = _.get(req, 'query.resources') || _.get(req, 'body.resources')
      const resources = _.isArray(named) ? named : _.compact(_.map(_.split(named || '', ','), _.trim))
      const run = await this.runner.prepare(req.params.direction, { resources, trigger: 'manual' })
      this.runner.execute(run).catch(error => logger.error('sync: the run failed:', error))
      res.status(202).json({ started: true, direction: run.direction, startedAt: run.startedAt, resources: run.resources })
    } catch (error) {
      next(error)
    }
  }

  /** GET /sync/:env/:resource/status: the status of the last sync of a resource on a side. */
  async onGetSyncEnvironmentResourceStatus (req, res, next) {
    try {
      const response = await fetch(`${req.syncInfo.url}/sync/${req.params.resource}/status?token=${req.syncInfo.token}`)
      res.send(await response.json())
    } catch (error) {
      next(error)
    }
  }
  /** GET /sync/:env/:resource: the export of a resource of a side, for the Sync page to compare. */
  async onGetSyncEnvironmentResource (req, res, next) {
    try {
      const response = await fetch(`${req.syncInfo.url}/sync/${req.params.resource}?token=${req.syncInfo.token}`)
      res.send(await response.json())
    } catch (error) {
      next(error)
    }
  }

  /** GET /sync/:resource/:id/attachments/:aid: a file, for the other server (needs `read`). */
  async onGetSyncResourceAttachment (req, res, next) {
    try {
      if (!_.includes(req.syncInfo.allows, 'read')) {
        throw Object.assign(new Error('read data is not allowed'), { code: 403 })
      }
      const result = await this.api(req.params.resource).findAttachment(req.params.id, req.params.aid)
      res.type(result._contentType)
      res.write('', 'binary')
      result.stream.pipe(res, { end: true })
    } catch (error) {
      next(error)
    }
  }

  /** GET /sync/:resource: the export of a resource (needs `read`). */
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

  /** GET /sync/:resource/status: the report of the last sync here, with what this server allows. */
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

  /** Middleware: the resource has to be one to sync, with a unique key. */
  async checkResource (req, res, next) {
    try {
      const resource = req.params.resource
      if (!_.includes(await this.syncedResources(), resource)) {
        throw new Error(`${resource} is not among the resources to sync (choose it in the Sync settings)`)
      }
      this.api(resource).getUniqueKeys()
      next()
    } catch (error) {
      next(error)
    }
  }

  /** PUT /sync/:resource: makes the records match the export in the body (needs `write`). Answers at once; the outcome is in the status. */
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

  /**
   * @param {string} resource
   * @param {Object<string, object[]>} relationMap see getRelationMap
   * @returns {Promise<object[]>} the records with their relations as the unique values of the records they point to, comparable with an export
   */
  async getNormalizedRecords (resource, relationMap) {
    const schema = this.api(resource).options.schema
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

  /**
   * @param {string} resource
   * @returns {Promise<Object<string, object[]>>} the records of each resource the relations of the resource point to, by name
   */
  async getRelationMap (resource) {
    const schema = this.api(resource).options.schema
    const relationMap = {}
    const relationResources = _.uniq(_.compact(_.map(schema, item => _.isString(item.source) && item.source)))
    await pAll(_.map(relationResources, resource => {
      return async () => {
        relationMap[resource] = await this.api(resource).list()
      }
    }), {concurrency: 1})
    return relationMap
  }

  // the writes of a sync are many: they wait for the disk once, at the end (see JsonStore.bulk)
  startSyncData (req, resource, options) {
    return this.api(resource).bulk(() => this.syncData(req, resource, options))
  }

  /**
   * Writes an export into a resource: creates, updates and removes (the records matched by their unique keys), relations and references back to ids, files copied; the report goes to `syncReport[resource]`.
   * @param {object} req the export as its body, `syncInfo` the settings of this server
   * @param {string} resource
   * @param {{skipRemoveRecord?: boolean}} [options]
   */
  async syncData (req, resource, options) {
    try {
      const {skipRemoveRecord} = options || {}
      _.set(this.syncReport, resource, {
        resource: resource,
        status: 'syncing',
        startedAt: Date.now(),
        removed: 0,
        updated: 0,
        created: 0,
        // the files (attachments) of the records: added, removed and the ones that could not be copied
        attachmentsAdded: 0,
        attachmentsRemoved: 0,
        attachmentsFailed: 0,
        progress: []
      })
      const api = this.api(resource)
      const uniqueKeys = this.api(resource).getUniqueKeys()
      const localItems = await api.list()
      const remoteItems = req.body
      const relationMap = await this.getRelationMap(resource)
      const normalizedRecords = await this.getNormalizedRecords(resource, relationMap)
      // a record is told by the values of its unique keys, as one text (a value that is not set counts as absent, as it is in
      // what the other CMS sends): the records of each side are found by that text, not by looking through the other side
      const keyOf = item => stable(withoutNil(_.pick(item, uniqueKeys)))
      const remoteKeys = new Set(_.map(remoteItems, keyOf))
      const localByKey = new Map(_.map(localItems, item => [keyOf(item), item]))
      const removeItems = _.filter(normalizedRecords, item => !remoteKeys.has(keyOf(item)))
      _.set(this.syncReport, `${resource}.createTotal`, 0)
      _.set(this.syncReport, `${resource}.updateTotal`, remoteItems.length)
      _.set(this.syncReport, `${resource}.removeTotal`, removeItems.length)
      const toByKey = new Map(_.map(await this.getSyncResourceItems(req, resource), item => [keyOf(item), item]))
      const createItems = _.filter(remoteItems, item => !toByKey.has(keyOf(item)))
      const createKeys = new Set(_.map(createItems, keyOf))
      const updateItems = _.filter(remoteItems, item => {
        const key = keyOf(item)
        if (createKeys.has(key)) {
          return false
        }
        // through JSON, as the records the other CMS sent have been: a key with no value (a relation that is not set) is not there
        const fromItem = JSON.parse(JSON.stringify(item))
        const toItem = JSON.parse(JSON.stringify(toByKey.get(key)))
        fromItem._attachments = _.map(fromItem._attachments, one => _.omit(one, ['url']))
        toItem._attachments = _.map(toItem._attachments, one => _.omit(one, ['url']))
        // a reference the target could not resolve when the record was written stays in it as text: written again, it may resolve now
        return !_.isEqual(fromItem, toItem) || _.includes(JSON.stringify(localByKey.get(key)), REF_PREFIX)
      })
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
      const blockRelations = await this.getBlockRelations(api.options.schema)
      _.each(api.options.schema, field => {
        if (field.input === 'paragraph') {
          _.each(createAndUpdateItems, item => {
            if (!_.isUndefined(item[field.field])) {
              item[field.field] = this.mapParagraphField(item[field.field], blockRelations, 'import')
            }
          })
        }
      })
      // the references to records written in texts become the ids of the records here
      const getIndex = this.recordIndex()
      const missing = []
      for (const item of createAndUpdateItems) {
        const converted = await this.mapTexts(item, text => this.refsToIds(text, getIndex, missing))
        _.assign(item, converted)
      }
      if (missing.length) {
        logger.warn(`sync of ${resource}: ${_.uniq(missing).length} record(s) written in texts are not here yet (sync the resource they belong to first): ${_.uniq(missing).join(', ')}`)
      }
      this.syncReport[resource].progress.push('convert data')
      await pAll(_.map(createAndUpdateItems, item => {
        return async () => {
          let localItem = localByKey.get(keyOf(item))
          const remoteAttachments = _.groupBy(item._attachments, '_name')
          delete item._attachments
          if (localItem) {
            const pickItem = _.omit(item, [...uniqueKeys, '_id'])
            localItem = await this.api(resource).update(localItem._id, pickItem)
          } else {
            localItem = await this.api(resource).create(item)
          }
          // the files of each attachment field, one by one: a file that is the same here (same content and name) is left alone,
          // the ones the source has not are removed, and the ones missing here are copied
          const localAttachments = _.groupBy(localItem._attachments, '_name')
          const sameFile = attach => `${attach._md5sum}|${attach._filename}|${stable(_.pick(attach, ['_payload', 'cropOptions', 'order', '_fields']))}`
          await pAll(_.map(_.union(_.keys(remoteAttachments), _.keys(localAttachments)), name => {
            return async () => {
              const wanted = _.countBy(remoteAttachments[name] || [], sameFile)
              const toRemove = _.filter(localAttachments[name] || [], attach => {
                const key = sameFile(attach)
                if (wanted[key] > 0) {
                  wanted[key] -= 1
                  return false
                }
                return true
              })
              // what is still wanted after the files kept
              const remoteList = _.filter(remoteAttachments[name] || [], attach => {
                const key = sameFile(attach)
                if (wanted[key] > 0) {
                  wanted[key] -= 1
                  return true
                }
                return false
              })
              if (toRemove.length || remoteList.length) {
                if (toRemove.length) {
                  logger.info(`${toRemove.length} attachments in ${resource} ${localItem._id} removed`)
                }
                await pAll(_.map(toRemove, attach => {
                  return async () => {
                    await this.api(resource).removeAttachment(localItem._id, attach._id)
                    this.syncReport[resource].attachmentsRemoved += 1
                  }
                }), {concurrency: 1})
                await pAll(_.map(remoteList, attach => {
                  return async () => {
                    let temporaryFile
                    try {
                      const response = await fetch(attach.url)
                      if (!response.ok) {
                        throw new Error(`${response.status} ${response.statusText}`)
                      }
                      // through a file, as an upload is: only the stream of a file lets the CMS see what the content is (an image that
                      // came as bytes in memory would be kept as an unknown type)
                      temporaryFile = path.join(os.tmpdir(), `embed-cms-sync-${crypto.randomUUID()}`)
                      await fs.promises.writeFile(temporaryFile, Buffer.from(await response.arrayBuffer()))
                      const params = {
                        contentType: attach._contentType,
                        filename: attach._filename,
                        name: attach._name,
                        stream: fs.createReadStream(temporaryFile),
                        fields: attach._fields,
                        payload: attach._payload,
                        cropOptions: attach.cropOptions,
                        order: attach.order
                      }
                      await this.api(resource).createAttachment(localItem._id, params)
                      this.syncReport[resource].attachmentsAdded += 1
                    } catch (error) {
                      // said in the report, and the sync does not end as done: the files are not all there
                      this.syncReport[resource].attachmentsFailed += 1
                      logger.error(`fail to download ${attach.url.replace(/[?].*$/, '')}: ${_.get(error, 'message', error)}`)
                    } finally {
                      if (temporaryFile) {
                        await fs.promises.rm(temporaryFile, {force: true}).catch(() => {})
                      }
                    }
                  }
                }), {concurrency: 1})
              }
            }
          }))
          if (createKeys.has(keyOf(item))) {
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
            // the files go with the record
            this.syncReport[resource].attachmentsRemoved += _.size(item._attachments)
          }
        }), {concurrency: 1})
      }
      this.syncReport[resource].progress.push('remove')
      const failedFiles = this.syncReport[resource].attachmentsFailed
      if (failedFiles > 0) {
        // the records are in, but some files could not be copied: not a sync that is done
        _.set(this.syncReport, `${resource}.status`, 'error')
        _.set(this.syncReport, `${resource}.error`, `${failedFiles} attachment${failedFiles === 1 ? '' : 's'} could not be copied`)
      } else {
        _.set(this.syncReport, `${resource}.status`, 'done')
      }
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

  /** @returns {import('express').Express} the app of the plugin, to mount */
  express () {
    return this.app
  }
}

exports = module.exports = SyncClass

