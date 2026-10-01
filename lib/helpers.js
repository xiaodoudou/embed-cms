const _ = require('lodash')
const sift = require('sift')

const pAll = require('p-all')
const logger = require('./logger')
const sanitizeQuery = require('./util/sanitizeQuery')
const { isLocalId } = require('./util/localId')

// largest width or height a client may request for a resized attachment
const MAX_RESIZE_DIMENSION = 8192
const resizeOptionsRegex = /^(([1-9][0-9]{0,4})x([1-9][0-9]{0,4})|(autox([1-9][0-9]{0,4}))|(([1-9][0-9]{0,4})xauto))$/
/*
   * Query regex support: the standard `$regex` operator, case-sensitive unless `$options` contains 'i'
   *
   * @example:
   *   > GET http://localhost:3000/api/articles?query={"enUS.title":{"$regex":"ko"}}
   *   < [{
   *       "_id": "hrtzk23mhpf3vze9yr2ye3vp",
   *       "_createdAt": 1392777154210,
   *       "_updatedAt": 1392802904076,
   *       "_doc": {
   *         "enUS": {
   *           "_id": "hrtzk23mhpf3vze9yr2ye3vp",
   *           "title": "kong"
   *         }
   *       },
   *       "_attachments": []
   *     }]
   */

class Helpers {
  /**
 * Checks if a resize option string is valid.
 * Accepts formats: [number]x[number], autox[number], [number]xauto (max 5 digits)
 * @param {string} resizeOptions
 * @returns {boolean}
 */
  resizeOptionsValid = (resizeOptions) => {
    if (resizeOptions === 'autoxauto') {
      logger.error(`Invalid resize option: '${resizeOptions}', will skip smart cropping`)
      return false
    }
    if (!resizeOptionsRegex.test(resizeOptions)) {
      return false
    }
    // every number in the option is a pixel dimension: cap it so a request cannot ask for gigapixel output
    return _.every(String(resizeOptions).match(/\d+/g), n => Number(n) <= MAX_RESIZE_DIMENSION)
  }
  // More or less deep merge [treats arrays as immutable objects]
  merge = (target, object) => {
    _.each(object, (value, key) => {
      // never let user input reach the prototype chain
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return
      }
      target[key] = (_.isObject(value) && !_.isArray(value)) ? this.merge((target[key] || {}), value) : value
    })
    return target
  }
  // Errors
  duplicateFound (fieldName) {
    return { code: 400, message: `Field '${fieldName}' is duplicated` }
  }
  /**
   * The page of a list: `limit` records from record number page * limit. Everything when there is no positive limit.
   * @param {Array} list
   * @param {{page?: number|string, limit?: number|string}} [options]
   * @returns {Array}
   */
  paginate = (list, options = {}) => {
    const limit = parseInt(options.limit, 10)
    if (!(limit > 0)) {
      return list
    }
    const page = Math.max(parseInt(options.page, 10) || 0, 0)
    return list.slice(page * limit, page * limit + limit)
  }
  filterResults = (context) => {
    const query = context.params.query
    const options = context.params.options || {}
    // If there's no query or it's not an object, no filtering needed
    if (!query || !_.isObject(query) || _.isEmpty(query)) {
      return context.next()
    }
    try {
      // Get the current results from the context
      let results = context._result || []
      // Apply query filtering using sift (query is validated first: no $where etc.)
      const filter = sift(sanitizeQuery(query, { safeRegex: _.get(context, 'resource.cms.security.safeRegex', false) }))
      if (_.isArray(results)) {
        results = results.filter(record => {
          // Apply the filter to the record data (including _doc if present)
          return filter(record._doc ? _.extend({}, record, record._doc) : record)
        })
        results = this.paginate(results, options)
      }
      // Hand the filtered data to the next after hook: ending the chain here would skip every hook registered after
      // this one, hidePassword of _users among them
      context._result = results
      context.next()
    } catch (error) {
      if (_.get(error, 'code') === 400) {
        // a query the CMS does not accept (an unsupported operator...): the client is told, the log does not shout
        logger.debug(`Query refused: ${error.message}`)
      } else {
        logger.error('Error filtering results:', error)
      }
      context.error(error)
    }
  }
  findRecord = async (context) => {
    try {
      context.record = await context.resource.json.find(context.params.id)
      if (_.isUndefined(context.record)) {
        throw { notFound: true, message: `Record with ID ${context.params.id} not found` }
      }
      context.next()
    } catch (error) {
      if (_.get(error, 'notFound', _.get(error, 'error.notFound', false))) {
        return context.error(this.recordNotFoundError(context.resource.name, context.params.id, error))
      }
      return context.error(this.findRecordError(context.resource.name, context.params.id, error))
    }
  }
  // a record another machine made cannot be changed here: refused before any of its files is touched, since the store only
  // refuses the write itself, after the hooks that delete attachment files have run
  refuseForeignRecord = (context) => {
    if (isLocalId(_.get(context, 'record._id'), _.get(context, 'options.cms.mid'))) {
      return context.next()
    }
    return context.error(this.foreignRecordError())
  }
  checkResourceLimits = async (context) => {
    const maxCount = _.get(context.resource, 'options.maxCount', 0)
    if (maxCount === 0) {
      return context.next()
    }
    try {
      const result = await context.resource.list({})
      if (_.get(result, 'length', 0) >= maxCount) {
        context.result(_.first(result))
      } else {
        context.next()
      }
    } catch (error) {
      // end the operation: staying silent would leave the request open and the resource locked for good
      context.error(error)
    }
  }
  enableFirstAsActive = async (context) => {
    const currentId = _.get(context, 'params.id')
    const activeField = _.get(context, 'options.activeField')
    if (_.isUndefined(currentId) || _.isUndefined(activeField)) {
      return context.next()
    }
    const query = { $and: [{ _id: { $eq: currentId } }] }
    _.set(query, `$and[1].${activeField}.$eq`, true)
    try {
      const result = await context.options.resource.list(query)
      if (result.length === 0) {
        return context.next()
      }
      const otherRecords = await context.options.resource.list({ _id: { $not: { $eq: currentId } } }, { page: 0, limit: 1 })
      const firstElement = _.first(otherRecords)
      const data = {_id: firstElement._id}
      _.set(data, `${activeField}`, true)
      await context.options.resource.update(firstElement._id, data)
    } catch (error) {
      logger.error(error)
    }
    context.next()
  }
  leaveOneActive = async (context) => {
    let currentId = _.get(context, 'params.object._id')
    if (_.isUndefined(currentId)) {
      currentId = _.get(context, 'params.id')
    }
    const activeField = _.get(context, 'options.activeField')
    if (_.isUndefined(currentId) || _.isUndefined(activeField) || _.get(context.params.object, `${activeField}`, false) !== true) {
      return context.next()
    }
    const query = { $and: [{ _id: { $not: { $eq: currentId } } }] }
    _.set(query, `$and[1].${activeField}.$eq`, true)
    try {
      const results = await context.options.resource.list(query)
      if (results.length === 0) {
        return context.next()
      }
      let error = null
      for (const item of results) {
        const data = { _id: item._id }
        _.set(data, `${activeField}`, false)
        try {
          await context.options.resource.update(item._id, data)
        } catch (err) {
          logger.error(err)
          error = err
        }
      }
      if (!_.isEmpty(error)) {
        return context.error({ code: 400, message: error })
      }
      await context.options.resource.update(currentId, {})
    } catch (error) {
      logger.error(error)
    }
    context.next()
  }
  checkUniqueFields = async (context) => {
    const uniqueFields = []
    _.each(_.get(context, 'resource.options.schema', []), (field) => {
      if (_.get(field, 'unique', false)) {
        uniqueFields.push(field)
      }
    })
    const record = _.get(context, 'params.object', false)
    const hasToCheck = []
    _.each(uniqueFields, (item) => {
      let locales = []
      if (item.localised) {
        locales = _.get(context, 'resource.options.locales', [])
        locales = _.map(locales, locale => `${item.field}.${locale}`)
      }
      if (locales.length === 0) {
        locales = [item.field]
      }
      _.each(locales, (locale) => {
        if (_.has(record, locale)) {
          hasToCheck.push({
            path: locale,
            value: _.get(record, locale)
          })
        }
      })
    })
    if (hasToCheck.length === 0) {
      return context.next()
    }
    (async () => {
      let duplicatePath = null
      for (const item of hasToCheck) {
        const data = {}
        _.set(data, item.path, item.value)
        try {
          const result = await context.resource.find(data)
          if (result && result._id !== context.params.id) {
            duplicatePath = item.path
            break
          }
        } catch (error) {
          logger.error(error)
        }
      }
      if (duplicatePath) {
        context.error(this.duplicateFound(duplicatePath))
      } else {
        context.next()
      }
    })()
  }
  /**
   * Serializes operations on a resource. The lock is tied to the operation: it is released exactly once,
   * when the operation ends (result or error) or as soon as releaseResource() is called explicitly, so an
   * early exit from the hook chain can never leave the resource locked.
   * @param {Object} context - driver context
   */
  lockResource = (context) => {
    context.on('error', (error) => {
      if (error) {
        const code = _.get(error, 'code')
        if (_.isInteger(code) && code >= 400 && code < 500) {
          // the client asked for something the CMS refuses (a duplicate key, a bad query...) and gets the reason: not a fault
          logger.debug(`Request refused: ${error.message || error}`)
        } else {
          logger.error(error)
        }
      }
      this.releaseResource(context)
    })
    context.on('end', () => this.releaseResource(context))
    const acquire = () => {
      context._lockHeld = true
      context.next()
    }
    if (!context.resource.locked) {
      context.resource.locked = true
      acquire()
    } else {
      context.resource.taskQueue = context.resource.taskQueue || []
      context.resource.taskQueue.push(acquire)
    }
  }
  /**
   * Releases the lock taken by lockResource and hands it to the next queued operation.
   * Safe to call more than once and for contexts that never took the lock.
   * @param {Object} context - driver context
   */
  releaseResource = (context) => {
    if (!context._lockHeld) {
      return
    }
    context._lockHeld = false
    if (!_.isEmpty(context.resource.taskQueue)) {
      const task = context.resource.taskQueue.shift()
      task()
    } else {
      context.resource.locked = false
    }
  }
  findRecordAttachment = (context) => {
    context.attachment = _.find(context.record._attachments, attachment => attachment._id === context.params.aid)
    if (!context.attachment) {
      context.error(this.findAttachmentError(context.resource.name, context.params.id, context.params.aid))
    } else {
      context.next()
    }
  }
  // ?locale=zhCN on a create or update: the plain values of the body are the zhCN values. Localised fields are stored
  // field first ({ title: { zhCN: ... } }), as the admin stores them; every other key of the body is left as it is.
  normalizeSchema = (context) => {
    const locale = _.get(context, 'params.options.locale')
    const locales = context.resource.options.locales
    if (!locale || !(locales && locales.length) || !_.isPlainObject(context.params.object)) {
      return context.next()
    }
    if (!_.includes(locales, locale)) {
      return context.error({ code: 400, message: `Unknown locale ${locale}, this resource has ${locales.join(', ')}` })
    }
    _.each(context.resource.options.schema, item => {
      const localised = _.isUndefined(item.localised) ? true : item.localised
      if (!localised || !_.has(context.params.object, item.field)) {
        return
      }
      const value = _.get(context.params.object, item.field)
      _.unset(context.params.object, item.field)
      _.set(context.params.object, [...item.field.split('.'), locale], value)
    })
    context.next()
  }
  checkRegexPattern = (record, pattern) => {
    const regex = new RegExp(pattern)
    const matches = new Set()
    function checkObject(obj, path = '') {
      if (!obj || !_.isObject(obj)) {
        if (regex.test(path)) {
          // Extract the base path up to the matched pattern
          const match = path.match(regex)
          if (match) {
            // Get only the first two segments of the path
            const segments = match[0].split('.')
            const baseKey = segments.slice(0, 2).join('.')
            matches.add(baseKey)
          }
        }
        return
      }
      if (_.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          checkObject(obj[i], `${path}[${i}]`)
        }
        return
      }
      for (const key in obj) {
        const newPath = path ? `${path}.${key}` : key
        checkObject(obj[key], newPath)
      }
    }
    checkObject(record)
    return Array.from(matches)
  }
  getDependencyItems = async (context) => {
    try {
      if (_.isEmpty(this.resolveMap)) {
        return context.next()
      }
      await pAll(_.map(this.resolveMap, (item, key) => {
        return async () => {
          const result = await item.list()
          context.dependencyMap = context.dependencyMap || {}
          context.dependencyMap[key] = context.dependencyMap[key] || {}
          context.dependencyMap[key] = _.keyBy(result, item => item._id)
        }
      }))
      _.each(context.dependencyMap, (list, key) => {
        const resource = this.resolveMap[key]
        if (resource) {
          const schema = _.cloneDeep(resource.options.schema)
          _.each(list, item => {
            this.injectDependencyByItem(item, context.dependencyMap, schema, this.options)
          })
        }
      })
      return context.next()
    } catch (error) {
      logger.error('Error in getDependencyItems:', error)
      context.error(error)
    }
  }
  injectDependency = (item, dependencyMap, options, resolveMap) => {
    if (_.isEmpty(resolveMap)) {
      return item
    }
    const schema = JSON.parse(JSON.stringify(options.schema))
    const res = this.injectDependencyByItem(item, dependencyMap, schema, options)
    // NOTE: Handles relations in paragraphs
    _.each(options._relations, (relation, regex)=> {
      const matches = this.checkRegexPattern(res, regex)
      _.each(matches, (match)=> {
        const foundRecord = _.find(_.get(dependencyMap, relation.source, []), {_id: _.get(res, match, '??')})
        if (foundRecord) {
          _.set(res, match, foundRecord)
          // logger.warn(`${match} has been set in record`)
        }
      })
    })
    return res
  }
  setValueInItem = (item, dependencyMap, field, fieldKey) => {
    const value = _.get(item, fieldKey)
    if (_.isUndefined(value)) {
      return
    } else if (field.input === 'select') {
      return _.set(item, fieldKey, dependencyMap[field.source][value])
    } else if (field.input === 'multiselect') {
      return _.set(item, fieldKey, _.map(value, id => dependencyMap[field.source][id]))
    }
  }
  injectDependencyByItem = (item, dependencyMap, schema, options) => {
    _.each(schema, (field) => {
      if (!_.includes(['select', 'multiselect'], field.input) ||
      !_.isString(field.source) ||
      !_.includes(_.keys(dependencyMap), field.source)) {
        return
      }
      if (options.locales && (field.localised !== false)) {
        field.locales = options.locales
      }
      if (_.isEmpty(field.locales)) {
        this.setValueInItem(item, dependencyMap, field, field.field)
      } else {
        _.each(field.locales, (locale) => {
          this.setValueInItem(item, dependencyMap, field, `${field.field}.${locale}`)
        })
      }
    })
    return item
  }
  isOSSField = (field) => {
    return _.get(field, 'options.method', 'disk') === 'oss' && _.has(field, 'options.oss.accessKeyId')
  }
  queryToLog = (query) => {
    return _.isString(query) ? query : JSON.stringify(query)
  }
  listRecordError (resource, query) {
    return { code: 500, message: `list resource (${this.queryToLog(query)}) error in resource (${resource})` }
  }
  recordNotFoundError (resource, query) {
    return { code: 404, message: `record (${this.queryToLog(query)}) not found in resource (${resource}) error` }
  }
  findRecordError (resource, query) {
    return { code: 500, message: `record (${this.queryToLog(query)}) not found in resource (${resource}) error` }
  }
  updateRecordError (resource, id) {
    return { code: 500, message: `record (${id}) update in resource (${resource}) error` }
  }
  // a record another machine made cannot be changed here: the person is told why, with a 403 and not a generic 500
  foreignRecordError () {
    return { code: 403, message: 'Can\'t modify foreign records' }
  }
  removeRecordError (resource, id) {
    return { code: 500, message: `remove record (${id}) in resource (${resource}) error` }
  }
  removeAttachmentError (resource, id, aid) {
    return { code: 500, message: `record (${id}) remove attachment (${aid}) in resource (${resource}) error` }
  }
  findAttachmentError (resource, id, aid) {
    return { code: 404, message: `record (${id}) find attachment (${aid}) in resource (${resource}) error` }
  }
  createAttachmentError (resource, id) {
    return { code: 500, message: `record (${id}) create attachment in resource (${resource}) error` }
  }
}
// Export a new instance of the Helpers class
module.exports = new Helpers()
