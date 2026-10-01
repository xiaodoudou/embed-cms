const _ = require('lodash')
const mime = require('mime-types')
const path = require('path')

const crypto = require('crypto')
const pAll = require('p-all')
const sift = require('sift')
const sanitizeQuery = require('./util/sanitizeQuery')

const toArray = require('stream-to-array')
const FileType = require('./util/fileType')
const { readHead } = require('./util/uploads')

const JStore = require('./db/json_store')
const FStore = require('./db/file_store')
const Driver = require('./util/driver')
const ImageOptimization = require('./util/imageOptimization')
const h = require('./helpers')

const logger = require('./logger')
const imageTypes = ['image/jpeg', 'image/gif', 'image/png']
/**
 * @typedef {Object} CMSRecord
 * @property {string} _id - Unique identifier for the record
 * @property {number} _createdAt - Creation timestamp
 * @property {number} _updatedAt - Last update timestamp
 * @property {number|null} _publishedAt - Published timestamp
 * @property {Array<Attachment>} _attachments - Array of attached files
 * @property {boolean} _local - Whether the record is local to this CMS instance
 */

/**
 * @typedef {Object} Attachment
 * @property {string} _id - Unique identifier for the attachment
 * @property {string} _name - Field name the attachment belongs to
 * @property {string} _filename - Original filename
 * @property {string} _contentType - MIME type of the file
 * @property {string} _md5sum - MD5 hash of the file
 * @property {number} _size - File size in bytes
 * @property {number} _createdAt - Creation timestamp
 * @property {number} _updatedAt - Last update timestamp
 * @property {Object} _fields - Additional fields from upload
 * @property {Object} _payload - Additional payload data
 * @property {ReadableStream} stream - File stream (when reading)
 */

/**
 * @typedef {Object} CreateAttachmentOptions
 * @property {string} name - The field name for the attachment
 * @property {ReadableStream} stream - The file stream
 * @property {Object} fields - Additional fields (e.g., {_filename: 'photo.jpg'})
 * @property {Object} [payload] - Additional payload data
 * @property {Object} [cropOptions] - Image cropping options
 * @property {number} [order] - Display order
 */

/**
 * @typedef {Object} QueryOptions
 * @property {number} [page] - Page number (0-based)
 * @property {number} [limit] - Number of records per page
 * @property {string} [locale] - Locale for localized content
 */

/**
 * @typedef {Object} ImportMap
 * @property {Array<CMSRecord>} create - Records to be created
 * @property {Array<CMSRecord>} update - Records to be updated
 * @property {Array<CMSRecord>} remove - Records to be removed
 */

/**
 * @namespace ResourceAPI
 * @description Resource API Interface - This defines all the methods available when calling api('resourceName')
 */

/**
 * @typedef {Object} CMSRecord
 * @property {string} _id - Unique identifier for the record
 * @property {number} _createdAt - Creation timestamp
 * @property {number} _updatedAt - Last update timestamp
 * @property {number|null} _publishedAt - Published timestamp
 * @property {Array<Attachment>} _attachments - Array of attached files
 * @property {boolean} _local - Whether the record is local to this CMS instance
 */

/**
 * @typedef {Object} Attachment
 * @property {string} _id - Unique identifier for the attachment
 * @property {string} _name - Field name the attachment belongs to
 * @property {string} _filename - Original filename
 * @property {string} _contentType - MIME type of the file
 * @property {string} _md5sum - MD5 hash of the file
 * @property {number} _size - File size in bytes
 * @property {number} _createdAt - Creation timestamp
 * @property {number} _updatedAt - Last update timestamp
 * @property {Object} _fields - Additional fields from upload
 * @property {Object} _payload - Additional payload data
 * @property {ReadableStream} stream - File stream (when reading)
 */

/**
 * @typedef {Object} CreateAttachmentOptions
 * @property {string} name - The field name for the attachment
 * @property {ReadableStream} stream - The file stream
 * @property {Object} fields - Additional fields (e.g., {_filename: 'photo.jpg'})
 * @property {Object} [payload] - Additional payload data
 * @property {Object} [cropOptions] - Image cropping options
 * @property {number} [order] - Display order
 */

/**
 * @typedef {Object} QueryOptions
 * @property {number} [page] - Page number (0-based)
 * @property {number} [limit] - Number of records per page
 * @property {string} [locale] - Locale for localized content
 */

/**
 * @typedef {Object} ImportMap
 * @property {Array<CMSRecord>} create - Records to be created
 * @property {Array<CMSRecord>} update - Records to be updated
 * @property {Array<CMSRecord>} remove - Records to be removed
 */

/**
 * @namespace ResourceAPI
 * @description Resource API Interface - This defines all the methods available when calling api('resourceName')
 */

/**
 * List all records matching the query
 * @function ResourceAPI.list
 * @param {Object} [query] - MongoDB-style query object
 * @param {QueryOptions} [options] - Query options
 * @returns {Promise<Array<CMSRecord>>} Array of matching records
 *
 * @example
 * // Get all records
 * const articles = await api('articles').list()
 *
 * // Get published articles
 * const published = await api('articles').list({ published: true })
 *
 * // Get with pagination
 * const page1 = await api('articles').list({}, { page: 0, limit: 10 })
 */

/**
 * Find a single record by ID or query
 * @function ResourceAPI.find
 * @param {string|Object} query - Record ID or query object
 * @param {QueryOptions} [options] - Query options
 * @returns {Promise<CMSRecord>} The matching record
 * @throws {Error} If record not found
 *
 * @example
 * // Find by ID
 * const article = await api('articles').find('article-id')
 *
 * // Find by query (returns first match)
 * const article = await api('articles').find({ slug: 'my-article' })
 */

/**
 * Check if a record exists
class Resource {
  constructor (name, options, resolveMap, cms) {…}
  clean = (object) => {…}
  isEqual = (updateItem, cmsItem) => {…}
  getBufferFromStream = async (attachmentStream) => {…}
  findRecordWithUniqueKey = (errors, records, uniqueKey, value) => {…}
  convertKeyToId = (value, type, records, name, uniqueKeys, errors) => {…}
  getUniqueKeys = () => {…}
}
 *   stream: fs.createReadStream('photo.jpg'),
 *   fields: { _filename: 'photo.jpg' }
 * })
 */

/**
 * Update an attachment
 * @function ResourceAPI.updateAttachment
 * @param {string} id - The record ID
 * @param {string} attachmentId - The attachment ID
 * @param {Object} data - The updated attachment data
 * @returns {Promise<Attachment>} The updated attachment
 *
 * @example
 * const updated = await api('articles').updateAttachment('record-id', 'attachment-id', {
 *   order: 1,
 *   _payload: { caption: 'Photo caption' }
 * })
 */

/**
 * Find an attachment with its stream
 * @function ResourceAPI.findAttachment
 * @param {string} id - The record ID
 * @param {string} attachmentId - The attachment ID
 * @param {Object} [opts] - Optional options, i.e {resize: '100xauto'}
 * @returns {Promise<Attachment>} The attachment with stream property
 *
 * @example
 * const attachment = await api('articles').findAttachment('record-id', 'attachment-id')
 * attachment.stream.pipe(response) // Stream the file
 */

/**
 * Find a file stream by attachment ID (without record context)
 * @function ResourceAPI.findFile
 * @param {string} attachmentId - The attachment ID
 * @returns {Promise<ReadableStream>} The file stream
 *
 * @example
 * const stream = await api('articles').findFile('attachment-id')
 * stream.pipe(fs.createWriteStream('downloaded-file.jpg'))
 */

/**
 * Remove an attachment from a record
 * @function ResourceAPI.removeAttachment
 * @param {string} id - The record ID
 * @param {string} attachmentId - The attachment ID
 * @returns {Promise<boolean>} True if removed successfully
 *
 * @example
 * await api('articles').removeAttachment('record-id', 'attachment-id')
 */

/**
 * Clean orphaned attachments (files not referenced by any record)
 * @function ResourceAPI.cleanAttachment
 * @returns {Promise<boolean>} True if cleanup completed
 *
 * @example
 * await api('articles').cleanAttachment()
 */

/**
 * Get import mapping for bulk operations
 * @function ResourceAPI.getImportMap
 * @param {Array<Object>} importList - List of records to import
 * @param {Object} [query] - Optional filter query
 * @param {boolean} [checkRequired] - Whether to validate required fields
 * @returns {Promise<ImportMap>} Map of operations (create, update, remove)
 *
 * @example
 * const importMap = await api('articles').getImportMap([
 *   { title: 'Article 1', slug: 'article-1' },
 *   { title: 'Article 2', slug: 'article-2' }
 * ])
 * console.log(`Will create: ${importMap.create.length} records`)
 */

/**
 * Get unique key fields for this resource
 * @function ResourceAPI.getUniqueKeys
 * @returns {Array<string>} Array of unique field names
 *
 * @example
 * const uniqueKeys = api('articles').getUniqueKeys()
 * // Returns: ['slug'] or ['email'] etc.
 */

const defaults = {
  type: 'normal'
}

class RequiredFieldError extends Error {
}

/*
 * Constructor
 *
 * @param {String} name, resource name
 * @param {Object} options, resource/cms options
 *   @param {Object} cms, reference
 *     @param [Array] ns, optional, cms namespace
 *     @param {Function} uuid, UUID generator
 *   @param {Array} locales, optional
 */
class Resource {
  /**
   * Creates a new Resource instance
   * @param {string} name - The name of the resource
   * @param {Object} options - Resource configuration options
   * @param {Object} resolveMap - Map of resolved dependencies
   * @param {Object} cms - CMS instance reference
   */
  constructor (name, options, resolveMap, cms) {
    this.cms = cms
    this.api = this.cms.api()
    this.options = _.extend({}, defaults, options)
    this.name = name
    this.resolveMap = resolveMap
    const jpath = path.join(this.options.cms.data, path.join(...this.options.cms.ns), name, 'json')
    const apath = path.join(this.options.cms.data, path.join(...this.options.cms.ns), name, 'blob')
    const key = JSON.stringify({ name })
    this.options.cms.gJStoreMap = this.options.cms.gJStoreMap || {}
    this.options.cms.gFStoreMap = this.options.cms.gFStoreMap || {}
    this.json = this.options.cms.gJStoreMap[key] || (this.options.cms.gJStoreMap[key] = new JStore(jpath, this.options.cms.mid, this.options, name))
    this.file = this.options.cms.gFStoreMap[key] || (this.options.cms.gFStoreMap[key] = new FStore(apath, this.options.cms.mid, this.options))
    this.json.attachments = this.file
    this.options.resource = this
    this._dbOpened = false
    this.defaultResize = 'autox100'

    // Ensure DB is opened before any operation
    this._openDbPromise = this.json.open().then(() => { this._dbOpened = true })
    this.initDriver()
  }

  /**
   * Recursively cleans an object by removing empty values, null, and undefined properties
   * @param {Object} object - The object to clean
   * @returns {Object} The cleaned object
   */
  clean (object) {
    Object
      .entries(object)
      .forEach(([k, v]) => {
        if (v && _.isObject(v)) {
          this.clean(v)
        }
        if (v && _.isObject(v) && !Object.keys(v).length || v === null || v === undefined) {
          if (_.isArray(object)) {
            object.splice(k, 1)
          } else {
            if (_.isArray(v) && v.length === 0) {
              logger.info(`Will not clean ${k}`)
            } else {
              delete object[k]
            }
          }
        }
      })
    return object
  }

  /**
   * Checks if two items are equal, handling deep comparison for objects and arrays
   * @param {*} updateItem - The item to compare (from update)
   * @param {*} cmsItem - The item to compare against (from CMS)
   * @returns {boolean} True if items are equal, false otherwise
   */
  isEqual (updateItem, cmsItem) {
    // an absent value and null mean the same thing (imports null out empty cells)
    if (_.isNil(updateItem) && _.isNil(cmsItem)) {
      return true
    }
    if (_.isPlainObject(updateItem) || _.isArray(updateItem)) {
      if (_.isArray(updateItem) && _.size(updateItem) !== _.size(cmsItem)) {
        return false
      }
      return _.every(_.keys(updateItem), key => cmsItem && this.isEqual(updateItem[key], cmsItem[key]))
    }
    return _.isEqual(updateItem, cmsItem)
  }

  /**
   * Converts a stream to a buffer
   * @param {Stream} attachmentStream - The stream to convert
   * @returns {Promise<Buffer>} A buffer containing the stream data
   */
  async getBufferFromStream (attachmentStream) {
    const parts = await toArray(attachmentStream)
    const buffers = parts.map(part => Buffer.isBuffer(part) ? part : Buffer.from(part))
    return Buffer.concat(buffers)
  }

  /**
   * Finds a record with a unique key and returns its ID
   * @param {Array} errors - Array to collect errors
   * @param {Array} records - Array of records to search
   * @param {string} uniqueKey - The unique key field name
   * @param {*} value - The value to search for
   * @returns {string|undefined} The record ID if found, undefined otherwise
   */
  findRecordWithUniqueKey(errors, records, uniqueKey, value) {
    const v = _.find(records, {[uniqueKey]: value})
    if (_.isUndefined(v) && !_.find(errors, e => e === value)) {
      errors.push(value)
    }
    if (_.get(v, '_id', false)) {
      return v._id
    }
  }

  /**
   * Converts a unique key value to an ID, handling both select and multiselect types
   * @param {*} value - The value to convert
   * @param {string} type - The field type ('select' or 'multiselect')
   * @param {Array} records - Array of records to search
   * @param {string} name - The resource name
   * @param {Array} uniqueKeys - Array of unique key field names
   * @param {Array} errors - Array to collect errors
   * @returns {*} The converted value (ID or array of IDs)
   */
  convertKeyToId (value, type, records, name, uniqueKeys, errors) {
    const uniqueKey = _.first(uniqueKeys)
    if (type === 'select') {
      return this.findRecordWithUniqueKey(errors, records, uniqueKey, value)
    } else if (type === 'multiselect') {
      return _.compact(_.map(value, (key)=> this.findRecordWithUniqueKey(errors, records, uniqueKey, key)))
    }
    return value
  }

  /**
   * Gets the unique key fields for this resource
   * @returns {Array<string>} Array of unique key field names
   * @throws {Error} If no unique key fields are found
   */
  getUniqueKeys () {
    const uniqueKeyField = _.filter(this.options.schema, item => item.unique || item.xlsxKey)
    if (_.isEmpty(uniqueKeyField)) {
      throw new Error(`${this.name} didn't have unique key field`)
    }
    return _.map(uniqueKeyField, 'field')
  }

  /**
   * Sets a JSON key by parsing the string value as JSON
   * @param {Object} item - The item to modify
   * @param {string} key - The key to set
   */
  setJSONKey (item, key) {
    const v = _.get(item, key)
    _.set(item, key, v ? JSON.parse(v) : v)
  }

  /**
   * The type of an upload according to its first bytes, falling back to the type its name suggests. A name that claims
   * an image, or no known type at all, is not believed when the content is not recognisable.
   * @param {Object} upload - createAttachment params (the stream is a file stream when it comes from REST)
   * @param {string|false} declared - the type the file name suggests
   * @returns {Promise<string>}
   */
  async sniffContentType (upload, declared) {
    const file = _.get(upload, 'stream.path')
    if (file) {
      try {
        const detected = await FileType.fromBuffer(await readHead(file))
        if (detected) {
          return detected.mime
        }
      } catch (error) {
        logger.warn('Could not detect the type of an upload:', error.message)
      }
    }
    return declared && !_.includes(imageTypes, declared) ? declared : 'application/octet-stream'
  }

  /**
   * Generates an import map by comparing import data with existing CMS data
   * @param {Array} importList - List of items to import
   * @param {Object} query - Optional query filter
   * @param {boolean} isCheckRequired - Whether to check required fields
   * @returns {Promise<Object>} Object containing create, update, and remove arrays
   * @throws {RequiredFieldError} If required fields are missing
   */
  async getImportMap (importList, query, isCheckRequired) {
    let errors = []
    let cmsList = await this.list()
    const uniqueKeys = this.getUniqueKeys()
    const schema = this.options.schema
    await pAll(_.map(schema, field => {
      return async () => {
        if (field.input === 'object') {
          _.each(importList, item => {
            if (field.locales) {
              _.each(field.locales, locale => {
                this.setJSONKey(item, `${field.field}.${locale}`)
              })
            } else {
              this.setJSONKey(item, field.field)
            }
          })
        }
        if (!_.isString(field.source)) {
          return
        }
        try {
          const relationUniqueKeys = this.api(field.source).getUniqueKeys()
          const dependencyRecords = await this.api(field.source).list()
          _.each(importList, item => {
            const keyObj = _.pick(item, uniqueKeys)
            if (field.locales) {
              _.each(field.locales, locale => {
                let v = _.get(item, `${field.field}.${locale}`)
                let oldKey = v
                if (_.isEmpty(v)) {
                  return _.set(item, `${field.field}.${locale}`, null)
                }
                v = this.convertKeyToId(v, field.input, dependencyRecords, field.source, relationUniqueKeys, errors)
                if (isCheckRequired && field.required && (_.isUndefined(v) || (!_.isArray(v) && _.isEmpty(v)))) {
                  throw new RequiredFieldError(`record (${JSON.stringify(keyObj)}), required field (${field.field}) and value (${oldKey}) is invalid`)
                }
                _.set(item, `${field.field}.${locale}`, v)
              })
            } else {
              let v = _.get(item, field.field)
              let oldKey = v
              if (_.isEmpty(v)) {
                return _.set(item, field.field, null)
              }
              v = this.convertKeyToId(v, field.input, dependencyRecords, field.source, relationUniqueKeys, errors)
              if (isCheckRequired && field.required && (_.isUndefined(v) || (!_.isArray(v) && _.isEmpty(v)))) {
                throw new RequiredFieldError(`record (${JSON.stringify(keyObj)}), required field (${field.field}) and value (${oldKey}) is invalid`)
              }
              _.set(item, field.field, v)
            }
          })
          // update query
          let v = _.get(query, field.field)
          if (query && v) {
            v = this.convertKeyToId(v, field.input, dependencyRecords, field.source, relationUniqueKeys, errors)
            _.set(query, field.field, v)
          }
        } catch (error) {
          if (error instanceof RequiredFieldError) {
            throw error
          }
          logger.warn(error.message)
        }
      }
    }))
    if (!_.isEmpty(errors)) {
      logger.error(`Records ${_.join(errors, ', ')} not found in ${this.name} resource`)
    }
    // _.find(list, _.pick(item, uniqueKeys)) walks the list for every item: N x M comparisons. When the unique key of the
    // item is made of plain values, the records that can match are the ones with the same values, which a map finds at once.
    // Anything else (a value that is an object, a key the item does not have) keeps the exact search of lodash.
    const isPlain = (value) => _.isString(value) || _.isNumber(value) || _.isBoolean(value)
    const signatureOf = (picked) => _.every(uniqueKeys, key => _.has(picked, key) && isPlain(picked[key]))
      ? JSON.stringify(_.map(uniqueKeys, key => [typeof picked[key], picked[key]]))
      : null
    const indexOf = (list) => {
      const index = new Map()
      _.each(list, (item) => {
        const signature = signatureOf(_.pick(item, uniqueKeys))
        if (signature !== null) {
          index.set(signature, index.get(signature) || item)
        }
      })
      return index
    }
    const finder = (list) => {
      const index = indexOf(list)
      return (item) => {
        const picked = _.pick(item, uniqueKeys)
        const signature = signatureOf(picked)
        return signature === null ? _.find(list, picked) : index.get(signature)
      }
    }
    const findInImport = finder(importList)
    const findInCms = finder(cmsList)
    const removeItem = _.filter(cmsList, item => !findInImport(item))
    const createItem = _.filter(importList, item => !findInCms(item))
    let updateItem = _.difference(importList, createItem)
    if (query) {
      // the query is a MongoDB style query ($in, $gt...): _.filter would read it as a plain object to match
      const findInFiltered = finder(_.filter(cmsList, sift(sanitizeQuery(query))))
      updateItem = _.filter(updateItem, item => findInFiltered(item))
    }
    updateItem = _.filter(updateItem, updateItem => {
      const cmsItem = findInCms(updateItem)
      updateItem._id = cmsItem._id
      return !this.isEqual(updateItem, cmsItem)
    })
    return {create: createItem, update: updateItem, remove: removeItem}
  }

  /**
   * Gets the schema for a paragraph type
   * @param {string} type - The paragraph type
   * @returns {Array} The schema array for the paragraph type
   */
  getParagraphSchema(type) {
    return _.get(this.cms._paragraphs, `${type}.schema`, [])
  }

  /**
   * Broadcasts an action to all connected clients via WebSocket
   * @param {string} action - The action type (create, update, remove, etc.)
   * @param {Object} context - The context object containing resource and result data
   */
  broadcast(action, context) {
    const resource = _.get(context, 'options.name', false)
    if (_.startsWith(resource, '_')) {
      return
    }
    this.cms.broadcast({
      action,
      data: {
        resource,
        _id: _.get(context, '_result._id', false),
        _updatedBy: _.get(context, '_result._updatedBy', false)
      }
    })
  }

  async handleReplication(context) {
    const replicator = this.cms.$replicator
    const shouldReplicate = _.isFunction(_.get(replicator, 'syncRecord', false)) && this.options.type !== 'normal' &&
      // without a peer there is nothing to sync, and no reason to log an error for every write
      (!_.isFunction(replicator.hasPeers) || replicator.hasPeers(context.options.name))
    if (shouldReplicate) {
      try {
        await this.cms.$replicator.syncRecord(context.options.name, _.get(context, '_result._id'))
      } catch (err) {
        logger.error('Replicator syncRecord after create failed:', err)
      }
    }
  }

  /**
   * Initializes the driver with all CRUD operations and middleware
   * Sets up read, list, find, exists, create, update, remove operations
   * and attachment-related operations (create, update, find, remove)
   */
  initDriver () {
    // Store reference for middleware and hooks - no longer building dynamic methods
    this._driver = new Driver(this.name, this.options)
    this._driver.use((context) => {
      context.resource = context.options.resource
      return context.next()
    })
    // Setup hooks for each method but don't define them dynamically
    this.setupDriverHooks()
    // Build the driver for backward compatibility with plugins
    const builtMethods = this._driver.build()
    // read, list, find, exists, create, update, remove and the attachment methods are attached to the instance here
    // (they are not class methods): they run the hook pipelines defined in setupDriverHooks
    return _.extend(this, builtMethods)
  }

  /**
   * Sets up all the driver hooks and middleware for resource operations
   * @private
   */
  setupDriverHooks() {
    const driver = this._driver
    // read hooks
    driver.define('read', ['query?', 'options?'], Driver.Driver._readImpl)
    driver.after('read', h.filterResults)
    // list hooks
    driver.before('list', h.getDependencyItems.bind(this))
    driver.define('list', ['query?', 'options?'], Driver.Driver._listImpl)
    // find hooks
    driver.before('find', h.getDependencyItems.bind(this))
    driver.define('find', ['query', 'options?'], Driver.Driver._findImpl)
    // exists
    driver.define('exists', ['query'], Driver.Driver._existsImpl)
    // create hooks
    driver.before('create', h.normalizeSchema)
    driver.before('create', (context) => {
      const now = Date.now()
      _.extend(context.params.object, {
        _id: context.options.cms.uuid(),
        _createdAt: now,
        _updatedAt: now,
        _publishedAt: null
      })
      return context.next()
    })
    driver.before('create', h.getDependencyItems.bind(this))
    // serialize creates: the limit and unique checks below must be atomic with the insert
    driver.before('create', h.lockResource)
    driver.before('create', h.checkResourceLimits)
    driver.before('create', h.checkUniqueFields)
    driver.define('create', ['object', 'options?'], Driver.Driver._createImpl)
    driver.after('create', h.leaveOneActive)
    driver.after('create', async (context) => {
      this.broadcast('create', context)
      await this.handleReplication(context)
      context.next()
    })
    // update hooks
    driver.before('update', h.normalizeSchema)
    driver.before('update', h.lockResource)
    driver.before('update', h.findRecord)
    driver.before('update', h.checkUniqueFields)
    driver.define('update', ['id', 'object', 'options?'], Driver.Driver._updateImpl)
    driver.after('update', h.leaveOneActive)
    driver.after('update', async (context) => {
      this.broadcast('update', context)
      await this.handleReplication(context)
      context.next()
    })
    // remove hooks
    driver.before('remove', h.enableFirstAsActive)
    driver.before('remove', h.findRecord)
    driver.before('remove', h.refuseForeignRecord)
    driver.before('remove', async context => {
      try {
        await pAll(_.map(context.record._attachments, attachment => {
          return async () => {
            try {
              const field = _.find(context.resource.options.schema, { field: attachment._name })
              if (h.isOSSField(field)) {
                const ossContext = {
                  ...context,
                  attachment: {
                    ...attachment,
                    _filename: attachment._filename || _.get(attachment, '_fields._filename', '')
                  }
                }
                await context.resource.cms.oss.deleteFile(ossContext, field)
              } else {
                // Clean all cached versions of this attachment
                await Driver.Driver.cleanAttachmentCache(context.resource, attachment._id)
                await context.resource.file.remove(attachment._id)
              }
            } catch (error) {
              throw h.removeAttachmentError(context.resource.name, context.record._id, attachment._id, error)
            }
          }
        }), {concurrency: 10})
        context.next()
      } catch (error) {
        context.error(error)
      }
    })
    driver.define('remove', ['id'], Driver.Driver._removeImpl)
    driver.after('remove', async (context) => {
      this.broadcast('remove', context)
      await this.handleReplication(context)
      context.next()
    })
    // attachment hooks
    this.setupAttachmentHooks(driver)
  }

  /**
   * Sets up attachment-related hooks
   * @private
   * @param {Driver} driver - The driver instance
   */
  setupAttachmentHooks(driver) {
    // createAttachment hooks

    driver.before('createAttachment', h.lockResource)
    driver.before('createAttachment', h.findRecord)
    driver.before('createAttachment', async (context) => {
      if (_.get(context, 'params.object.name.length', 0) === 0) {
        return context.error(h.removeAttachmentError(context.resource.name, context.record, null, new Error('missing field name')))
      }
      const obj = context.params.object
      // the name the file was uploaded with (sanitised by the rest plugin under strictUploads); the temporary file's
      // random name only stands in when the caller gives none
      if (!obj.filename) {
        obj.filename = obj.stream.path ? path.basename(obj.stream.path) : ''
      }
      let contentType = mime.lookup(_.get(obj, 'fields._filename', obj.filename))
      if (!contentType) {
        // a name without an extension says nothing: go by the type the client declared, else by the first bytes
        const declared = obj.contentType
        contentType = declared && declared !== 'application/octet-stream' ? declared : await this.sniffContentType(obj, false)
      }
      if (_.get(this.cms, 'security.strictUploads', false)) {
        contentType = await this.sniffContentType(obj, contentType)
      }
      if (_.includes(imageTypes, contentType)) {
        try {
          const streamWithFileType = await FileType.stream(obj.stream)
          const type = streamWithFileType.fileType
          if (type) {
            contentType = mime.lookup(type.ext) || type.mime
            context.params.object.contentType = type.mime || contentType || 'application/octet-stream'
          } else {
            context.params.object.contentType = contentType || 'application/octet-stream'
          }
          // Smart cropping support
          const resize = _.get(obj, 'resize', null)
          if (_.get(obj, 'smart', false)) {
            // the crop comes out at the requested size
            const result = await ImageOptimization.smartCropAttachment(streamWithFileType, resize)
            context.params.object.stream = result.stream
          } else {
            let resizeTo = false
            const field = _.find(context.resource.options.schema, { field: obj.name })
            if (resize) {
              resizeTo = resize
            } else if (_.get(field, 'options.width', false) && _.get(field, 'options.height', false)) {
              resizeTo = `${field.options.width}x${field.options.height}`
            }
            if (resizeTo) {
              const {stream} = await ImageOptimization.resizeAttachment(streamWithFileType, resizeTo, context.params.object.contentType)
              context.params.object.stream = stream
            } else {
              context.params.object.stream = streamWithFileType
            }
          }
        } catch (error) {
          logger.error('Error detecting file type:', error)
          context.params.object.contentType = contentType || 'application/octet-stream'
        }
      } else {
        context.params.object.contentType = contentType
      }
      context.next()
    })
    driver.before('createAttachment', (context) => {
      const obj = context.params.object
      const attachmentId = (context.attachmentId = context.resource.options.cms.uuid())
      // Ensure obj.stream is a valid stream object
      if (!_.isFunction(_.get(obj, 'stream.on', false))) {
        return context.error(h.createAttachmentError(context.resource.name, context.params.id, new Error('Invalid stream object')))
      }
      obj.stream.on('error', async err => {
        try {
          await context.resource.file.remove(attachmentId)
          return context.error(h.createAttachmentError(context.resource.name, context.params.id, err))
        } catch (error) {
          return context.error(h.removeAttachmentError(context.resource.name, context.record, attachmentId, error))
        }
      })
      const field = _.find(context.resource.options.schema, { field: obj.name })
      if (h.isOSSField(field)) {
        context.resource.cms.oss.uploadStream(context, field).then((result) => {
          logger.info(`Successfully uploaded to OSS: ${result.name}`)
          context.size = result.size
          context.next()
        }).catch((error) => {
          logger.error('OSS upload failed:', error)
          context.error(h.createAttachmentError(context.resource.name, context.params.id, error))
        })
        return obj.stream
      }
      const hash = crypto.createHash('md5')
      const writeStream = context.resource.file.write(attachmentId)
      context.size = 0
      let md5sum = ''
      obj.stream
        .on('data', chunk => {
          context.size += chunk.length
          hash.update(chunk)
        })
        .on('end', () => {
          md5sum = hash.digest('hex')
          context.md5sum = md5sum
        })
        .pipe(writeStream)
      writeStream.on('finish', async () => {
        const contentType = _.get(context.params.object, 'contentType', 'application/octet-stream')
        if (_.includes(imageTypes, contentType)) {
          const dimensions = await ImageOptimization.getImageDimensions(context.resource.file._dir + attachmentId)
          if (dimensions) {
            context.imageMeta = dimensions
          }
          // logger.info(`Will cache resized img ${attachmentId}-${this.defaultResize} (${contentType})`)
          try {
            const savedFileStream = context.resource.file.read(attachmentId)
            const resizedStream = context.resource.file.write(`${attachmentId}-${this.defaultResize}`)
            const {stream} = await ImageOptimization.resizeAttachment(savedFileStream, this.defaultResize, contentType)
            stream.pipe(resizedStream)
          } catch {
            await context.resource.file.remove(`${attachmentId}-${this.defaultResize}`).catch(() => {})
          }
        }
        context.next()
      })
      return obj.stream
    })
    driver.before('createAttachment', async (context) => {
      try {
        const obj = context.params.object
        const field = _.find(context.resource.options.schema, { field: obj.name })
        const maxCount = _.get(field, 'options.maxCount', -1)
        if (_.get(field, 'input') === 'image' && maxCount !== -1) {
          const oldAttachments = _.filter(context.record._attachments, {_name: obj.name})
          if (maxCount === 1) {
            context.record._attachments = _.difference(context.record._attachments, oldAttachments)
            await context.resource.json.update(context.record._id, context.record)
            await pAll(_.map(oldAttachments, attach => {
              return async () => await context.resource.file.remove(attach._id)
            }), {concurrency: 1})
          } else if (_.get(oldAttachments, 'length', 0) + 1 > maxCount) {
            throw new Error('Adding one more attachment would exceed the limit, will cancel')
          }
        }
        context.next()
      } catch (error) {
        context.error(error)
      }
    })
    driver.define('createAttachment', ['id', 'object'], Driver.Driver._createAttachmentImpl)
    driver.after('createAttachment', async (context) => {
      this.broadcast('createAttachment', context)
      // logger.warn('Created attachment:', context)
      context.next()
    })

    // updateAttachment hooks
    driver.before('updateAttachment', h.lockResource)
    driver.before('updateAttachment', h.findRecord)
    driver.before('updateAttachment', h.findRecordAttachment)
    driver.before('updateAttachment', async context => {
      try {
        // Clean cached versions when attachment is updated
        await Driver.Driver.cleanAttachmentCache(context.resource, context.params.aid)
        context.next()
      } catch (error) {
        logger.error(`Failed to clean attachment cache for ${context.params.aid}:`, error)
        // Don't fail the update if cache cleanup fails
        context.next()
      }
    })
    driver.before('updateAttachment', async context => {
      try {
        const contentType = _.get(context.attachment, '_contentType', '')
        if (_.includes(imageTypes, contentType)) {
          const dimensions = await ImageOptimization.getImageDimensions(context.resource.file._dir + context.params.aid)
          if (dimensions) {
            context.params.object._meta = dimensions
          }
        }
        context.next()
      } catch (error) {
        logger.error('Failed to get image dimensions for update:', error)
        context.next()
      }
    })
    driver.define('updateAttachment', ['id','aid','object'], Driver.Driver._updateAttachmentImpl)
    driver.after('updateAttachment', async (context) => {
      this.broadcast('updateAttachment', context)
      context.next()
    })

    // findFile
    driver.define('findFile', ['aid'], Driver.Driver._findFileImpl)

    // findAttachment hooks
    driver.before('findAttachment', h.findRecord)
    driver.before('findAttachment', h.findRecordAttachment)
    driver.define('findAttachment', ['id', 'aid', 'opts?'], Driver.Driver._findAttachmentImpl)

    // removeAttachment hooks
    driver.before('removeAttachment', h.findRecord)
    driver.before('removeAttachment', h.refuseForeignRecord)
    driver.before('removeAttachment', h.findRecordAttachment)
    driver.before('removeAttachment', async context => {
      try {
        const field = _.find(context.resource.options.schema, { field: context.attachment._name })
        if (h.isOSSField(field)) {
          await context.resource.cms.oss.deleteFile(context, field)
        } else {
          // Clean all cached versions of this attachment
          await Driver.Driver.cleanAttachmentCache(context.resource, context.params.aid)
          // the file is gone when the call answers
          await context.resource.file.remove(context.params.aid)
        }
        return context.next()
      } catch (error) {
        if (error.notFound) {
          return context.error(h.findAttachmentError(context.resource.name, context.params.id, context.params.aid, error))
        }
        return context.error(h.removeAttachmentError(context.resource.name, context.params.id, context.params.aid, error))
      }
    })
    driver.before('removeAttachment', h.lockResource)
    driver.before('removeAttachment', h.findRecord)
    driver.define('removeAttachment', ['id', 'aid'], Driver.Driver._removeAttachmentImpl)
    driver.after('removeAttachment', async (context) => {
      this.broadcast('removeAttachment', context)
      context.next()
    })

    // cleanAttachment
    driver.define('cleanAttachment', [], Driver.Driver._cleanAttachmentImpl)
  }
}

/**
 * @module node-cms/lib/resource
 * @description Node CMS Resource class - implements the ResourceAPI interface
 * @see {@link module:node-cms.ResourceAPI} For the complete API interface
 */

/**
 * Resource class that implements all ResourceAPI methods
 * @class
 * @implements {module:node-cms.ResourceAPI}
 */
exports = module.exports = Resource
