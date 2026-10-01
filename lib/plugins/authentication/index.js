// Ensure plugin is stored under 'authentication' key in CMS._plugins
module.exports.pluginName = 'authentication'
const _ = require('lodash')
const jwt = require('jsonwebtoken')
const express = require('express')
const crypto = require('crypto')
const path = require('path')
const { hash: hashValue, verify: verifyHash, needsRehash, burn: burnHash } = require('../../util/passwords')
const LoginLimiter = require('../../util/loginLimiter')
const { isLocalId } = require('../../util/localId')
const TokenRevocation = require('../../util/tokenRevocation')
const { duplicateMenuGroups } = require('../../util/menuGroups')
const { regenerate, destroy } = require('../../util/session')
const { resolveSecurity } = require('../../util/securityOptions')

const bodyParser = require('body-parser')
// const through = require('through')
const basicAuth = require('basic-auth-connect')
const Dayjs = require('dayjs')
const relativeTime = require('dayjs/plugin/relativeTime')
Dayjs.extend(relativeTime)
const logger = require('../../logger')

// admin plugin pages every admin gets (the display names the admin UI lists); more can be added to the group by hand
const ADMIN_DEFAULT_PLUGINS = ['Syslog']
// Default options
// let defaults = {
//   users: {
//     mount: '/_users'
//   },
//   groups: {
//     mount: '/_groups'
//   }
// };

const unauthorizedResponse = {
  code: 401,
  message: 'Not authorized'
}
const notAuthenticatedResponse = {
  code: 401,
  message: 'Not authenticated'
}

const schemas = {
  _users: {
    displayname: {
      enUS: 'Users',
      zhCN: '用户'
    },
    group: {
      enUS: 'CMS',
      zhCN: '内容管理系统'
    },
    schema: [
      {
        field: 'username',
        input: 'string',
        label: {
          enUS: 'Username',
          zhCN: '用户名'
        }
      },
      {
        field: 'password',
        input: 'password',
        label: {
          enUS: 'Password',
          zhCN: '密码'
        }
      },
      {
        field: 'theme',
        input: 'select',
        source: ['light', 'dark'],
        default: 'dark',
        label: {
          enUS: 'Theme',
          zhCN: '主题'
        }
      },
      {
        field: 'group',
        input: 'select',
        label: {
          enUS: 'Group',
          zhCN: '组'
        },
        source: '_groups'
      }
    ],
    type: 'downstream'
  },
  _settings:{
    displayname: {
      enUS: 'Settings',
      zhCN: '设置 '
    },
    group: {
      enUS: 'CMS',
      zhCN: '内容管理系统'
    },
    schema: [
      {
        field: 'logo',
        input: 'image',
        label: { enUS: 'Logo', zhCN: '标志' },
        options: {
          maxCount: 1,
          hint: { enUS: 'Shown in the top bar instead of the title', zhCN: '显示在顶部栏，代替标题' }
        }
      },
      {
        label: { enUS: 'Title', zhCN: '标题' },
        field: 'title',
        localised: true,
        input: 'string',
        options: {
          hint: { enUS: 'Shown in the top bar when there is no logo, and as the page title', zhCN: '没有标志时显示在顶部栏，同时作为页面标题' }
        }
      },
      {
        label: { enUS: 'Top bar links', zhCN: '顶部栏链接' },
        field: 'linksGroups',
        input: 'paragraph',
        localised: false,
        options: {
          // a single link, or a group of links with a heading
          types: ['_settingsLink', '_settingsLinkGroup'],
          hint: { enUS: 'Links, or groups of links, shown in the menu at the right of the top bar', zhCN: '显示在顶部栏右侧菜单中的链接或链接组' }
        }
      },
      {
        label: { enUS: 'Menu icons', zhCN: '菜单图标' },
        field: 'menuGroups',
        input: 'paragraph',
        localised: false,
        options: {
          types: ['_settingsMenuGroup'],
          hint: { enUS: 'An image for each group of the side menu, used instead of its initials', zhCN: '侧边菜单每个组的图片，代替首字母使用' }
        }
      }
    ],
    type: 'downstream',
    maxCount: 1
  },
  _groups:{
    displayname: {
      enUS: 'Groups',
      zhCN: '组'
    },
    group: {
      enUS: 'CMS',
      zhCN: '内容管理系统'
    },
    schema: [
      {
        field: 'name',
        input: 'string',
        label: {
          enUS: 'Group name',
          zhCN: '组名'
        }
      },
      {
        field: 'create',
        input: 'multiselect',
        options: {
          listBox: true
        },
        label: {
          enUS: 'Create permission',
          zhCN: '创建权限'
        }
      },
      {
        field: 'read',
        input: 'multiselect',
        options: {
          listBox: true
        },
        label: {
          enUS: 'Read permission',
          zhCN: '读权限'
        }
      },
      {
        field: 'update',
        input: 'multiselect',
        options: {
          listBox: true
        },
        label: {
          enUS: 'Update permission',
          zhCN: '修改权限'
        }
      },
      {
        field: 'attachments',
        input: 'multiselect',
        options: {
          listBox: true
        },
        label: {
          enUS: 'Attachments permission',
          zhCN: '附件权限'
        }
      },
      {
        field: 'remove',
        input: 'multiselect',
        options: {
          listBox: true
        },
        label: {
          enUS: 'Remove permission',
          zhCN: '删除权限'
        }
      },
      {
        field: 'plugins',
        input: 'pillbox',
        options: {
          listBox: true
        },
        label: {
          enUS: 'Plugins',
          zhCN: '插件'
        }
      }
    ],
    type: 'downstream'
  }
}

// The hint shown under each field of the built-in resources, in every language of the admin
const hints = {
  _users: {
    username: { enUS: 'The name this user logs in with.', zhCN: '此用户登录时使用的名称。' },
    password: { enUS: 'Stored only as a salted hash and never shown again. Entering a new value replaces the current password.', zhCN: '仅以加盐哈希保存，不会再次显示。输入新值将替换当前密码。' },
    theme: { enUS: 'The look of the admin for this user: light or dark.', zhCN: '此用户的管理界面外观：浅色或深色。' },
    group: { enUS: 'The group decides what this user may do and which plugin pages they see.', zhCN: '所属组决定此用户可执行的操作以及可见的插件页面。' }
  },
  _groups: {
    name: { enUS: 'The name of the group, chosen in the Users form. "admins" always has full access; "anonymous" applies to visitors who are not logged in.', zhCN: '组名，在“用户”表单中选择。“admins”始终拥有完全权限；“anonymous”适用于未登录的访客。' },
    create: { enUS: 'The resources this group may create records in.', zhCN: '此组可以在其中创建记录的资源。' },
    read: { enUS: 'The resources this group may read and list.', zhCN: '此组可以读取和列出的资源。' },
    update: { enUS: 'The resources whose records this group may change.', zhCN: '此组可以修改其记录的资源。' },
    attachments: { enUS: 'The resources whose files and images this group may upload and remove.', zhCN: '此组可以上传和删除其文件和图片的资源。' },
    remove: { enUS: 'The resources whose records this group may delete.', zhCN: '此组可以删除其记录的资源。' },
    plugins: { enUS: 'The plugin pages this group can open from the menu, for example Syslog or Cms Config. Type a name and press Enter.', zhCN: '此组可以从菜单打开的插件页面，例如 Syslog 或 Cms Config。输入名称后按回车。' }
  }
}
_.each(hints, (fieldHints, resource) => {
  _.each(schemas[resource].schema, (field) => {
    if (fieldHints[field.field]) {
      field.options = { ...field.options, hint: fieldHints[field.field] }
    }
  })
})



/*
 * Constructor
 *
 * @param {Object} options, optional
 *   @param {Route} route, route to inject itself, eg. '/_users'
 */
class Authentication {
  constructor(cms, options, configPath) {
    this.cms = cms
    this.cms.$authentication = this
    this._app = cms._app
    // Always set options to a valid object
    this.options = options || (cms && cms.options) || {}
    this.configPath = configPath
    this.jwtTokenExpiresIn = 24 * 60 * 60 * 1000
    this.security = cms.security || resolveSecurity(this.options)
    this.limiter = this.security.blockRetry ? new LoginLimiter(this.security.blockRetry) : null
    // passwords that were verified lately (see authCacheTtl): keyed by a keyed hash of account and password, so what is kept
    // says nothing about the password to anyone who reads the memory of the process
    this.verifyKey = crypto.randomBytes(32)
    this.verified = new Map()
    this.stats = { verifications: 0, cacheHits: 0 }
    this.revoked = new TokenRevocation({ file: path.resolve(_.get(this.options, 'data', '.'), '.revoked-tokens.json') })
    this.initialize()
  }

  /**
   * Cookie attributes for the JWT cookie, from the security settings.
   * @param {import('express').Request} [req]
   * @returns {object}
   */
  cookieOptions = (req) => {
    const { httpOnly, sameSite, secure } = this.security.cookies
    return {
      httpOnly: !!httpOnly,
      sameSite: sameSite || undefined,
      secure: secure === 'auto' ? !!(req && req.secure) : !!secure
    }
  }

  generatePassword = (str, salt) => {
    salt = salt || crypto.randomBytes(128).toString('base64')
    try {
      const hash = crypto.pbkdf2Sync(str, salt, 100, 512, 'SHA1')
      return {salt, hash: hash.toString('hex')}
    } catch (error) {
      logger.error(error)
    }
  }

  startsWith = (str, prefix) => isLocalId(str, prefix)

  hashPassword = async (context) => {
    try {
      const object = context.params.object
      if (object && object.password) {
        if (!_.isString(object.password)) {
          return context.error({ code: 400, message: 'Password must be a string' })
        }
        // a client that read a user and writes it back sends the stored hash: keep it, do not hash the hash
        const id = context.params.id
        const stored = _.isString(id) ? await this.users.json.find(id) : undefined
        if (stored && object.password === stored.password) {
          delete object.password
          delete object.salt
        } else {
          const { salt, hash } = await hashValue(object.password, { scheme: this.security.passwordHash })
          object.password = hash
          object.salt = salt
        }
      }
      context.next()
    } catch (error) {
      context.error(error)
    }
  }

  hidePassword = (context) => {
    context.params.options = context.params.options || {}
    const obj = context.getResult()
    if (_.isArray(obj)) {
      context._result = _.map(obj, item => _.omit(item, ['password', 'salt']))
    } else if (_.isObject(obj)) {
      context._result = _.omit(obj, ['password', 'salt'])
    }
    context.next()
  }

  /**
   * Finds a user record as stored, hash and salt included. The resource methods hide them.
   * @param {object} query - exact match on top level fields, e.g. { username }
   * @returns {Promise<object|undefined>}
   */
  findUserRecord = (query) => this.users.json.find(query)

  /**
   * Tells the operator about the built-in localAdmin account when it exists: loudly when it still has the password
   * that is published in the source (anyone can log in with it), quietly otherwise.
   * @returns {Promise<void>}
   */
  warnAboutLocalAdmin = async () => {
    try {
      const record = await this.findUserRecord({ username: 'localAdmin' })
      if (!record || !record._id) {
        return
      }
      const { ok } = await verifyHash('localAdmin', record.password, record.salt)
      if (!ok) {
        logger.warn('The built-in localAdmin account exists. Delete it once you have an administrator of your own.')
      } else if (this.security.localAdmin) {
        logger.error('SECURITY: the built-in localAdmin account still has its default password, and anyone can log in with it. Change the password or delete the account.')
      } else {
        logger.error('SECURITY: the built-in localAdmin account still has its default password. It cannot log in while security.localAdmin is off, but it will as soon as the option is turned on: change the password or delete the account.')
      }
    } catch (error) {
      logger.error('localAdmin check failed', error)
    }
  }

  /**
   * Checks a password like verifyHash, but a password that was verified in the last authCacheTtl milliseconds is not
   * verified again as long as the stored hash is the one it was verified against.
   * @param {object} user - stored record
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{ok: boolean, scheme?: string, params?: object}>}
   */
  verifyPassword = async (user, username, password) => {
    const ttl = this.security.authCacheTtl
    const keyed = (text) => crypto.createHmac('sha256', this.verifyKey).update(text).digest('base64')
    const key = ttl > 0 ? keyed(`${username}\u0000${password}`) : undefined
    const stored = keyed(`${user.password}\u0000${user.salt}`)
    const hit = key && this.verified.get(key)
    if (hit && hit.stored === stored && hit.expires > Date.now()) {
      this.stats.cacheHits++
      return hit.result
    }
    this.stats.verifications++
    const result = await verifyHash(password, user.password, user.salt)
    if (key) {
      this.verified.delete(key)
      if (result.ok) {
        this.verified.set(key, { stored, result, expires: Date.now() + ttl })
        if (this.verified.size > 1000) {
          this.verified.delete(this.verified.keys().next().value)
        }
      }
    }
    return result
  }

  /**
   * Short value that changes whenever the password changes, without revealing anything about the hash.
   * It lets a token or a session notice a password change while carrying no credential material.
   * @param {object} user - stored user record
   * @returns {string}
   */
  passwordFingerprint = (user) => {
    return crypto.createHmac('sha256', this.options.auth.secret).update(`${user.password}\u0000${user.salt}`).digest('base64url').slice(0, 22)
  }

  cleanRecord = async (resource, toFind) => {
    try {
      let result = await resource.list(toFind)
      // Normalize result: if null/undefined, set to empty array
      if (!result) {
        result = []
      }
      // If result is an object but not an array, wrap in array if it has _id
      if (_.isObject(result) && !_.isArray(result)) {
        if (result._id) {
          result = [result]
        } else {
          result = []
        }
      }
      // If result is not an array, force to empty array
      if (!_.isArray(result)) {
        result = []
      }
      if (result.length === 0) {
        return
      }
      const hasForeignRecord = _.find(result, item => !_.startsWith(item._id, this.options.mid))
      if (hasForeignRecord) {
        result = _.filter(result, item => _.startsWith(item._id, this.options.mid))
      } else {
        result.shift()
      }
      for (const item of result) {
        try {
          await resource.remove(item._id)
        } catch (error) {
          logger.error(error)
        }
      }
    } catch (error) {
      logger.error('cleanRecord Error:', error)
    }
  }

  getUserGroupName = async (req) => {
    const nodeCmsUser = _.get(req, 'session.nodeCmsUser', false)
    let group = _.get(nodeCmsUser, 'group.name', false)
    if (group) {
      return group
    }
    // NOTE: If group is the group's id and not the actual record
    try {
      _.set(req, 'session.nodeCmsUser.group', await this.groups.find(_.get(nodeCmsUser, 'group', false)))
      // logger.warn(`Group:`, _.get(req, 'session.nodeCmsUser.group', false))
      return _.get(req, 'session.nodeCmsUser.group.name', false)
    } catch (error) {
      logger.error('getUserGroupName - Error: ', error)
      throw error
    }
  }

  getTokenFromReq = (req) => {
    return _.get(req, 'body.token') || _.get(req, 'query.token') || req.headers['x-access-token'] || _.get(req, 'session.nodeCmsJwt') || _.get(req, 'cookies.nodeCmsJwt', false)
  }

  /**
   * Whether the password of the user a token or a session belongs to changed since it was issued.
   * Tokens carry `pv` (see passwordFingerprint) or, when issued by the legacy profile, the hash itself.
   * @param {object} claims - the token payload or the session user
   * @returns {Promise<boolean>}
   */
  passwordChangedSince = async (claims) => {
    try {
      if (claims.pv) {
        const user = await this.findUserRecord({ username: claims.username })
        return !user || this.passwordFingerprint(user) !== claims.pv
      }
      if (claims.password) {
        return !(await this.findUserRecord({ password: claims.password }))
      }
    } catch (error) {
      logger.error('Could not check whether the password changed:', error.message)
      return true
    }
    return false
  }

  isTokenRevoked = (token) => !!token && this.revoked.isRevoked(token)

  /**
   * Ends the validity of a token before it expires (logout).
   * @param {string} token
   */
  revokeToken = (token) => {
    const decoded = jwt.decode(token)
    this.revoked.revoke(token, _.get(decoded, 'exp', 0) * 1000)
  }

  getUserFromToken = async (req) => {
    try {
      const token = this.getTokenFromReq(req)
      if (!token || this.isTokenRevoked(token)) {
        return {}
      }
      const decoded = jwt.verify(token, this.options.auth.secret)
      if (!_.get(decoded, 'username', false) || await this.passwordChangedSince(decoded)) {
        return {}
      }
      _.set(req, 'session.nodeCmsUser', decoded)
      _.set(req, 'session.nodeCmsJwt', token)
      return decoded
    } catch (error) {
      logger.error('Failed to get user from token: ', error.message)
      return {}
    }
  }

  checkSessionData = (req) => {
    const session = _.get(req, 'session', false)
    if (!session) {
      throw new Error('session not found')
    }
    if (!_.get(session, 'nodeCmsJwt', false)) {
      throw new Error('jwt not found')
    }
    if (!_.get(session, 'nodeCmsUser', false)) {
      throw new Error('user not found')
    }
    if (!_.get(session, 'nodeCmsUser.group', false)) {
      throw new Error('user group not found')
    }
    const expiredAt = _.get(session, 'nodeCmsUser.expiredAt', false)
    if (!expiredAt || !_.isNumber(expiredAt)) {
      throw new Error('expiredAt is not a number')
    }
    if (expiredAt < Date.now()) {
      throw new Error('jwt expired')
    }
  }

  verifyToken = async (req, res, next = false) => {
    if (this.isTokenRevoked(this.getTokenFromReq(req))) {
      // logged out: whatever session data is left must not authenticate this request
      delete _.get(req, 'session', {}).nodeCmsJwt
      delete _.get(req, 'session', {}).nodeCmsUser
      if (!next) {
        return
      }
      return res.status(403).json({message: 'Invalid Token'})
    }
    if (_.get(req, 'cookies.nodeCmsJwt', false) && !_.get(req, 'session.nodeCmsUser', false)) {
      await this.getUserFromToken(req)
    }
    if (await this.userPasswordChanged(req, res)) {
      this.onGetLogout(req, res, next)
      return 'userLoggedOut'
    }
    try {
      this.checkSessionData(req)
    } catch (error) {
      logger.warn('Request refused (token):', error.message)
      if (!next) {
        return
      } else {
        return res.status(403).json({})
      }
    }
    const token = this.getTokenFromReq(req)
    if (!token) {
      return res.status(401).json({message: 'A token is required for authentication'})
    }
    try {
      const decoded = jwt.verify(token, this.options.auth.secret)
      return next ? next() : decoded
    } catch (error) {
      logger.warn('Request refused (token):', error.message)
      return res.status(403).json({message: 'Invalid Token'})
    }
  }

  verifyBasicAuth = (req, res, next = false) => {
    // logger.warn(`verifyBasicAuth - ${req.originalUrl}`)
    basicAuth(async (username, password, callback) => {
      const {error, result} = await this.authenticate(username, password, req)
      if (error && (error.code === 500 || error.code === 429)) {
        if (error.retryAfter) {
          res.set('Retry-After', String(error.retryAfter))
        }
        return res.status(error.code).send(error)
      }
      callback(error, result)
    })(req, res, next)
  }

  userPasswordChanged = async (req) => {
    const sessionUser = _.get(req, 'session.nodeCmsUser', false)
    if (!sessionUser || !(sessionUser.pv || sessionUser.password)) {
      return false
    }
    if (await this.passwordChangedSince(sessionUser)) {
      logger.error('The password of the current user changed, will disconnect current user', req.originalUrl)
      return true
    }
    return false
  }

  authenticateJwt = async (username, password, req, res) => {
    return await this.authenticate(username, password, req, res, true)
  }

  lockedError = (username, ip, retryAfter) => {
    if (this.security.genericLockout) {
      return { code: 429, message: 'Too many failed attempts, try again later', retryAfter }
    }
    const duration = Dayjs(Date.now() + retryAfter * 1000).fromNow(true)
    return { code: 500, message: `user (${username}) from ip (${ip}) is blocked for ${duration}`, retryAfter }
  }

  authenticate = async (username, password, req, res, isJwt = false) => {
    let ip
    if (req && !_.isFunction(req)) {
      // req.ip honours the express 'trust proxy' setting; the raw header is client-controlled
      ip = req.ip || _.get(req, 'connection.remoteAddress')
    }
    if (!_.isString(username) || !_.isString(password) || !username) {
      return {error: notAuthenticatedResponse}
    }
    if (this.limiter) {
      const state = this.limiter.check(username, ip)
      if (state.blocked) {
        return { error: this.lockedError(username, ip, state.retryAfter) }
      }
    }
    const scheme = this.security.passwordHash
    let user
    try {
      user = await this.findUserRecord({ username })
    } catch (error) {
      logger.error('authenticate - could not read the user:', error.message)
    }
    const fail = () => {
      if (this.limiter) {
        this.limiter.fail(username, ip, crypto.createHash('sha256').update(password).digest('hex'))
      }
      return {error: notAuthenticatedResponse}
    }
    if (!user) {
      // same work as for an existing account, so timing does not tell whether the account exists
      await burnHash(password, scheme)
      return fail()
    }
    const verified = await this.verifyPassword(user, username, password)
    if (!verified.ok) {
      return fail()
    }
    if (!this.security.localAdmin && username === 'localAdmin' && password === 'localAdmin') {
      // the account is disabled: an existing record must not keep working with its published password
      logger.warn('The built-in localAdmin account is disabled (security.localAdmin), its default password was refused')
      return fail()
    }
    if (this.limiter) {
      this.limiter.success(username, ip)
    }
    if (needsRehash(verified, scheme)) {
      await this.rehashPassword(user, password)
    }
    // rehashPassword changed the record: work with what is stored now
    user = (await this.findUserRecord({ _id: user._id })) || user
    if (isJwt) {
      if (!_.get(this.options, 'auth.secret', false)) {
        throw new Error('No auth.secret in config')
      }
      const hide = this.security.hideCredentials
      const pv = this.passwordFingerprint(user)
      user.group = await this.groups.find(_.get(user, 'group', false))
      user.expiredAt = this.getDateTomorrow()
      const claims = {
        username: user.username,
        theme: user.theme,
        expiredAt: user.expiredAt,
        group: {
          name: _.get(user, 'group.name', false),
          _id: _.get(user, 'group._id', false)
        }
      }
      if (hide) {
        claims.pv = pv
      } else {
        claims.password = user.password
      }
      user.token = jwt.sign(claims, this.options.auth.secret, {expiresIn: '24h'})
      if (res) {
        res.cookie('nodeCmsJwt', user.token, { maxAge: this.jwtTokenExpiresIn, ...this.cookieOptions(req) })
      }
      return {result: hide ? { ..._.omit(user, ['password', 'salt']), pv } : user}
    }
    return {result: this.security.hideCredentials ? { ..._.omit(user, ['password', 'salt']), pv: this.passwordFingerprint(user) } : user}
  }

  /**
   * Replaces a hash by one in the configured scheme after a successful login. The write goes to the store directly:
   * it must not change _updatedAt (the admin app logs a user out when it changes) and must not hash the hash again.
   * It only applies when the stored hash is still the one that was verified, so a password changed in between wins.
   * @param {object} user - stored record that was verified
   * @param {string} password - the verified password
   */
  rehashPassword = async (user, password) => {
    try {
      const { salt, hash } = await hashValue(password, { scheme: this.security.passwordHash })
      const current = await this.users.json.find(user._id)
      if (current && current.password === user.password && current.salt === user.salt) {
        const result = await this.users.json.update(user._id, { ...current, password: hash, salt })
        if (result && result.error) {
          logger.debug('Password hash not upgraded:', result.error)
        }
      }
    } catch (error) {
      logger.error('Could not upgrade the password hash:', error.message)
    }
  }

  updateAccessControl = async (mode, groups, resources, actions) => {
    if (!_.isArray(groups)) {
      groups = [groups]
    }
    if (!_.isArray(resources)) {
      resources = [resources]
    }
    if (_.isFunction(actions)) {
      actions = ['create', 'read', 'update', 'remove']
    } else if (!_.isArray(actions)) {
      actions = [actions]
    }
    for (const groupName of groups) {
      try {
        const group = await this.groups.find({ name: groupName })
        _.each(actions, (actionName) => {
          let groupResources = group[actionName] || []
          _.each(resources, (resource)=> {
            if (mode === 'allow' && groupResources.indexOf(resource) === -1) {
              groupResources.push(resource)
            } else if (mode === 'deny') {
              groupResources = groupResources.filter(item => item !== resource)
            }
          })
          group[actionName] = groupResources
        })
        return await this.groups.update(group._id, group)
      } catch (error) {
        logger.error('Error in updateAccessControl:', error)
      }
    }
  }

  onGetLogout = async (req, res, next) => {
    try {
      // the token is dead from now on, even for someone who kept a copy of it
      const token = this.getTokenFromReq(req)
      if (token) {
        this.revokeToken(token)
      }
      const hadJwt = !_.get(this.options, 'disableJwtLogin', false) && !!_.get(req, 'session.nodeCmsJwt', false)
      await destroy(req)
      if (hadJwt) {
        res.clearCookie('nodeCmsJwt', _.omit(this.cookieOptions(req), 'maxAge'))
        return res.status(200).send({ message: 'done', userLoggedOut: true })
      }
      return res.status(200).send({ message: 'done' })
    } catch (error) {
      next(error)
    }
  }

  dispatchAuth = async (req, res, next) => {
    if (!_.get(this.options, 'disableJwtLogin', false)) {
      await this.verifyToken(req, res, next)
    } else if (!_.get(this.options, 'disableAuthentication', false)) {
      await this.verifyBasicAuth(req, res, next)
    } else {
      next()
    }
  }

  /**
   * Checks the credentials of a login request and opens the session.
   * The session id is replaced at login, so an id planted before login (session fixation) is worthless afterwards.
   * @param {import('express').Request} req - body: { username, password }, both strings
   * @param {import('express').Response} res
   * @returns {Promise<{error?: {code: number, message: string, retryAfter?: number}, result?: object}>}
   */
  performLogin = async (req, res) => {
    const {username, password} = _.get(req, 'body') || {}
    if (!_.isString(username) || !_.isString(password) || !username || !password) {
      return { error: { code: 400, message: 'username and password must be strings' } }
    }
    const {error, result} = await this.authenticateJwt(username, password, req, res)
    if (error) {
      return { error }
    }
    await regenerate(req)
    _.set(req, 'session.nodeCmsUser', result)
    const user = await this.users.find({_id: result._id})
    if (user && user.group) {
      req.session.nodeCmsUser.group = await this.groups.find(user.group)
    }
    _.set(req, 'session.nodeCmsJwt', _.get(req.session, 'nodeCmsUser.token', false))
    return { result: req.session.nodeCmsUser }
  }

  onPostLogin = async (req, res) => {
    logger.info('POST /admin/login called')
    let result
    try {
      const outcome = await this.performLogin(req, res)
      if (outcome.error) {
        logger.warn('Login refused:', outcome.error.message)
        if (outcome.error.retryAfter) {
          res.set('Retry-After', String(outcome.error.retryAfter))
        }
        return res.status(outcome.error.code).json({ error: outcome.error.message || outcome.error })
      }
      result = outcome.result
    } catch (error) {
      logger.error('Error on login:', error.message)
      return res.status(403).json({ error: 'Failed to log in, wrong credentials' })
    }
    res.status(200).json(_.omit(result, ['password']))
  }

  getDateTomorrow = () => {
    const today = new Date()
    return new Date(today.getTime() + this.jwtTokenExpiresIn).getTime()
  }

  authorize = (user, resource, action, isForAttachments, callback) => {
    if (!resource) {
      return callback()
    }
    user = user || {}
    user.group = _.get(user, 'group._id', _.get(user, 'group', false)) || this.anonymousGroup._id
    return this.groups.find(user.group, (error, group) => {
      if (error) {
        return callback(unauthorizedResponse)
      }
      if (this.options.disableAnonymous && (this.anonymousGroup._id === user.group)) {
        return callback(unauthorizedResponse)
      }
      if (isForAttachments && action !== 'read') {
        action = 'attachments'
      }
      if ((group[action] || []).includes(resource.name)) {
        return callback()
      }
      return callback(unauthorizedResponse)
    })
  }

  allow = async (group, resource, actions)  => {
    return await this.updateAccessControl('allow', group, resource, actions)
  }
  deny = async (group, resource, actions) => {
    return await this.updateAccessControl('deny', group, resource, actions)
  }

  initialize = () => {
    this.users = this.cms.resource('_users', schemas._users)
    this.users.before('create', (context) => {
      if (!context.params.object.password) {
        return context.error({
          code: 400,
          message: 'Password must be defined'
        })
      }
      if (!context.params.object.username) {
        return context.error({
          code: 400,
          message: 'Username must be defined'
        })
      }
      return context.next()
    })
    this.users.before('create', this.hashPassword)
    this.users.before('update', this.hashPassword)
    this.users.after('read', this.hidePassword)
    if (this.security.hideCredentials) {
      this.users.after('find', this.hidePassword)
    }
    this.users.after('create', this.hidePassword)
    this.users.after('update', this.hidePassword)
    _.each(schemas._groups, (field)=> {
      if (_.get(field, 'input', false) === 'multiselect') {
        field.source = this._resourceNames
      }
    })
    this.groups = this.cms.resource('_groups', schemas._groups)
    this.settings = this.cms.resource('_settings', schemas._settings)
    // a menu group can have only one icon
    const checkMenuGroups = (context) => {
      const repeated = duplicateMenuGroups(_.get(context, 'params.object.menuGroups'))
      if (repeated.length > 0) {
        return context.error({ code: 400, message: `Each menu group can only have one icon: ${repeated.join(', ')}` })
      }
      return context.next()
    }
    this.settings.before('create', checkMenuGroups)
    this.settings.before('update', checkMenuGroups)
    this.cms.bootstrapFunctions = this.cms.bootstrapFunctions || []
    this.cms.bootstrapFunctions.push(async (callback) => {
      await this.cleanRecord(this.groups, {name: 'admins'})
      await this.cleanRecord(this.groups, {name: 'anonymous'})
      await this.cleanRecord(this.users, {username: 'localAdmin'})
      // Robust group find/create logic
      try {
        let anonGroup = await this.groups.find({ name: 'anonymous' })
        if (!anonGroup || !anonGroup._id) {
          anonGroup = await this.groups.create({
            name: 'anonymous',
            create: [],
            read: [],
            update: [],
            attachments: [],
            remove: []
          })
        }
        this.anonymousGroup = anonGroup
      } catch (error) {
        logger.error('anonymousGroup error', error)
      }
      const adminPermissions = {
        create: this.cms._resourceNames,
        read: this.cms._resourceNames,
        update: this.cms._resourceNames,
        attachments: this.cms._resourceNames,
        remove: this.cms._resourceNames
      }
      try {
        let adminsGroup = await this.groups.find({ name: 'admins' })
        if (!adminsGroup || !adminsGroup._id) {
          adminsGroup = await this.groups.create({name: 'admins', ...adminPermissions, plugins: ADMIN_DEFAULT_PLUGINS})
        } else {
          // admins always get the default plugins; plugins added by hand stay
          adminsGroup = await this.groups.update(adminsGroup._id, {...adminPermissions, plugins: _.union(adminsGroup.plugins || [], ADMIN_DEFAULT_PLUGINS)})
        }
        this.adminsGroup = adminsGroup
      } catch (error) {
        logger.error('adminsGroup error', error)
      }
      try {
        const localAdmin = this.security.localAdmin ? await this.users.find({username: 'localAdmin'}) : undefined
        if (this.security.localAdmin && (!localAdmin || !localAdmin._id)) {
          const localAdminData = {
            username: 'localAdmin',
            password: 'localAdmin',
            group: this.adminsGroup._id
          }
          await this.users.create(localAdminData)
        }
      } catch (error) {
        logger.error('localAdmin error', error)
      }
      await this.warnAboutLocalAdmin()
      // Native async/await replacement for queue(1)
      // If you need to run tasks sequentially, use a for loop with await
      // If you need to run tasks in parallel, use Promise.all
      // Here, just call the callback immediately (no tasks to queue)
      return callback()
    })
    const app = express()
    app.use(bodyParser.json({ limit: this.security.limits.json }))
    if (!_.get(this.options, 'disableJwtLogin', false) || !_.get(this.options, 'disableAuthentication', false)) {
      const routesToAuth = _.get(this.options, 'routesToAuth', [
        '/api/_syslog',
        '/api/system',
        '/admin/resources',
        '/admin/paragraphs',
        '/import',
        '/importFromRemote',
        '/replicator',
        '/resources'
      ])
      app.use(routesToAuth, this.dispatchAuth)
      app.use('/admin/logout', this.onGetLogout)
      app.post('/admin/login', this.onPostLogin)
    }
    this._app.use('/', app)
    return this
  }

}

exports = module.exports = Authentication

