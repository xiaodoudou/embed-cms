const path = require('path')
const _ = require('lodash')
const http = require('http')
const express = require('express')
const bodyParser = require('body-parser')
const os = require('os')
const fs = require('fs')
const basicAuth = require('basic-auth-connect')
const logger = require('../../logger')
const { publicConfig, redactSecrets, restoreSecrets } = require('../../util/redact')
const { isWeak } = require('../../util/secrets')
const nodeCmsPkg = require(path.join(__dirname, '..', '..', '..', 'package.json'))
/*
 * Default options
 */
/**
 * The package.json of the project the CMS runs in, or {} when the folder has none (the cms command in an empty folder).
 * Only the dev mode reads it (config.port, config.mountPath).
 * @returns {object}
 */
const readProjectPackage = () => {
  try {
    return require(path.join(process.cwd(), 'package.json'))
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      logger.warn('Could not read the package.json of the project:', error.message)
    }
    return {}
  }
}
const pkg = readProjectPackage()

/**
 * The username and password of an `Authorization: Basic ...` header.
 * @param {import('express').Request} req
 * @returns {{username: string, password: string}|undefined}
 */
const basicCredentials = (req) => {
  const [scheme, encoded] = String(_.get(req, 'headers.authorization', '')).split(' ')
  if (!/^basic$/i.test(scheme) || !encoded) {
    return undefined
  }
  const decoded = Buffer.from(encoded, 'base64').toString()
  const index = decoded.indexOf(':')
  return index < 0 ? undefined : { username: decoded.slice(0, index), password: decoded.slice(index + 1) }
}
const bootTime = +new Date()
const defaults = {
  mount: '/admin'
}

/*
 * Set constructor
 */

/*
 * Constructor
 *
 * @param {Object} options, optional
 *   @param {Route} route, route to inject itself, eg. '/admin'
 */

class Admin {
  constructor(cms, options, configPath) {
    this.cms = cms
    this.cms.$admin = this
    this._app = cms._app
    this.options = _.extend({}, defaults, options)
    this.security = cms.security
    this.configPath = configPath
    this.bootTime = bootTime
    // the built admin app (npm run build)
    this.distPath = path.join(__dirname, '..', '..', '..', 'dist')
    this.initialize()
  }

  initialize = () => {
    const admin = express()
    // Use the CMS instance that was set in the factory

    admin.use(bodyParser.json())
    this.configFieldsToExpose = ['autoload', 'disableJwtLogin', 'disableDarkMode', 'disableAuthentication', 'blockRetry', 'import', 'importFromRemote', 'syslog', 'sync', 'toolbarTitle', 'webserver', 'wsRecordUpdates', 'routesToAuth']
    /* Login Page */
    if (!this.options.disableJwtLogin) {
      admin.post('/', this.onPostLogin)
    }
    if (!this.options.disableJwtLogin) {
      admin.get('/', this.onGetRoot)
    } else if (!this.options.disableAuthentication) {
      admin.get('/', this.onGetRootBasicAuth)
    } else {
      admin.get('/', this.onGetRootNoAuth)
    }
    admin.get('/js/:file', this.onGetJsFile)

    admin.get('/fonts/*', this.onGetFonts)

    /* Assets */
    let servePath = path.join(__dirname, '../../../dist')
    if (_.get(process, 'env.VITE_DEV_MODE', false) !== false) {
      logger.warn('DEV mode detected, will serve /src folder')
      admin.use(express.static(path.join(__dirname, '../../../public'), {
        maxAge: '365d',
        setHeaders: (res, path) => {
          if (path.search('index.html') > -1) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
            res.setHeader('Pragma', 'no-cache')
            res.setHeader('Expires', '0')
            res.setHeader('Surrogate-Control', 'no-store')
            res.setHeader('Last-Modified',  new Date(+new Date() - Math.ceil(os.uptime())).toUTCString())
          }
        }
      }))
      servePath = path.join(__dirname, '../../../src')
    }
    admin.use(express.static(servePath)) // needed for pkg

    admin.get('/changeTheme/:newTheme', this.onGetChangeTheme)

    admin.get('/_groups', this.requireLogin, this.onGetGroups)

    /* User info */
    admin.get('/login', this.onGetLogin)

    /* Languages */
    let i18nFolder = path.resolve(path.join('.', 'i18n'))
    if (!fs.existsSync(i18nFolder)) {
      i18nFolder = path.resolve(path.join(__dirname, '../../../i18n'))
    }
    if (fs.existsSync(i18nFolder)) {
      admin.get('/i18n/config.json', this.onGetI18nConfig)
      admin.use('/i18n', express.static(i18nFolder))
    }

    /* Resource schemas */
    admin.get('/config', this.onGetConfig)

    /* Resource schemas */
    admin.get('/resources', this.sessionAuthMiddleware, this.onGetResources)

    /* Paragraphs schemas */
    admin.get('/paragraphs', this.sessionAuthMiddleware, this.onGetParagraphs)

    /* CMS Configuration Editor - Admin only */

    // GET /admin/cms-config - Load current CMS configuration
    admin.get('/cms-config', this.onGetCmsConfig)

    // POST /admin/cms-config - Save CMS configuration and restart server
    admin.post('/cms-config', this.onPostCmsConfig)

    this._app.use(this.options.mount, admin)
  }

  checkIfUserLoggedIn = async (req) => {
    if (this.cms.$authentication.getUserFromToken && _.isEmpty(await this.cms.$authentication.getUserFromToken(req))) {
      logger.warn(`User not logged in ${req.originalUrl}`)
      return false
    }
    return true
  }

  async serveDevMode(req, res, next) {
    const devPort = _.get(pkg, 'config.port', 9990) + 10000
    const userLoggedIn = await this.checkIfUserLoggedIn(req, res, next)
    const url = `http://localhost:${devPort}${!userLoggedIn ? `${_.get(pkg, 'config.mountPath', '/')}admin/index.html` : req.originalUrl}`
    logger.warn(`serveDevMode - ${url}`)
    this.serveTemplate(req, res, url, userLoggedIn)
  }

  getGroupNameFromId = async (groupId) => {
    return _.get(await this.cms.$authentication.groups.find({_id: groupId}), 'name', false)
  }

  replaceTagsInTemplate = (template, userIsLoggedIn) => {
    const forDev = _.get(process, 'env.VITE_DEV_MODE', false)
    if (forDev) {
      template = _.replace(template, './main.js', '/src/main.js')
    }
    template = _.replace(template, '__TYPE__', userIsLoggedIn ? 'index' : 'login')
    template = _.replace(template, '__TITLE__', userIsLoggedIn ? 'node-cms' : 'Login')
    return template
  }

  serveTemplate = (req, res, url, userLoggedIn) => {
    const forDev = _.get(process, 'env.VITE_DEV_MODE', false)
    if (!forDev) {
      let body
      try {
        body = fs.readFileSync(path.join(this.distPath, 'index.html'))
      } catch (error) {
        logger.error(`The admin app cannot be served (${error.code || error.message}): run \`npm run build\` in node-cms`)
        return res.status(503).type('text/plain').send('The admin app is not built: run `npm run build` in node-cms.')
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.setHeader('Surrogate-Control', 'no-store')
      res.setHeader('Last-Modified',  new Date(+new Date() - Math.ceil(os.uptime())).toUTCString())
      return res.send(this.replaceTagsInTemplate(body, userLoggedIn))
    }
    http.get(url).on('response', (response) => {
      let body = ''
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        res.send(this.replaceTagsInTemplate(body, userLoggedIn))
      })
    }).on('error', (error) => {
      logger.error(`The vite dev server did not answer ${url}:`, error.message)
      if (!res.headersSent) {
        res.status(503).type('text/plain').send('The vite dev server does not answer: start it with `npm run dev`.')
      }
    })
  }

  isAdminUser = async (req) => {
    try {
      if (!this.options.disableJwtLogin) {
        const user = await this.cms.$authentication.getUserFromToken(req)
        if (!user) return false
        const groupName = await this.cms.$authentication.getUserGroupName(req)
        return groupName === 'admins'
      } else if (!this.options.disableAuthentication) {
        // Basic login: the route is not in routesToAuth, so the credentials of the request are checked here
        const credentials = basicCredentials(req)
        if (!credentials) return false
        const {error, result} = await this.cms.$authentication.authenticate(credentials.username, credentials.password, req)
        if (error || !result) return false
        const userGroup = _.get(result, 'group', false)
        return !!userGroup && await this.getGroupNameFromId(_.get(userGroup, '_id', userGroup)) === 'admins'
      } else {
        // If authentication is disabled, deny access to config editor
        return false
      }
    } catch (error) {
      logger.error('Error checking admin user:', error)
      return false
    }
  }

  // Route handlers with "on" prefix

  onPostLogin = async (req, res) => {
    try {
      const {error, result} = await this.cms.$authentication.performLogin(req, res)
      if (error && error.retryAfter) {
        res.set('Retry-After', String(error.retryAfter))
      }
      if (error || _.isEmpty(result.group)) {
        res.status(_.get(error, 'code') === 429 ? 429 : 500).send('Username and password not match')
      } else {
        res.send('success')
      }
    } catch (error) {
      logger.error('Error on login:', error.message)
      res.status(500).send('Username and password not match')
    }
  }

  onGetRoot = async (req, res, next) => {
    // logger.info(`GET /admin/ from ${req.originalUrl}`)
    if (!/\/$/.test(req.originalUrl)) {
      return res.redirect(301, req.originalUrl + '/')
    }
    try {
      if (this.cms.$authentication.getUserFromToken && _.isEmpty(await this.cms.$authentication.getUserFromToken(req))) {
        if (_.get(process, 'env.VITE_DEV_MODE', false) !== false) {
          return await this.serveDevMode(req, res, next)
        }
        return this.serveTemplate(req, res, `${req.protocol + '://' + req.get('host') + req.originalUrl}index.html`, false)
      }
      const url = req.protocol + '://' + req.get('host') + req.originalUrl
      if (_.endsWith(url, '/admin/')) {
        return this.serveTemplate(req, res, `${url}index.html`, true)
      }
    } catch (error) {
      return next(error)
    }
    next()
  }

  onGetRootBasicAuth = async (req, res, next) => {
    // logger.info(`GET /admin/ from ${req.originalUrl}`)
    if (!/\/$/.test(req.originalUrl)) {
      return res.redirect(301, req.originalUrl + '/')
    }
    return this.basicAuthenticate(req, res, next, () => {
      const url = req.protocol + '://' + req.get('host') + req.originalUrl
      return this.serveTemplate(req, res, `${url}index.html`, true)
    })
  }

  // no login at all (disableJwtLogin and disableAuthentication): everyone gets the admin itself
  onGetRootNoAuth = (req, res) => {
    if (!/\/$/.test(req.originalUrl)) {
      return res.redirect(301, req.originalUrl + '/')
    }
    const url = req.protocol + '://' + req.get('host') + req.originalUrl
    return this.serveTemplate(req, res, `${url}index.html`, true)
  }

  /**
   * Checks the HTTP Basic credentials of an admin route and calls onSuccess with the user.
   * Missing or wrong credentials answer 401 with WWW-Authenticate, so the browser asks for them again; a locked account
   * answers the code of the lockout (429) with Retry-After, like the other Basic routes.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {Function} next
   * @param {function(object): *} onSuccess
   */
  basicAuthenticate = (req, res, next, onSuccess) => {
    return basicAuth(async (username, password, callback) => {
      try {
        const {error, result} = await this.cms.$authentication.authenticate(username, password, req)
        if (error && (error.code === 500 || error.code === 429)) {
          if (error.retryAfter) {
            res.set('Retry-After', String(error.retryAfter))
          }
          return res.status(error.code).send(error)
        }
        if (error) {
          return callback(error)
        }
        return await onSuccess(result)
      } catch (error) {
        next(error)
      }
    })(req, res, next)
  }

  onGetJsFile = async (req, res, next) => {
    if (_.get(process, 'env.VITE_DEV_MODE', false) === false) {
      return next()
    }
    try {
      await this.serveDevMode(req, res, next)
    } catch (error) {
      next(error)
    }
  }

  onGetFonts = async (req, res, next) => {
    // outside of dev mode the fonts are plain files of the built app: express.static serves them
    if (_.get(process, 'env.VITE_DEV_MODE', false) === false) {
      return next()
    }
    try {
      await this.serveDevMode(req, res, next)
    } catch (error) {
      next(error)
    }
  }

  onGetChangeTheme = async (req, res) => {
    try {
      const theme = _.get(req, 'params.newTheme', 'dark')
      if (this.security.strictAdmin && !_.includes(['light', 'dark'], theme)) {
        return res.status(400).json({message: 'Unknown theme'})
      }
      let user = await this.cms.$authentication.getUserFromToken(req)
      user = await this.cms.$authentication.users.find({username: _.get(user, 'username', false), group: _.get(user, 'group._id')})
      _.set(req, 'session.nodeCmsUser.theme', theme)
      // only the theme is written: sending the whole record back would send the stored password along
      await this.cms.$authentication.users.update(user._id, {theme})
      res.status(200).json({message: 'done'})
    } catch (error) {
      logger.error('/changeTheme error:', error)
      res.status(500).json({message: 'Failed to change the theme'})
    }
  }

  /**
   * Answers 401 unless the request comes from a logged in user (only enforced with security.strictAdmin).
   */
  requireLogin = async (req, res, next) => {
    try {
      if (!this.security.strictAdmin || (this.options.disableJwtLogin && this.options.disableAuthentication)) {
        return next()
      }
      if (!this.options.disableJwtLogin) {
        if (await this.checkIfUserLoggedIn(req)) {
          return next()
        }
        return res.status(401).json({code: 401, message: 'Not authenticated'})
      }
      return this.sessionAuthMiddleware(req, res, next)
    } catch (error) {
      logger.error('requireLogin - Error:', error.message)
      return res.status(401).json({code: 401, message: 'Not authenticated'})
    }
  }

  onGetGroups = async (req, res) => {
    let groups = await this.cms.$authentication.groups.list({})
    groups = _.map(groups, (group) => {
      return {
        name: group.name,
        plugins: group.plugins
      }
    })
    return res.status(200).send(groups)
  }

  onGetLogin = async (req, res, next) => {
    // logger.warn(`GET admin /login`)
    if (!_.get(this.options, 'disableJwtLogin', false)) {
      if (!_.get(req, 'session.nodeCmsUser', false) && this.cms.$authentication.getUserFromToken && _.isEmpty(await this.cms.$authentication.getUserFromToken(req))) {
        return res.status(200).send({})
      }
      try {
        const groupName = await this.cms.$authentication.getUserGroupName(req)
        const group = await this.cms.$authentication.groups.find({name: groupName})
        const user = await this.cms.$authentication.users.find({username: _.get(req, 'session.nodeCmsUser.username', false), group: _.get(group, '_id')})
        if (!user) {
          throw new Error('User not found')
        }
        res.status(200).send({
          username: _.get(req, 'session.nodeCmsUser.username', false),
          theme: _.get(user, 'theme', 'light'),
          _updatedAt: _.get(user, '_updatedAt', false),
          group: groupName,
          uptime: this.bootTime
        })
      } catch (error) {
        logger.error('Error on login: ', error.message)
        return res.status(200).send({})
      }
    } else if (!_.get(this.options, 'disableAuthentication', false)) {
      this.basicAuthenticate(req, res, next, async (result) => {
        return res.status(200).send({
          username: _.get(result, 'username', false),
          theme: _.get(result, 'theme', 'light'),
          _updatedAt: _.get(result, '_updatedAt', false),
          group: await this.getGroupNameFromId(_.get(result, 'group', false)),
          uptime: this.bootTime
        })
      })
    } else {
      return res.status(200).send({
        username: 'anonymous',
        theme: 'light',
        group: 'anonymous',
        uptime: this.bootTime
      })
    }
  }

  onGetI18nConfig = (req, res) => {
    // cms.json: admin.language, or admin.config.language as older configurations wrote it; the admin reads config.language
    const admin = _.get(this.cms, '_options.admin') || {}
    const language = admin.language || _.get(admin, 'config.language') || { 'defaultLocale': 'enUS', 'locales': ['enUS'] }
    res.json({ language, config: { language } })
  }

  onGetConfig = (req, res) => {
    let config = _.pick(this.options, this.configFieldsToExpose)
    if (this.security.redactConfig) {
      // readable without a login: plugin blocks (import, importFromRemote, sync) can hold credentials
      config = publicConfig(config)
    }
    config.version = _.get(nodeCmsPkg, 'version', 'unknown')
    res.send(config)
  }

  // Middleware methods
  // shared by /resources and /paragraphs: resolves the logged in user's group for the handlers
  sessionAuthMiddleware = async (req, res, next) => {
    if (!this.options.disableJwtLogin) {
      _.set(req, 'user.group', _.get(req, 'session.nodeCmsUser.group', false))
      next()
    } else if (!this.options.disableAuthentication) {
      // req.user is already set when the route is in routesToAuth (dispatchAuth checked the same credentials)
      this.basicAuthenticate(req, res, next, (result) => {
        _.set(req, 'user', result)
        next()
      })
    } else {
      next()
    }
  }

  onGetResources = async (req, res) => {
    const userGroup = _.get(req, 'user.group', false)
    const toFind = {}
    if (userGroup) {
      _.set(toFind, '_id', _.get(userGroup, '_id', userGroup))
    } else {
      _.set(toFind, 'name', 'anonymous')
    }
    try {
      const group = await this.cms.$authentication.groups.find(_.get(toFind, '_id', toFind))
      if (!group) {
        throw new Error(`No group found with ${JSON.stringify(toFind)}`)
      }
      req.resources = _.get(group, 'read', [])
    } catch (error) {
      logger.error('Error getting resources: ', error)
      return res.status(401).send('Not authorized')
    }
    let resources = _.map(this.cms._resources, (resource, name) => {
      _.each(resource.options, (item) => {
        if (_.isRegExp(_.get(item, 'options.regex.value'))) {
          item.options.regex.value = item.options.regex.value.toString()
        } else if (_.isObject(_.get(item, 'options.regex'))) {
          _.each(item.options.regex, (localeItem) => {
            if (_.isRegExp(localeItem.value)) {
              localeItem.value = localeItem.value.toString()
            }
          })
        }
        return item
      })
      return _.extend({}, resource.options, {
        title: name,
        cms: null,
        resource: null,
        mid: resource.options.cms.mid
      })
    })
    resources = _.filter(resources, (resource) => req.resources.indexOf(resource.title) > -1)
    if (!_.get(req.query, 'listAttachments', false)) {
      _.each(resources, (resource) => {
        if (_.get(resource, '_attachments', false)) {
          delete resource._attachments
        }
      })
    }
    res.json(resources)
  }

  onGetParagraphs = async (req, res) => {
    try {
      const userGroup = _.get(req, 'user.group', false)
      if (!userGroup) {
        throw new Error('Not authorized')
      }
      req.paragraphs = this.cms._paragraphs
      const paragraphs = _.map(this.cms._paragraphs, (paragraph, name) => {
        return _.extend({}, paragraph.options, paragraph, {title: name})
      })
      res.status(200).json(paragraphs)
    } catch (error) {
      logger.warn('Unauthorized', error)
      res.statusCode = 401
      res.setHeader('WWW-Authenticate', 'Basic realm="Authorization Required"')
      res.end('Unauthorized')
    }
  }

  onGetCmsConfig = async (req, res) => {
    try {
      if (!(await this.isAdminUser(req))) {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' })
      }
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
      res.json(this.security.redactConfig ? redactSecrets(config) : config)
    } catch (error) {
      logger.error('Error loading CMS config:', error)
      res.status(500).json({ error: 'Failed to load configuration: ' + error.message })
    }
  }

  onPostCmsConfig = async (req, res) => {
    try {
      if (!(await this.isAdminUser(req))) {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' })
      }
      let newConfig = req.body
      if (!newConfig || !_.isObject(newConfig)) {
        return res.status(400).json({ error: 'Invalid configuration data' })
      }
      if (this.security.redactConfig) {
        // secrets were sent back as the placeholder they were read as: keep the stored values
        newConfig = restoreSecrets(newConfig, JSON.parse(fs.readFileSync(this.configPath, 'utf8')))
      }
      if (this.security.strongSecrets) {
        const weak = ['auth.secret', 'session.secret'].find(key => isWeak(_.get(newConfig, key), this.cms.requiredKeyLength))
        if (weak) {
          return res.status(400).json({ error: `config.${weak} must be at least ${this.cms.requiredKeyLength} characters and not a published default` })
        }
      }
      try {
        JSON.parse(JSON.stringify(newConfig))
      } catch (jsonError) {
        return res.status(400).json({ error: 'Invalid JSON configuration: ' + jsonError.message })
      }
      const configString = JSON.stringify(newConfig, null, 2)
      const backupPath = this.configPath + '.backup.' + Date.now()
      if (fs.existsSync(this.configPath)) {
        fs.copyFileSync(this.configPath, backupPath)
        logger.info(`Created backup of cms.json at: ${backupPath}`)
      }
      fs.writeFileSync(this.configPath, configString, 'utf8')
      logger.info('CMS configuration updated successfully')
      res.json({
        message: 'Configuration saved successfully. Server will restart shortly.',
        backupPath: backupPath
      })
      setTimeout(() => {
        logger.info('Restarting server due to configuration change...')
        process.exit(0)
      }, 1000)
    } catch (error) {
      logger.error('Error saving CMS config:', error)
      res.status(500).json({ error: 'Failed to save configuration: ' + error.message })
    }
  }
}

exports = module.exports = Admin

