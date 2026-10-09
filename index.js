/**
 * @fileoverview Embed CMS - A flexible content management system
 * @author Embed CMS Team
 * @see {@link ./lib/jsdocTypes.js} For complete type definitions
 */
/**
 * @typedef {import('./lib/ResourceAPIWrapper.js')} ResourceAPIWrapper
 */

const path = require('path')
const os = require('os')
const fs = require('fs')
const { default: pAll } = require('p-all')
const compression = require('compression')
const cookieParser = require('cookie-parser')
const express = require('express')
const helmet = require('helmet')
const _ = require('lodash')
const fsExtra = require('fs-extra')
const { isAttachmentInput } = require('./lib/util/inputTypes')
const { ensurePrivateFolder } = require('./lib/util/privateFolder')
const { isMultiSource, sourcesOf } = require('./lib/util/fieldSources')
const session = require('express-session')
const UUID = require('./lib/util/uuid')
const SyslogManager = require('./lib/SyslogManager')
const SystemManager = require('./lib/SystemManager')
const UpdatesManager = require('./lib/UpdatesManager')
const { fieldPathPattern, BLOCK_WILDCARD } = require('./lib/util/fieldPathPattern')
const Resource = require('./lib/Resource')
const ResourceAPIWrapper = require('./lib/ResourceAPIWrapper')
const OSSHelper = require('./lib/util/OSSHelper')
const ImageOptimization = require('./lib/util/imageOptimization')
const logger = require('./lib/logger')
const { resolveSecurity } = require('./lib/util/securityOptions')
const { ensureStrongSecrets } = require('./lib/util/secrets')
const csrfGuard = require('./lib/util/csrf')
const cookieNames = require('./lib/util/cookieNames')
const securityHeaders = require('./lib/util/securityHeaders')
const { normalizeMaps } = require('./lib/util/maps')
const sendError = require('./lib/plugins/rest/sendError')

/**
 * Recursively loads all .js files in a directory as modules (synchronously).
 * Returns an object mapping filenames (without extension) to the required module.
 * Only loads .js files, skips directories and non-js files.
 * @param {string} dirPath - Absolute or relative path to directory
 * @returns {Object}
 */
const requireDirNative = (dirPath) => {
  const absDir = path.resolve(dirPath)
  const files = fs.readdirSync(absDir)
  const result = {}
  for (const file of files) {
    const fullPath = path.join(absDir, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) continue
    if (!file.endsWith('.js')) continue
    const key = file.replace(/\.js$/, '')
    result[key] = require(fullPath)
  }
  return result
}

// Default CMS configration
const defaultConfig = () =>
  ({
    ns: [],
    resources: './resources',
    data: './data',
    autoload: true,
    disableDarkMode: true,
    mode: 'normal',
    mid: Date.now().toString(36),
    disableREST: false,
    disableAdmin: false,
    disableJwtLogin: true,
    disableReplication: false,
    disableAuthentication: false,
    wsRecordUpdates: true,
    importFromRemote: true,
    disableAnonymous: false,
    auth: {
      secret: 'MdjIwFRi9ezT1234567890abcdef'
    },
    session: {
      secret: 'MdjIwFRi9ezT',
      resave: true,
      saveUninitialized: true
    }
  })

class CMS {
  /**
   * Creates a new CMS instance
   * @param {Object} [options] - CMS configuration options
   * @param {string[]} [options.ns] - Namespace array
   * @param {string} [options.resources] - Resources directory path
   * @param {string} [options.data] - Data directory path
   * @param {boolean} [options.autoload] - Auto-load resources
   * @param {string} [options.mode] - CMS mode
   * @param {string} [options.mid] - Machine ID
   * @param {boolean} [options.disableREST] - Disable REST API
   * @param {boolean} [options.disableAdmin] - Disable admin interface
   * @param {boolean} [options.disableJwtLogin] - Disable JWT login
   * @param {boolean} [options.disableReplication] - Disable replication
   * @param {boolean} [options.disableAuthentication] - Disable authentication
   * @param {boolean} [options.wsRecordUpdates] - Enable WebSocket record updates
   * @param {boolean} [options.importFromRemote] - Enable import from remote
   * @param {boolean} [options.disableAnonymous] - Disable anonymous access
   * @param {Object} [options.session] - Session configuration
   * @param {Object} [options.auth] - Authentication configuration
   *
   * @example
   * const CMS = require('embed-cms')
   * const cms = new CMS({
   *   resources: './resources',
   *   data: './data',
   *   disableREST: false
   * })
   *
   * // Get API to work with resources
   * const api = cms.api()
   * const groups = await api('_groups').list()
   * const user = await api('_users').find('user-id')
   */
  constructor(options) {
    // NOTE: Min auth key length
    this.isExiting = false
    this.requiredKeyLength = 16
    this.fieldFileTypes = ['file', 'img', 'image', 'imageView', 'attachmentView']
    const configPath = path.resolve(_.get(options, 'config') || './cms.json')
    if (options) {
      delete options.config
    }
    // create a default config, if not exist
    if (!fs.existsSync(configPath)) {
      const cfg = _.extend(defaultConfig(), options)
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2))
    }
    // aggregate options
    this.options = (options = (this._options = _.extend({}, defaultConfig(), require(configPath), options)))
    // effective security settings (the profile follows NODE_ENV, see lib/util/securityOptions.js)
    this.security = resolveSecurity(options)
    // the cookies are named after this server, so that other CMS on the same host (same cookies, other port) do not clash with it
    this.cookieNames = cookieNames(options)
    // reachable from the stores, which only see the options
    options.securitySettings = this.security
    // image operations at once: a burst of requests is worked off in turn, not all together: one per core, and at most
    // 100 may wait as well. imageConcurrency overrides the default (0 for no limit).
    ImageOptimization.configure({
      concurrency: options.imageConcurrency !== undefined ? options.imageConcurrency : os.cpus().length,
      maxQueue: 100
    })
    // ensure required folders are in place
    fsExtra.mkdirpSync(path.resolve(options.resources))
    fsExtra.mkdirpSync(path.resolve(options.data))
    // keep track of available resources
    this._tempResources = {}
    this._resources = {}
    this._paragraphs = {}
    this._attachmentFields = {}
    this._relations = {}
    this._resourceNames = []
    // the menu groups found in the resources (the Settings menu icons offer them); a live list, filled as resources are added
    // (the plugin pages of the admin live in the System group, which no resource declares)
    this._menuGroupNames = ['System']
    // keep track of available plugins
    this._plugins = {}
    // Use prefixed UUID
    options.uuid = new UUID(options.mid)
    // automaticly populate CMS resources, if specified
    if (this._options.autoload) {
      _.each(requireDirNative(options.resources), (value, key) => this.resource(key, value))
      const paragraphsDir = path.join(_.get(options, 'paragraphs', options.resources), 'paragraphs')
      // logger.info(`Paragraphs dir: ${paragraphsDir}`)
      try {
        const results = requireDirNative(paragraphsDir)
        _.each(results, (value, key)=> {
          _.set(this._paragraphs, key, value)
          this.formatSchema(this._paragraphs, key, true)
        })
      // eslint-disable-next-line no-unused-vars
      } catch (error) {
        logger.warn('No folder found for ', paragraphsDir)
      }
      _.set(this._paragraphs, '_settingsLink', {
        displayname: { enUS: 'Link', zhCN: '链接' },
        maxCount: 1,
        schema: [
          {
            field: 'name',
            label: { enUS: 'Name', zhCN: '名称' },
            localised: false,
            input: 'string',
            required: true,
            options: { hint: { enUS: 'The text of the link', zhCN: '链接文字' } }
          },
          {
            field: 'url',
            label: { enUS: 'URL', zhCN: '网址' },
            localised: false,
            input: 'url',
            required: true,
            options: { hint: { enUS: 'Where the link goes, for example https://example.com', zhCN: '链接地址，例如 https://example.com' } }
          }
        ]
      })
      this.formatSchema(this._paragraphs, '_settingsLink', true)
      _.set(this._paragraphs, '_settingsLinkGroup', {
        displayname: { enUS: 'Link group', zhCN: '链接组' },
        maxCount: 1,
        schema: [
          {
            label: { enUS: 'Group title', zhCN: '组标题' },
            field: 'title',
            localised: false,
            input: 'string',
            required: true,
            options: { hint: { enUS: 'The heading of this group in the links menu', zhCN: '此组在链接菜单中的标题' } }
          },
          {
            field: 'links',
            label: { enUS: 'Links', zhCN: '链接' },
            input: 'paragraph',
            localised: false,
            options: {
              types: ['_settingsLink'],
              hint: { enUS: 'The links of this group', zhCN: '此组的链接' }
            }
          }
        ]
      })
      this.formatSchema(this._paragraphs, '_settingsLinkGroup', true)
      _.set(this._paragraphs, '_settingsMenuGroup', {
        displayname: { enUS: 'Menu icon', zhCN: '菜单图标' },
        maxCount: 1,
        schema: [
          {
            field: 'group',
            label: { enUS: 'Menu group', zhCN: '菜单组' },
            localised: false,
            input: 'select',
            required: true,
            // the groups found in the resources, kept up to date as resources are added
            source: this._menuGroupNames,
            options: { hint: { enUS: 'The group of the menu that gets this icon', zhCN: '使用此图标的菜单组' } }
          },
          {
            field: 'icon',
            label: { enUS: 'Icon', zhCN: '图标' },
            localised: false,
            input: 'image',
            required: true,
            options: {
              maxCount: 1,
              accept: '.png,.svg,.jpg,.jpeg,.webp',
              hint: { enUS: 'Shown in place of the initials in the collapsed menu, and next to the group name', zhCN: '在折叠菜单中代替首字母显示，并显示在组名旁' }
            }
          }
        ]
      })
      this.formatSchema(this._paragraphs, '_settingsMenuGroup', true)
    }
    // create main application
    this._app = express()
    // Express 4 parsed the query string with qs and kept the object: the routes read nested keys and write to it
    this._app.set('query parser', 'extended')
    this._app.use((req, res, next) => {
      Object.defineProperty(req, 'query', { value: req.query, writable: true, configurable: true, enumerable: true })
      next()
    })
    if (options.trustProxy !== undefined) {
      // req.ip, req.secure and the login lockout follow the proxy chain instead of the raw socket
      this._app.set('trust proxy', options.trustProxy)
    }
    if (this.security.headers) {
      this._app.use(securityHeaders({ contentSecurityPolicy: this.security.contentSecurityPolicy, maps: normalizeMaps(options.maps) }))
    } else {
      this._app.use(helmet.dnsPrefetchControl())
      this._app.use(helmet.frameguard())
      this._app.use(helmet.hidePoweredBy())
      this._app.use(helmet.hsts())
      this._app.use(helmet.ieNoOpen())
      this._app.use(helmet.noSniff())
      this._app.use(helmet.permittedCrossDomainPolicies())
      this._app.use(helmet.referrerPolicy())
    }
    // Enable compression
    this._app.use(compression({
      filter (req, res) {
        return req.headers['x-no-compression'] ? false : compression.filter(req, res)
      }
    }))
    if (!options.disableAuthentication || !options.disableJwtLogin) {
      ensureStrongSecrets(options, this.security, this.requiredKeyLength)
      const secret = _.get(this.options, 'auth.secret')
      if (_.isEmpty(secret)) {
        throw new Error('config.auth.secret is missing')
      } else if (_.get(secret, 'length', 0) <= this.requiredKeyLength) {
        throw new Error(`config.auth.secret isn't long enough, adjust the value to have minimum ${this.requiredKeyLength} characters`)
      }
      // resave and saveUninitialized default to what express-session does without them (true), said out loud: left out,
      // it prints a deprecation warning at every start
      const sessionOptions = _.extend({ cookie: {}, resave: true, saveUninitialized: true }, this.options.session, { name: this.cookieNames.session })
      // sameSite and secure follow the security settings, a cookie option written in the configuration still wins
      sessionOptions.cookie = _.pickBy({ sameSite: this.security.cookies.sameSite, secure: this.security.cookies.secure, httpOnly: this.security.cookies.httpOnly }, value => value !== false)
      _.extend(sessionOptions.cookie, _.get(this.options, 'session.cookie'))
      if (this.security.strictSessions) {
        // a session is only stored once something was written to it (a login)
        sessionOptions.resave = false
        sessionOptions.saveUninitialized = false
      }
      if (process.env.NODE_ENV === 'production') {
        const FileStore = require('session-file-store')(session)
        // a session file holds the login token of a person, in clear text: only the account of the server may enter the folder
        const sessionsFolder = path.resolve(this.options.data, '.sessions.json')
        ensurePrivateFolder(sessionsFolder)
        sessionOptions.store = new FileStore({
          path: sessionsFolder,
          retries: 1,
          logFn: function(){}
        })
      }
      // the record update socket authenticates its clients with the same session
      this._sessionMiddleware = session(sessionOptions)
      this._app.use(this._sessionMiddleware)
    }
    const csrf = csrfGuard(this.security, this.cookieNames)
    if (csrf) {
      this._app.use(csrf)
    }
    if (!options.disableJwtLogin) {
      // the JWT login keeps its token in the cookie named this.cookieNames.jwt, which the REST API reads, also when Basic is on
      this._app.use(cookieParser())
    }
    if (!options.disableAuthentication) {
      // Enables session with basic auth
      this._app.use((req, res, next) => {
        // legacy: nothing in this package writes session.user any more, and a plaintext password must not be replayed
        if (!this.security.hideCredentials && req.session.user && !req.headers.authorization) {
          req.headers.authorization = 'Basic ' + Buffer.from(req.session.user.username + ':' + req.session.user.password).toString('base64')
        }
        next()
      })
    } else if (!options.disableJwtLogin) {
      // Enables session with jwt token auth
      this._app.use((req, res, next) => {
        if (!req.headers.authorization) {
          const token = _.get(req, 'session.embedCmsUser.token', false)
          if (token) {
            req.headers.authorization = token
          } else if (_.get(req, 'query.jwt', false)) {
            req.headers.authorization = req.query.jwt
          }
        }
        next()
      })
    }
    this.use(require('./lib/plugins/authentication'), options, configPath)
    // handle syslog and system
    this.bootstrapFunctions = this.bootstrapFunctions || []
    this.bootstrapFunctions.push(async (callback) => {
      SyslogManager.init(this, options)
      SystemManager.init(this, options)
      UpdatesManager.init(this, options)
      callback()
    })
    this._app.use(SyslogManager.express())
    this._app.use(SystemManager.express())
    const pluginConditions = [
      { name: 'rest',           enabled: !options.disableREST },
      { name: 'import',         enabled: !!options.import },
      { name: 'importFromRemote', enabled: !!options.importFromRemote },
      { name: 'admin',          enabled: !options.disableAdmin },
      { name: 'replicator',     enabled: !options.disableReplication },
      { name: 'sync',           enabled: !!options.sync },
      { name: 'xlsx',           enabled: !!options.xlsx },
      { name: 'anonymousRead',  enabled: !!options.anonymousRead }
    ]
    this.usedPlugins = _.chain(pluginConditions).filter('enabled').map('name').value()
    logger.info(`Will use plugins: ${this.usedPlugins.join(', ')}`)
    _.each(this.usedPlugins, (plugin) => {
      this.use(require(`./lib/plugins/${plugin}`), options, configPath)
    })
    if (this.security.uniformErrors) {
      // last in the chain: what no plugin answered ends here as json, without stack trace
      this._app.use(sendError.middleware)
    }
    // handle bootstrap
    this.bootstrap = async (server, callback) => {
      if (_.isFunction(server) && _.isUndefined(callback)) {
        callback = server
        server = undefined
      }
      this.server = server
      // this.io = new Server(this.server)
      await pAll(_.map(this.bootstrapFunctions, bootstrap => {
        return async () => {
          await new Promise((resolve, reject) => {
            bootstrap((err) => {
              if (err) reject(err)
              else resolve()
            })
          })
        }
      }), {concurrency: 1})
      callback && callback()
    }
    this._processAttachmentFields()
    this._processSourceFields()
    this.oss = new OSSHelper()
  }

  /**
   * Drops the record update sockets: they are upgraded connections, which closing the http server does not end.
   */
  _closeSockets() {
    if (this.wss) {
      this.wss.clients.forEach(client => client.terminate())
      this.wss.close()
    }
  }

  async _closeDatabase() {
    this._closeSockets()
    if (this.$replicator) {
      await this.$replicator.close()
    }
    const resourcesToClose = []
    _.each(this._resources, (resource, resourceName) => {
      if (resource.json && _.isFunction(resource.json.close)) {
        resourcesToClose.push({ name: resourceName, resource })
      }
    })
    for (const res of resourcesToClose) {
      try {
        await res.resource.json.close()
        logger.debug(`Closed resource "${res.name}" database.`)
      } catch (closeErr) {
        logger.error(`Error closing resource "${res.name}" database:`, closeErr)
      }
    }
    logger.warn('<!> All embed-cms databases are now closed. <!>')
  }

  /**
   * @param {string} signal
   * @returns {function((Error|string)=): void} the handler: logs, closes the databases, exits once, with 0 for a signal and 1 for an error
   */
  shutdown (signal) {
    return (arg) => {
      // process.on('SIGTERM', handler) calls the handler with the name of the signal: that is not a failure, an Error is
      const err = arg instanceof Error ? arg : undefined
      logger.warn(`${ signal }...`)
      if (err) {
        logger.error(err.stack || err)
      }
      if (this.isExiting) {
        return
      }
      this.isExiting = true
      process.nextTick(async () => {
        await this._closeDatabase()
        process.exit(err ? 1 : 0)
      })
    }
  }

  /** Records, per resource, the file and image fields with their path patterns (`_attachmentFields`), the ones of the blocks included. */
  _processAttachmentFields = () => {
    _.each(this._resources, (resource, resourceKey) => {
      const schema = _.get(resource, 'options.schema', [])
      _.each(schema, fieldItem => {
        const rootPath = `${fieldItem.field}`
        if (isAttachmentInput(fieldItem.input)) {
          const field = _.cloneDeep(fieldItem)
          field.path = rootPath
          _.set(this._resources, [resourceKey, 'options', '_attachmentFields', fieldPathPattern(rootPath)], field)
          _.set(this._attachmentFields, [resourceKey, fieldPathPattern(rootPath)], field)
        } else if (fieldItem.input === 'paragraph') {
          this._processAttachmentFieldsParagraph(fieldItem, resourceKey, rootPath)
        }
      })
    })
  }
  /**
   * Records the file fields of the blocks of a paragraph field (blocks inside blocks followed).
   * @param {object} fieldItem the paragraph field
   * @param {string} resourceKey
   * @param {string} rootPath the path of the field, with `{{*}}` for the index of a block
   */
  _processAttachmentFieldsParagraph = (fieldItem, resourceKey, rootPath) => {
    const paragraphTypes = _.get(fieldItem, 'options.types', [])
    _.each(paragraphTypes, paragraphType => {
      const schema = _.get(this._paragraphs, `["${paragraphType}"].schema`, [])
      _.each(schema, paragraphFieldItem => {
        const paragraphRootPath = `${rootPath}.${BLOCK_WILDCARD}.${paragraphFieldItem.field}`
        if (isAttachmentInput(paragraphFieldItem.input)) {
          const field = _.cloneDeep(paragraphFieldItem)
          field.path = paragraphRootPath
          _.set(this._resources, [resourceKey, 'options', '_attachmentFields', fieldPathPattern(paragraphRootPath, field.localised)], field)
          _.set(this._attachmentFields, [resourceKey, fieldPathPattern(paragraphRootPath)], field)
        } else if (paragraphFieldItem.input === 'paragraph') {
          this._processAttachmentFieldsParagraph(paragraphFieldItem, resourceKey, paragraphRootPath)
        }
      })
    })
  }
  /**
   * @param {object} field
   * @returns {boolean} a select or a multiselect pointing at a resource that exists (at one of the resources that exist, for a field of several)
   */
  isValidRelation = (field) => {
    if (isMultiSource(field)) {
      return _.some(sourcesOf(field), source => _.includes(this._resourceNames, source.resource))
    }
    return _.includes(['select', 'multiselect'], field.input) && _.includes(this._resourceNames, field.source)
  }
  /** Records, per resource, the relations with their path patterns (`_relations`), the ones of the blocks included. */
  _processSourceFields = () => {
    _.each(this._resources, (resource, resourceKey) => {
      const schema = _.get(resource, 'options.schema', [])
      _.each(schema, fieldItem => {
        const rootPath = `${fieldItem.field}`
        if (this.isValidRelation(fieldItem)) {
          const field = _.cloneDeep(fieldItem)
          field.path = rootPath
          _.set(this._resources, [resourceKey, 'options', '_relations', fieldPathPattern(rootPath)], field)
          _.set(this._relations, [resourceKey, fieldPathPattern(rootPath)], field)
        } else if (fieldItem.input === 'paragraph') {
          this._processSourceFieldsParagraph(fieldItem, resourceKey, rootPath)
        }
      })
    })
  }
  /**
   * Records the relations of the blocks of a paragraph field (blocks inside blocks followed).
   * @param {object} fieldItem the paragraph field
   * @param {string} resourceKey
   * @param {string} rootPath the path of the field, with `{{*}}` for the index of a block
   */
  _processSourceFieldsParagraph = (fieldItem, resourceKey, rootPath) => {
    const paragraphTypes = _.get(fieldItem, 'options.types', [])
    _.each(paragraphTypes, paragraphType => {
      const schema = _.get(this._paragraphs, `["${paragraphType}"].schema`, [])
      _.each(schema, paragraphFieldItem => {
        const paragraphRootPath = `${rootPath}.${BLOCK_WILDCARD}.${paragraphFieldItem.field}`
        if (this.isValidRelation(paragraphFieldItem)) {
          const field = _.cloneDeep(paragraphFieldItem)
          field.path = paragraphRootPath
          _.set(this._resources, [resourceKey, 'options', '_relations', fieldPathPattern(paragraphRootPath)], field)
          _.set(this._relations, [resourceKey, fieldPathPattern(paragraphRootPath)], field)
        } else if (paragraphFieldItem.input === 'paragraph') {
          this._processSourceFieldsParagraph(paragraphFieldItem, resourceKey, paragraphRootPath)
        }
      })
    })
  }
  /**
   * @param {string} name a resource or a block type
   * @param {string} key schema, locales, and so on
   * @param {boolean} [forParagraph=false]
   * @returns {string} the path of the key in the map: `[name]options.schema` for a resource, `[name].schema` for a block type
   */
  getKeyFor = (name, key, forParagraph = false) => {
    return `[${name}]${!forParagraph ? 'options' : ''}.${key}`
  }

  /**
   * Prepares a schema in place: `localised` defaulted from the locales, the list of its attachment fields (`_attachments`).
   * @param {object} resourcesList the map of resources, or of block types
   * @param {string} name
   * @param {boolean} [forParagraph=false]
   */
  formatSchema = (resourcesList, name, forParagraph = false) => {
    const schemaKey = this.getKeyFor(name, 'schema', forParagraph)
    const schema = _.get(resourcesList, schemaKey, [])
    const attachmentFields = []
    const localesKey = this.getKeyFor(name, 'locales', forParagraph)
    const resourceIsLocalised = _.get(resourcesList, `${localesKey}.length`, 0) !== 0
    _.each(schema, (field)=> {
      field.localised = _.get(field, 'localised', resourceIsLocalised)
      if (_.includes(this.fieldFileTypes, _.get(field, 'input', false))) {
        attachmentFields.push(field.field)
      }
    })
    _.set(resourcesList, schemaKey, schema)
    const attachmentsKey = this.getKeyFor(name, '_attachments', forParagraph)
    _.set(resourcesList, attachmentsKey, attachmentFields)
  }

  /** @param {object} msg sent to the connected admins over the websocket, when `wsRecordUpdates` is on */
  broadcast = (msg) => {
    if (_.get(this.options, 'wsRecordUpdates', false)) {
      UpdatesManager.broadcast(msg, this)
    }
  }

  /**
   * Remembers the name of a menu group (a string, or a per-language object: the English name, else the first one).
   * @param {string|object} group the `group` of a resource
   */
  addMenuGroupName = (group) => {
    const name = _.isString(group) ? group : _.get(group, 'enUS', _.first(_.values(group)))
    if (_.isString(name) && !_.isEmpty(name) && !_.includes(this._menuGroupNames, name)) {
      this._menuGroupNames.push(name)
    }
  }

  /**
   * Declares a resource, or gives a declared one; with `resolves`, a copy whose API resolves the relations to those resources (docs/reference/API.md).
   * @param {string} name
   * @param {object} [config] the declaration
   * @param {string[]} [resolves]
   * @returns {Resource}
   */
  resource = (name, config, resolves) => {
    resolves = _.intersection(resolves, this._resourceNames)
    if (_.isEmpty(resolves)) {
      resolves = undefined
    }
    const key = JSON.stringify({ name, resolves })
    if (!this._tempResources[key] && (config || resolves || (this._options.mode === 'normal'))) {
      let opts = _.extend(config || Resource.DEFAULTS, { cms: this._options })
      if (!_.isEmpty(resolves)) {
        const referenceKey = JSON.stringify({ name, resolves: undefined })
        opts = this._tempResources[referenceKey].options
      }
      const resolveMap = _.zipObject(resolves, _.map(resolves, item => this.resource(item)))
      this._tempResources[key] = new Resource(name, opts, resolveMap, this)
      if (_.isEmpty(resolves)) {
        this._resources[name] = this._tempResources[key]
        this.formatSchema(this._resources, name)
      }
      if (!_.includes(this._resourceNames, name)) {
        this._resourceNames.push(name)
      }
      this.addMenuGroupName(opts.group)
    }
    return this._tempResources[key]
  }

  /*
   * Use CMS resources on the backend
   *
   * @example
   *   let cms = new CMS();
   *   let api = cms.api();
   *
   *   api('articles').find('abc123xz', function(error, result) {
   *     if (error) return logger.info(error);
   *     logger.info(result);
   *   });
   *
   *  api('articles').attachments.read(['abc123xz','lmnop123'])
   *    .pipe(fs.createWriteStream('./image.png'));
   */
  /**
   * Get API access to CMS resources
   * @returns {function(string, ...string): ResourceAPI} A function that returns resource API for the given resource name
   *
   * @example
   * const api = cms.api()
   *
   * // List all records
   * const articles = await api('articles').list()
   *
   * // Find a specific record
   * const article = await api('articles').find('article-id')
   *
   * // Find with query
   * const publishedArticles = await api('articles').find({ published: true })
   *
   * // Create a new record
   * const newArticle = await api('articles').create({ title: 'New Article', content: 'Content...' })
   *
   * // Update a record
   * await api('articles').update('article-id', { title: 'Updated Title' })
   *
   * // Remove a record
   * await api('articles').remove('article-id')
   *
   * // Check if record exists
   * const exists = await api('articles').exists('article-id')
   *
   * // Work with attachments
   * const attachment = await api('articles').createAttachment('article-id', {
   *   name: 'photo',
   *   stream: fileStream,
   *   fields: { filename: 'photo.jpg' }
   * })
   *
   * // Find attachment
   * const foundAttachment = await api('articles').findAttachment('article-id', 'attachment-id')
   *
   * // Remove attachment
   * await api('articles').removeAttachment('article-id', 'attachment-id')
   */
  /**
   * Get API access to CMS resources
   * @returns {function(string, ...string): ResourceAPIWrapper} Function that returns resource API wrapper for the given resource name
   * @memberof CMS
   *
   * @example
   * const api = cms.api()
   *
   * // All these calls return ResourceAPIWrapper objects with full method availability
   * const groupsAPI = api('_groups')
   * const usersAPI = api('_users')
   *
   * // Use the ResourceAPI methods with full IDE support
   * const groups = await groupsAPI.list()
   * const group = await groupsAPI.find('group-id')
   * const newGroup = await groupsAPI.create({ name: 'New Group' })
   * const updated = await groupsAPI.update('group-id', { name: 'Updated' })
   * await groupsAPI.remove('group-id')
   */
  api = () => {
    const self = this
    /**
     * Create a resource API wrapper for the specified resource
     * @param {string} name - The resource name (e.g., '_groups', 'articles', '_users')
     * @param {...*} rest - Additional arguments passed to resource()
     * @returns {ResourceAPIWrapper} A wrapper providing list, find, create, update, remove and attachment methods
     */
    function createResourceAPI (name, ...rest) {
      const resource = self.resource(name, null, rest)
      return new ResourceAPIWrapper(resource)
    }

    // Add explicit type annotation for better IDE support
    /** @type {function(string, ...string): ResourceAPIWrapper} */
    createResourceAPI.signature = createResourceAPI

    return createResourceAPI
  }

  // Install a plugin and store in _plugins
  use = (plugin, options, configPath) => {
    const instance = new plugin(this, options, configPath)
    // Always store under pluginName if available
    if (plugin.pluginName) {
      this._plugins[plugin.pluginName] = instance
    } else {
      const name = plugin.name || plugin.constructor?.name || 'plugin'
      this._plugins[name] = instance
    }
    return instance
  }

  // Get main application
  express = () => {
    return this._app
  }
}

/**
 * @module embed-cms
 * @description Embed CMS - A flexible content management system
 *
 * @example
 * const CMS = require('embed-cms')
 * const cms = new CMS(config)
 * const api = cms.api()
 *
 * // Use the API to work with resources
 * const groups = await api('_groups').list()
 * const group = await api('_groups').find('group-id')
 * const newGroup = await api('_groups').create({ name: 'New Group' })
 */

/**
 * @typedef {Object} module:embed-cms.ResourceAPI
 * @description Complete Resource API interface available through api('resourceName')
 * @property {function(Object=, Object=): Promise<Array<Object>>} list - List all records matching query
 * @property {function(string|Object, Object=): Promise<Object>} find - Find a single record by ID or query
 * @property {function(string|Object): Promise<boolean>} exists - Check if a record exists
 * @property {function(Object, Object=): Promise<Object>} create - Create a new record
 * @property {function(string, Object, Object=): Promise<Object>} update - Update an existing record
 * @property {function(string): Promise<boolean>} remove - Remove a record
 * @property {function(string, Object): Promise<Object>} createAttachment - Create an attachment for a record
 * @property {function(string, string, Object): Promise<Object>} updateAttachment - Update an attachment
 * @property {function(string, string): Promise<Object>} findAttachment - Find an attachment with its stream
 * @property {function(string): Promise<ReadableStream>} findFile - Find a file stream by attachment ID
 * @property {function(string, string): Promise<boolean>} removeAttachment - Remove an attachment from a record
 * @property {function(): Promise<boolean>} cleanAttachment - Clean orphaned attachments
 * @property {function(Array<Object>, Object=, boolean=): Promise<Object>} getImportMap - Get import mapping for bulk operations
 * @property {function(): Array<string>} getUniqueKeys - Get unique key fields for this resource
 */

/**
 * Embed CMS Constructor
 * @class
 * @name CMS
 * @memberof module:embed-cms
 */
exports = module.exports = CMS

/**
 * Export ResourceAPIWrapper for advanced IDE support
 * @type {ResourceAPIWrapper}
 */
CMS.ResourceAPIWrapper = ResourceAPIWrapper

/**
 * Export RestHelper for middleware reuse in external projects
 * @type {RestHelper}
 */
CMS.RestHelper = require('./lib/plugins/rest/RestHelper')

/**
 * Export PageHelper to render the pages of a public site from the content (Mustache templates, kept pages)
 * @type {PageHelper}
 */
CMS.PageHelper = require('./lib/PageHelper')

/**
 * Export ContentLoader to put content and files into the CMS from a JSON description
 * @type {ContentLoader}
 */
CMS.ContentLoader = require('./lib/ContentLoader')
