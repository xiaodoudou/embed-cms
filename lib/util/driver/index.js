/**
 * @fileoverview Lightweight API driver for building method-based APIs with hooks and middleware
 * Contains the Context and Driver classes in a single file
 */
const EventEmitter = require('events')
const { pipeline } = require('stream/promises')
const _ = require('lodash')
const ImageOptimization = require('../imageOptimization')
const pAll = require('p-all')
const h = require('../../helpers')
const fs = require('fs-extra')
const path = require('path')
const logger = require('../../logger')
const { isLocalId } = require('../localId')

/**
 * @typedef {Object} ResourceAPIContext
 * @property {Object} params - Method parameters
 * @property {Object} resource - The resource instance
 * @property {Object} methods - Reference to other API methods
 * @property {Function} next - Continue to next middleware/hook
 * @property {Function} result - Set the result value
 * @property {Function} error - Set an error
 * @property {Function} end - End execution
 */

// =============================================================================
// Context Class
// =============================================================================

/**
 * Context object that provides execution context for driver methods
 * Contains parameters, state management, and the events of the pipeline ('next', 'result', 'error', 'end'): a hook may
 * listen to them with on(), as lockResource does to release the resource whatever way the operation ends.
 * @class Context
 */
class Context extends EventEmitter {
  /**
   * Creates a new Context instance
   * @param {Object} params - Method parameters
   * @param {Object} endpoint - Method endpoint definition
   * @param {Driver} driver - Driver instance
   */
  constructor(params, endpoint, driver) {
    super()
    this.options = driver.options
    this.params = params
    this.endpoint = endpoint
    this.driver = driver
  }

  /**
   * Fire 'next' event to continue pipeline execution
   */
  next() {
    this.emit('next', this)
  }

  /**
   * Set result and interrupt chain processing
   * @param {*} result - The result value to set
   * @returns {Context} Returns this context for chaining
   */
  result(result) {
    this._result = result
    this.emit('result', result, this)
    this.end()
    return this
  }

  /**
   * Set error and interrupt chain processing
   * @param {Error|string} error - The error to set
   * @returns {Context} Returns this context for chaining
   */
  error(error) {
    this._error = error
    // an EventEmitter throws an 'error' nobody listens to: here the error is the outcome of the operation, kept for end()
    if (this.listenerCount('error') > 0) {
      this.emit('error', error, this)
    }
    this.end()
    return this
  }

  /**
   * End context execution and remove all event listeners
   */
  end() {
    this.emit('end', this)
    this.removeAllListeners()
  }

  /**
   * Get the current result value
   * @returns {*} The result value or null if undefined
   */
  getResult() {
    return (this._result === void 0) ? null : this._result
  }

  /**
   * Get the current error value
   * @returns {Error|string|null} The error value or null if undefined
   */
  getError() {
    return (this._error === void 0) ? null : this._error
  }
}

/**
 * Runs a pipeline step. Steps are often async functions: a throw or a rejection that nobody catches would leave the
 * caller's promise pending forever (and surface as an unhandled rejection), so it ends the call with that error.
 * @param {Function} step
 * @param {Context} context
 */
function runStep (step, context) {
  try {
    const returned = step(context)
    if (returned && _.isFunction(returned.then)) {
      returned.then(undefined, (error) => context.error(error))
    }
  } catch (error) {
    context.error(error)
  }
}

// =============================================================================
// Driver Class (main driver functionality)
// =============================================================================

/**
 * Lightweight API driver that provides method definition, middleware, and hook support
 * @class Driver
 */
class Driver {
  /**
   * Creates a new Driver instance
   * @param {string} name - The name of the driver
   * @param {Object} [options] - Optional configuration options
   *
   * @example
   * const driver = new Driver('myAPI', { timeout: 5000 })
   *
   * // Can also be called without 'new'
   * const driver = Driver('myAPI', { timeout: 5000 })
   */
  constructor(name, options) {
    this.options = options
    this.name = name
    this._middleware = []
    this._methods = {}
    this._hooks = {
      before: [],
      after: []
    }
  }

  /**
   * Get or create a method definition
   * @private
   * @param {string} name - The method name
   * @returns {Object} The method definition object
   */
  _method(name) {
    this._methods[name] = this._methods[name] || {
      name,
      before: [],
      invoke: null,
      after: [],
      params: undefined
    }
    return this._methods[name]
  }

  /**
   * Add middleware to the driver that runs before all methods
   * @param {Function} middleware - Middleware function that receives a context parameter
   * @returns {Driver} Returns this driver instance for chaining
   * @throws {Error} If middleware is not a function
   *
   * @example
   * driver.use((context) => {
   *   logger.info('Before method:', context.method.name)
   *   context.next()
   * })
   */
  use(middleware) {
    if (!_.isFunction(middleware)) {
      throw new Error('`use` expects a function')
    }
    this._middleware.push(middleware)
    return this
  }

  /**
   * Define a new driver method with optional parameter validation
   * @param {string} name - The method name
   * @param {string[]|Function} [params] - Parameter names array (optional parameters end with '?')
   * @param {Function} fn - The method implementation function that receives a context parameter
   * @returns {Driver} Returns this driver instance for chaining
   * @throws {Error} If method name is not defined or function is not provided
   *
   * @example
   * // Simple method without parameter validation
   * driver.define('list', function(context) {
   *   // Implementation
   *   context.result(data)
   * })
   *
   * // Method with parameter validation
   * driver.define('find', ['id', 'options?'], function(context) {
   *   const { id, options } = context.params
   *   // Implementation
   *   context.result(foundItem)
   * })
   */
  define() {
    const args = Array.prototype.slice.call(arguments)
    if (!_.isString(args[0])) {
      throw new Error('method name is not defined')
    }
    const name = args.shift()
    if (_.isArray(args[0])) {
      this._method(name).params = args.shift()
    }
    if (!_.isFunction(args[0])) {
      throw new Error('method body is not defined')
    } else {
      this._method(name).invoke = args[0]
    }
    return this
  }

  /**
   * Add a before hook for a specific method
   * @param {string} name - The method name to add the hook to
   * @param {Function} fn - Hook function that receives a context parameter
   * @returns {Driver} Returns this driver instance for chaining
   * @throws {Error} If hook is not a function
   *
   * @example
   * driver.before('find', (context) => {
   *   logger.info('About to find:', context.params.id)
   *   context.next()
   * })
   */
  before(name, fn) {
    if (!_.isFunction(fn)) {
      throw new Error('`hook` expects a function')
    }
    this._method(name).before.push(fn)
    return this
  }

  /**
   * Add an after hook for a specific method
   * @param {string} name - The method name to add the hook to
   * @param {Function} fn - Hook function that receives a context parameter
   * @returns {Driver} Returns this driver instance for chaining
   * @throws {Error} If hook is not a function
   *
   * @example
   * driver.after('find', (context) => {
   *   logger.info('Found result:', context.getResult())
   *   context.next()
   * })
   */
  after(name, fn) {
    if (!_.isFunction(fn)) {
      throw new Error('`hook` expects a function')
    }
    this._method(name).after.unshift(fn)
    return this
  }

  /**
   * Add a before hook that runs before all methods
   * @param {Function} fn - Hook function that receives a context parameter
   * @returns {Driver} Returns this driver instance for chaining
   * @throws {Error} If hook is not a function
   *
   * @example
   * driver.beforeAll((context) => {
   *   logger.info('Before any method execution')
   *   context.next()
   * })
   */
  beforeAll(fn) {
    if (!_.isFunction(fn)) {
      throw new Error('`hook` expects a function')
    }
    this._hooks.before.push(fn)
    return this
  }

  /**
   * Add an after hook that runs after all methods
   * @param {Function} fn - Hook function that receives a context parameter
   * @returns {Driver} Returns this driver instance for chaining
   * @throws {Error} If hook is not a function
   *
   * @example
   * driver.afterAll((context) => {
   *   logger.info('After any method execution')
   *   context.next()
   * })
   */
  afterAll(fn) {
    if (!_.isFunction(fn)) {
      throw new Error('`hook` expects a function')
    }
    this._hooks.after.unshift(fn)
    return this
  }

  /**
   * Build the final API object from the driver configuration
   * Creates executable methods with full middleware and hook pipeline
   * @returns {Object} The built API object with all defined methods
   *
   * @example
   * const api = driver.build()
   *
   * // Use the built API
   * const result = await api.find('user-123')
   *
   * // Or with callback
   * api.find('user-123', (error, result) => {
   *   if (error) throw error
   *   logger.info(result)
   * })
   */
  build() {
    const api = {}
    const self = this
    const hooks = {
      middleware: [],
      beforeAll: [],
      before: {},
      after: {},
      afterAll: []
    }
    /**
     * Add runtime middleware to the built API
     * @param {Function} fn - Middleware function
     */
    api.use = function (fn) {
      hooks.middleware.push(fn)
    }
    /**
     * Add runtime before hook to a specific method
     * @param {string} name - Method name
     * @param {Function} fn - Hook function
     */
    api.before = function (name, fn) {
      hooks.before[name] = hooks.before[name] || []
      hooks.before[name].push(fn)
    }
    /**
     * Add runtime after hook to a specific method
     * @param {string} name - Method name
     * @param {Function} fn - Hook function
     */
    api.after = function (name, fn) {
      hooks.after[name] = hooks.after[name] || []
      hooks.after[name].unshift(fn)
    }
    /**
     * Add runtime before hook that runs before all methods
     * @param {Function} fn - Hook function
     */
    api.beforeAll = function (fn) {
      hooks.beforeAll.push(fn)
    }
    /**
     * Add runtime after hook that runs after all methods
     * @param {Function} fn - Hook function
     */
    api.afterAll = function (fn) {
      hooks.afterAll.unshift(fn)
    }
    // Build each defined method
    _.each(this._methods, (method, name) => {
      if (!method.invoke) {
        return
      }
      /**
       * Generated API method
       * @param {...*} args - Method arguments (last can be callback function)
       * @returns {Promise} Promise that resolves with method result
       */
      api[name] = function () {
        return new Promise((resolve, reject) => {
          const args = Array.prototype.slice.call(arguments)
          let params = {}
          let callback
          // Extract callback if provided
          if (_.isFunction(args[args.length - 1])) {
            const func = args.pop()
            callback = (error, result) => {
              if (error) {
                reject(error)
              } else {
                resolve(result)
              }
              func(error, result)
            }
          } else {
            callback = (error, result) => {
              if (error) {
                reject(error)
              } else {
                resolve(result)
              }
            }
          }
          // Validate parameters if defined
          if (method.params) {
            const missing = _.find(method.params, (param, index) => {
              let optional = false
              if (param.indexOf('?') > -1) {
                optional = true
                param = param.split('?')[0]
              }
              const value = args[index]
              if (_.isUndefined(value)) {
                if (optional !== true) {
                  return true
                }
              }
              params[param] = value
              return false
            })
            if (missing) {
              callback(`Parameter [${missing}] is missing`)
              return
            }
          } else {
            params = args
          }
          // Build execution pipeline
          const pipe = [].concat(
            self._middleware,
            hooks.middleware,
            self._hooks.before,
            hooks.beforeAll,
            hooks.before[name] || [],
            method.before,
            method.invoke
          )
          let context = new Context(params, method, self)
          context.methods = api
          let index = 0
          // Handle pipeline progression
          context.on('next', () => {
            index++
            if (pipe[index]) {
              runStep(pipe[index], context)
            } else {
              context.end()
            }
          })
          // Handle pipeline completion
          context.on('end', () => {
            if (context.getError()) {
              return callback(context.getError(), context.getResult())
            }
            // Execute after hooks
            const afterHooks = [].concat(
              method.after,
              hooks.after[name] || [],
              hooks.afterAll,
              self._hooks.after
            )
            if (afterHooks.length) {
              const error = context.getError()
              const result = context.getResult()
              context = new Context(params, method, self)
              context._error = error
              context._result = result
              index = 0
              context.on('next', () => {
                index++
                if (afterHooks[index]) {
                  runStep(afterHooks[index], context)
                } else {
                  context.end()
                }
              })
              context.on('end', () => {
                callback(context.getError(), context.getResult())
              })
              runStep(afterHooks[index], context)
            } else {
              callback(context.getError(), context.getResult())
            }
          })
          // Start pipeline execution
          runStep(pipe[index], context)
        })
      }
    })
    return api
  }

  /**
   * Static method: Read records as a stream with filtering
   * @static
   * @param {Object} resource - The resource instance
   * @param {Object} [query] - Query parameters
   * @param {Object} [options] - Options
   * @returns {Promise<ReadableStream>} Stream of records
   */
  static async read(resource, query, options) {
    return resource.read(query, options)
  }

  /**
   * Static method: List all records matching the query
   * @static
   * @param {Object} resource - The resource instance
   * @param {Object} [query] - MongoDB-style query object
   * @param {Object} [options] - Query options
   * @returns {Promise<Array<Object>>} Array of matching records
   */
  static async list(resource, query, options) {
    return resource.list(query, options)
  }

  /**
   * Static method: Find a single record by ID or query
   * @static
   * @param {Object} resource - The resource instance
   * @param {string|Object} query - Record ID or query object
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>} The matching record
   */
  static async find(resource, query, options) {
    return resource.find(query, options)
  }

  /**
   * Static method: Check if a record exists
   * @static
   * @param {Object} resource - The resource instance
   * @param {string|Object} query - Record ID or query object
   * @returns {Promise<boolean>} True if record exists
   */
  static async exists(resource, query) {
    return resource.exists(query)
  }

  /**
   * Static method: Create a new record
   * @static
   * @param {Object} resource - The resource instance
   * @param {Object} object - Record data to create
   * @param {Object} [options] - Creation options
   * @returns {Promise<Object>} The created record
   */
  static async create(resource, object, options) {
    return resource.create(object, options)
  }

  /**
   * Static method: Update an existing record
   * @static
   * @param {Object} resource - The resource instance
   * @param {string} id - Record ID
   * @param {Object} object - Updated record data
   * @param {Object} [options] - Update options
   * @returns {Promise<Object>} The updated record
   */
  static async update(resource, id, object, options) {
    return resource.update(id, object, options)
  }

  /**
   * Static method: Remove a record
   * @static
   * @param {Object} resource - The resource instance
   * @param {string} id - Record ID
   * @returns {Promise<Object>} The removed record
   */
  static async remove(resource, id) {
    return resource.remove(id)
  }

  /**
   * Static method: Create an attachment for a record
   * @static
   * @param {Object} resource - The resource instance
   * @param {string} id - Record ID
   * @param {Object} attachmentData - Attachment data
   * @returns {Promise<Object>} The created attachment
   */
  static async createAttachment(resource, id, attachmentData) {
    return resource.createAttachment(id, attachmentData)
  }

  /**
   * Static method: Update an attachment
   * @static
   * @param {Object} resource - The resource instance
   * @param {string} id - Record ID
   * @param {string} aid - Attachment ID
   * @param {Object} object - Updated attachment data
   * @returns {Promise<Object>} The updated attachment
   */
  static async updateAttachment(resource, id, aid, object) {
    return resource.updateAttachment(id, aid, object)
  }

  /**
   * Static method: Find a file by attachment ID
   * @static
   * @param {Object} resource - The resource instance
   * @param {string} aid - Attachment ID
   * @returns {Promise<ReadableStream>} The file stream
   */
  static async findFile(resource, aid) {
    return resource.findFile(aid)
  }

  /**
   * Static method: Find an attachment by record and attachment ID
   * @static
   * @param {Object} resource - The resource instance
   * @param {string} id - Record ID
   * @param {string} aid - Attachment ID
   * @param {Object} [opts] - Optional options i.e {resize: '100xauto'}
   * @returns {Promise<Object>} The attachment with stream
   */
  static async findAttachment(resource, id, aid, opts = false) {
    return resource.findAttachment(id, aid, opts)
  }

  /**
   * Static method: Remove an attachment
   * @static
   * @param {Object} resource - The resource instance
   * @param {string} id - Record ID
   * @param {string} aid - Attachment ID
   * @returns {Promise<boolean>} True if removal was successful
   */
  static async removeAttachment(resource, id, aid) {
    return resource.removeAttachment(id, aid)
  }

  /**
   * Static method: Clean unused attachments
   * @static
   * @param {Object} resource - The resource instance
   * @returns {Promise<boolean>} True if cleanup was successful
   */
  static async cleanAttachment(resource) {
    return resource.cleanAttachment()
  }

  /**
   * Clean all cached versions of an attachment
   * @static
   * @param {Object} resource - The resource instance
   * @param {string} attachmentId - The attachment ID
   * @returns {Promise} Promise that resolves when cleanup is complete
   */
  static async cleanAttachmentCache(resource, attachmentId) {
    const aidList = await resource.file.list()
    const cachedVersions = _.filter(aidList, aid =>
      aid.startsWith(`${attachmentId}-`) && aid !== attachmentId
    )
    if (cachedVersions.length === 0) {
      return
    }
    // logger.info(`Cleaning ${cachedVersions.length} cached versions for attachment ${attachmentId}`)
    const cachedVersionsRemoved = []
    await pAll(_.map(cachedVersions, cacheId => {
      return async () => {
        try {
          await resource.file.remove(cacheId)
          cachedVersionsRemoved.push(cacheId)
        } catch (error) {
          logger.error(`Failed to remove cached version ${cacheId}:`, error)
        }
      }
    }), {concurrency: 5})
    // .then(() => {
    //   if (cachedVersionsRemoved.length > 0) {
    //     logger.info(`Removed cached versions: ${cachedVersionsRemoved.join(', ')}`)
    //   }
    // })
  }

  /**
   * Read operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _readImpl(context) {
    const mid = context.options.cms.mid
    // With a query, limit/page must apply to the *filtered* set. The store limits before the after('read') filter
    // runs, so they are only pushed down when there is nothing to filter: then the page is the records from
    // page * limit, and the store can stop after page * limit + limit of them.
    const hasQuery = _.isObject(context.params.query) && !_.isEmpty(context.params.query)
    const options = context.params.options
    const limit = parseInt(_.get(options, 'limit'), 10)
    const skip = !hasQuery && limit > 0 ? Math.max(parseInt(_.get(options, 'page'), 10) || 0, 0) * limit : 0
    const readOptions = hasQuery ? _.omit(options, ['limit', 'page']) : (skip ? { ...options, limit: skip + limit } : options)
    let results = await context.resource.json.read(context.params.query, readOptions)
    if (skip) {
      results = _.isArray(results) ? results.slice(skip) : results
    }
    // Ensure results is always an array of valid objects
    if (!_.isArray(results)) {
      if (results && _.isObject(results) && results._id) {
        results = [results]
      } else {
        results = []
      }
    }
    // Only set _local on objects with _id
    results = _.filter(results, r => _.get(r, '_id', false))
    _.each(results, (record) => {
      record._local = isLocalId(_.get(record, '_id', ''), mid)
    })
    return context.result(results)
  }

  /**
   * List operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _listImpl(context) {
    context.params.options = context.params.options || {}
    let results = await context.methods.read(context.params.query, context.params.options)
    // If results is a collection object (object with only numeric keys), convert to array
    if (results && _.isObject(results) && !_.isArray(results)) {
      // Check if all keys are numeric (like '0', '1', ...)
      const keys = Object.keys(results)
      if (keys.length && keys.every(k => /^\d+$/.test(k))) {
        results = keys.map(k => results[k])
      }
    }
    results = _.filter(results, r => _.get(r, '_id', false))
    // the relations of the records, when the API was asked to resolve resources
    context.results = _.map(results, r => h.injectDependency(r, context.dependencyMap, context.resource.options))
    // Don't throw error for empty results - return empty array instead
    context.result(context.results)
    return context.results
  }

  /**
   * Find operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _findImpl(context) {
    const params = context.params
    if (_.isString(params.query)) {
      try {
        const result = await context.resource.json.find(params.query)
        if (result && _.isObject(result) && result._id) {
          result._local = isLocalId(_.get(result, '_id', ''), context.options.cms.mid)
        }
        return context.result(h.injectDependency(result, context.dependencyMap, context.resource.options))
      } catch (error) {
        return context.error(h.recordNotFoundError(context.resource.name, params.query, error))
      }
    }
    try {
      const results = await context.methods.list(params.query, {...params.options, page: 0, limit: 1})
      if (!results.length) {
        return context.result(null)
      }
      return context.result(results[0])
    } catch (error) {
      return context.error(h.listRecordError(context.resource.name, params.query, error))
    }
  }

  /**
   * Exists operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _existsImpl(context) {
    if (_.isString(context.params.query)) {
      try {
        // the store answers a missing key with undefined: it does not throw
        const found = await context.resource.json.find(context.params.query)
        return context.result(!_.isUndefined(found) && found !== null)
      } catch (error) {
        if (error.notFound) {
          return context.result(false)
        }
        return context.error(h.recordNotFoundError(context.resource.name, context.params.query))
      }
    }
    try {
      const results = await context.methods.list(context.params.query, { page: 0, limit: 1 })
      return context.result(results.length > 0)
    } catch (error) {
      return context.error(h.recordNotFoundError(context.resource.name, context.params.query, error))
    }
  }

  /**
   * Create operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _createImpl(context) {
    try {
      const result = await context.resource.json.create(context.params.object._id, context.params.object)
      h.releaseResource(context)
      if (result) {
        result._local = isLocalId(_.get(result, '_id', ''), context.options.cms.mid)
        return context.result(h.injectDependency(result, context.dependencyMap, context.resource.options))
      } else {
        // Record creation failed, return error or empty result
        return context.error(new Error('Record creation failed or returned undefined'))
      }
    } catch (error) {
      return context.error(error)
    }
  }

  /**
   * Update operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _updateImpl(context) {
    delete context.params.object._id
    delete context.params.object._createdAt
    delete context.params.object._attachments
    context.params.object._updatedAt = Date.now()
    h.merge(context.record, context.params.object)
    try {
      const result = await context.resource.json.update(context.params.id, context.record)
      h.releaseResource(context)
      return context.result(h.injectDependency(result, context.dependencyMap, context.resource.options))
    } catch (error) {
      if (_.get(error, 'code') === 'EFOREIGN') {
        return context.error(h.foreignRecordError())
      }
      return context.error(h.updateRecordError(context.resource.name, context.params.id, error))
    }
  }

  /**
   * Remove operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _removeImpl(context) {
    try {
      const result = await context.resource.json.remove(context.params.id)
      return context.result(result)
    } catch (error) {
      if (_.get(error, 'code') === 'EFOREIGN') {
        return context.error(h.foreignRecordError())
      }
      // a delete that failed is reported: it used to come back as a result, and the record stayed
      logger.error(`Could not remove record ${context.params.id} of ${context.resource.name}:`, error)
      return context.error(h.removeRecordError(context.resource.name, context.params.id, error))
    }
  }

  /**
   * Create attachment operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _createAttachmentImpl(context) {
    const now = Date.now()
    const obj = context.params.object
    const attachment = (context.attachment = {
      _id: context.attachmentId,
      _createdAt: now,
      _updatedAt: now,
      _name: _.get(obj, 'name', ''),
      _contentType: _.get(obj, 'contentType', ''),
      _md5sum: context.md5sum,
      _payload: _.get(obj, 'payload', {}),
      _size: context.size,
      _filename: _.get(obj, 'fields._filename', _.get(obj, 'filename', '')),
      _fields: _.get(obj, 'fields', {})
    })
    if (context.imageMeta) {
      attachment._meta = context.imageMeta
    }
    _.each(['cropOptions', 'imageMap', 'order'], (key) => {
      const val = _.get(obj, key, false)
      if (val) {
        _.set(attachment, key, val)
      }
    })
    try {
      if (_.get(attachment, '_name.length', 0) === 0) {
        throw new Error('missing field name')
      }
      if (_.get(context, 'record', false)) {
        context.record._attachments = _.get(context.record, '_attachments', [])
        context.record._attachments.push(attachment)
        context.record._attachments = _.orderBy(context.record._attachments, ['order'], ['asc'])
        context.record._updatedAt = now
        await context.resource.json.update(context.record._id, context.record)
      }
      h.releaseResource(context)
      return context.result(attachment)
    } catch (error) {
      return context.error(error)
    }
  }

  /**
   * Update attachment operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _updateAttachmentImpl(context) {
    const now = Date.now()
    const obj = context.params.object
    let foundAttachment = false
    const attachmentIndex = _.findIndex(context.record._attachments, {_id: context.params.aid})
    if (attachmentIndex !== -1) {
      foundAttachment = context.record._attachments[attachmentIndex]
      foundAttachment = _.merge(foundAttachment, obj)
      // the areas of a map are replaced, not merged with the old ones (a merge of two lists goes by position: a removed area would stay)
      if (_.has(obj, 'imageMap')) {
        if (obj.imageMap) {
          foundAttachment.imageMap = obj.imageMap
        } else {
          delete foundAttachment.imageMap
        }
      }
      foundAttachment._updatedAt = now
      context.record._attachments[attachmentIndex] = foundAttachment
    }
    context.record._updatedAt = now
    try {
      await context.resource.json.update(context.record._id, context.record)
      h.releaseResource(context)
      return context.result(foundAttachment)
    } catch (error) {
      return context.error(error)
    }
  }

  /**
   * Find file operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static _findFileImpl(context) {
    context.stream = context.resource.file.read(context.params.aid)
    return context.result(context.stream)
  }

  /**
   * Find attachment operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _findAttachmentImpl(context) {
    const field = _.find(context.resource.options.schema, { field: context.attachment._name })
    // the same test as the upload: a field whose method is disk keeps its files on disk, OSS options or not
    if (h.isOSSField(field)) {
      const {stream, size} = await context.resource.cms.oss.getStream(context, field)
      context.attachment._size = size
      context.attachment._oss = true
      const contentType = _.get(context.attachment, '_contentType', 'application/octet-stream')
      const resizeOptions = _.get(context, 'params.opts.resize', false)
      if (resizeOptions && h.resizeOptionsValid(resizeOptions) && _.includes(['image/jpeg', 'image/gif', 'image/png'], contentType)) {
        try {
          const {stream: resizedStream} = await ImageOptimization.resizeAttachment(stream, resizeOptions, contentType)
          context.attachment.stream = resizedStream
        } catch {
          return context.error(h.findAttachmentError(context.resource.name, context.params.id, context.params.aid))
        }
      } else {
        context.attachment.stream = stream
      }
      return context.result(context.attachment)
    }
    const contentType = _.get(context.attachment, '_contentType', 'application/octet-stream')
    const resizeOptions = _.get(context, 'params.opts.resize', false)
    if (resizeOptions && h.resizeOptionsValid(resizeOptions) && _.includes(['image/jpeg', 'image/gif', 'image/png'], contentType)) {
      // Check if smart cropping is requested
      if (_.get(context, 'params.opts.smart', false)) {
        // one smart crop per size (cleanAttachmentCache removes every <aid>-* file, older key formats included)
        const smartCacheKey = `${context.attachment._id}-smart-${resizeOptions}`
        const smartCacheFile = path.join(context.resource.file._dir, smartCacheKey)
        if (fs.existsSync(smartCacheFile)) {
          // Use existing smart crop cache
          context.attachment.stream = context.resource.file.read(smartCacheKey)
          logger.info(`Using cached smart cropped attachment: ${smartCacheKey}`)
        } else {
          // Cache miss - create smart cropped image and save to cache
          logger.info(`Smart crop cache miss for ${smartCacheKey} @ ${smartCacheFile}, creating and caching smart cropped image`)
          try {
            const result = await ImageOptimization.smartCropAttachment(context.resource.file.read(context.attachment._id), resizeOptions)
            // Save smart cropped image to cache
            // the cache is read once it is written in full
            await pipeline(result.stream, context.resource.file.write(smartCacheKey))
            // Read from cache for consistency
            context.attachment.stream = context.resource.file.read(smartCacheKey)
            // Add crop metadata to response
            if (result.cropResult) {
              context.attachment.cropResult = result.cropResult
            }
          } catch (smartCropError) {
            logger.error(`Error smart cropping and caching attachment ${context.attachment._id}:`, smartCropError)
            // Fallback to regular resize if smart crop fails
            try {
              // Create a fresh stream for fallback since the original was consumed
              const freshStream = context.resource.file.read(context.attachment._id)
              const result = await ImageOptimization.resizeAttachment(freshStream, resizeOptions)
              context.attachment.stream = result.stream
            } catch (resizeError) {
              logger.error(`Fallback resize also failed for ${context.attachment._id}:`, resizeError)
              // Final fallback to original attachment - create fresh stream
              context.attachment.stream = context.resource.file.read(context.attachment._id)
            }
          }
        }
      } else {
        // Regular resize with caching
        const cacheKey = `${context.attachment._id}-${resizeOptions}`
        const cacheFile = path.join(context.resource.file._dir, cacheKey)

        if (fs.existsSync(cacheFile)) {
          // Use existing cache
          context.attachment.stream = context.resource.file.read(cacheKey)
          logger.info(`Using cached resized attachment: ${cacheKey}`)
        } else {
          // Cache miss - create resized image and save to cache
          logger.info(`Cache miss for ${cacheKey}, creating and caching resized image`)
          try {
            const result = await ImageOptimization.resizeAttachment(context.resource.file.read(context.attachment._id), resizeOptions)
            // Save resized image to cache
            // the cache is read once it is written in full
            await pipeline(result.stream, context.resource.file.write(cacheKey))
            // Read from cache for consistency
            context.attachment.stream = context.resource.file.read(cacheKey)
          } catch (resizeError) {
            logger.error(`Error resizing and caching attachment ${context.attachment._id}:`, resizeError)
            // Fallback to original attachment if resize fails
            context.attachment.stream = context.resource.file.read(context.attachment._id)
          }
        }
      }
    } else {
      context.attachment.stream = context.resource.file.read(context.attachment._id)
    }
    return context.result(context.attachment)
  }

  /**
   * Remove attachment operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _removeAttachmentImpl(context) {
    context.record._attachments = _.filter(context.record._attachments, attachment => attachment._id !== context.attachment._id)
    context.record._updatedAt = Date.now()
    try {
      // File cleanup (disk or OSS) is handled in the before hook in resource.js
      await context.resource.json.update(context.record._id, context.record)
      h.releaseResource(context)
      return context.result(true)
    } catch (error) {
      logger.error('Error removing attachment:', error)
      return context.error(error)
    }
  }

  /**
   * Clean attachment operation implementation
   * @static
   * @param {Object} context - Execution context
   * @returns {Promise} Promise that resolves when operation completes
   */
  static async _cleanAttachmentImpl(context) {
    try {
      const aidList = await context.resource.file.list()
      const referenced = new Set()
      for (const record of await context.resource.json.read()) {
        _.each(_.get(record, '_attachments'), attachment => referenced.add(attachment._id))
      }
      // the files of the resized and cropped copies are named <attachment id>-<options>: they go with their attachment
      let orphans = _.reject(aidList, aid => referenced.has(aid) || referenced.has(aid.split('-')[0]))
      // a file that was just written may belong to an upload whose record is not saved yet
      const grace = _.get(context, 'options.cms.attachmentCleanupGrace', 5 * 60 * 1000)
      const ages = await Promise.all(_.map(orphans, aid => context.resource.file.age(aid).catch(() => Infinity)))
      orphans = _.filter(orphans, (aid, index) => ages[index] >= grace)
      if (orphans.length > 0) {
        logger.info('removing %s attachments ... ...', orphans.length)
        let count = 0
        await pAll(_.map(orphans, aid => {
          return async () => {
            try {
              await context.resource.file.remove(aid)
              logger.info('removing %s ... ... done (%s/%s)', aid, ++count, orphans.length)
            } catch (error) {
              throw h.removeAttachmentError(context.resource.name, 'unknown', aid, error)
            }
          }
        }), {concurrency: 10})
      }
      return context.result(true)
    } catch (error) {
      return context.error(error)
    }
  }
}

/**
 * Factory function export that maintains backward compatibility
 * Supports both direct instantiation and 'new' keyword usage
 */
module.exports = function(name, options) {
  return new Driver(name, options)
}

// Export the Driver class for direct access
module.exports.Driver = Driver
